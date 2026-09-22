-- BTL Africa — campaign authorizations
-- This migration reuses public.users and public.campaigns from the shared BTL database.
-- Apply this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.campaign_authorizations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  reference text,
  label text not null check (char_length(trim(label)) between 2 and 180),
  recipient_name text,
  contact_service text not null check (char_length(trim(contact_service)) between 2 and 180),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  valid_from date,
  valid_until date,
  is_permanent boolean not null default false,
  description text,
  status text not null default 'pending' check (status in ('pending', 'received')),
  received_at timestamptz,
  received_by text references public.users(id),
  received_photo_url text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authorization_validity_check check (
    is_permanent = true
    or valid_from is null
    or valid_until is not null
  ),
  constraint authorization_dates_order_check check (
    valid_from is null
    or valid_until is null
    or valid_until >= valid_from
  ),
  constraint authorization_received_check check (
    status = 'pending'
    or (received_at is not null and received_by is not null and received_photo_url is not null)
  )
);

create index if not exists campaign_authorizations_campaign_idx
  on public.campaign_authorizations (campaign_id, status, created_at desc);
create index if not exists campaign_authorizations_validity_idx
  on public.campaign_authorizations (valid_until, is_permanent);

alter table public.campaign_authorizations enable row level security;

create or replace function public.authorization_actor_role(p_actor_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.users u where u.id = p_actor_id;
$$;

create or replace function public.list_authorization_campaigns(p_actor_id text)
returns setof public.campaigns
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.authorization_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'authorization_access_required' using errcode = '42501';
  end if;

  return query
    select c.*
    from public.campaigns c
    order by c.status asc, c.name asc;
end;
$function$;

grant execute on function public.authorization_actor_role(text) to anon, authenticated;
grant execute on function public.list_authorization_campaigns(text) to anon, authenticated;

create or replace function public.list_campaign_authorizations(
  p_actor_id text,
  p_campaign_id uuid
)
returns setof public.campaign_authorizations
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.authorization_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'authorization_access_required' using errcode = '42501';
  end if;

  return query
    select a.*
    from public.campaign_authorizations a
    where a.campaign_id = p_campaign_id
    order by case when a.status = 'pending' then 0 else 1 end,
      case a.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      a.valid_until nulls last,
      a.created_at desc;
end;
$function$;

grant execute on function public.list_campaign_authorizations(text, uuid) to anon, authenticated;

create or replace function public.create_authorization_campaign(
  p_actor_id text,
  p_code text,
  p_name text,
  p_campaign_type text,
  p_status text default 'draft',
  p_starts_on date default null,
  p_ends_on date default null
)
returns setof public.campaigns
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  created_campaign public.campaigns;
begin
  actor_role := public.authorization_actor_role(p_actor_id);
  if actor_role not in ('admin', 'super_admin') then
    raise exception 'campaign_creation_requires_admin' using errcode = '42501';
  end if;
  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'campaign_code_and_name_required' using errcode = '22023';
  end if;
  if p_status not in ('active', 'draft', 'paused') then
    raise exception 'invalid_campaign_status' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on then
    raise exception 'campaign_dates_invalid' using errcode = '22023';
  end if;

  insert into public.campaigns (code, name, campaign_type, status, starts_on, ends_on)
  values (lower(trim(p_code)), trim(p_name), coalesce(nullif(trim(p_campaign_type), ''), 'operations'), p_status, p_starts_on, p_ends_on)
  returning * into created_campaign;

  return next created_campaign;
end;
$function$;

grant execute on function public.create_authorization_campaign(text, text, text, text, text, date, date) to anon, authenticated;

create or replace function public.create_campaign_authorization(
  p_actor_id text,
  p_campaign_id uuid,
  p_reference text,
  p_label text,
  p_recipient_name text,
  p_contact_service text,
  p_priority text,
  p_valid_from date,
  p_valid_until date,
  p_is_permanent boolean,
  p_description text
)
returns setof public.campaign_authorizations
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  created_authorization public.campaign_authorizations;
begin
  actor_role := public.authorization_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'authorization_creation_requires_manager' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    raise exception 'campaign_not_found' using errcode = '22023';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid_authorization_priority' using errcode = '22023';
  end if;
  if nullif(trim(p_label), '') is null or nullif(trim(p_contact_service), '') is null then
    raise exception 'authorization_label_and_service_required' using errcode = '22023';
  end if;
  if not p_is_permanent and p_valid_from is not null and p_valid_until is null then
    raise exception 'authorization_end_date_required' using errcode = '22023';
  end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until < p_valid_from then
    raise exception 'authorization_dates_invalid' using errcode = '22023';
  end if;

  insert into public.campaign_authorizations (
    campaign_id, reference, label, recipient_name, contact_service, priority,
    valid_from, valid_until, is_permanent, description, created_by
  ) values (
    p_campaign_id, nullif(trim(p_reference), ''), trim(p_label), nullif(trim(p_recipient_name), ''),
    trim(p_contact_service), p_priority, p_valid_from, case when p_is_permanent then null else p_valid_until end,
    p_is_permanent, nullif(trim(p_description), ''), p_actor_id
  ) returning * into created_authorization;

  return next created_authorization;
end;
$function$;

grant execute on function public.create_campaign_authorization(text, uuid, text, text, text, text, text, date, date, boolean, text) to anon, authenticated;

create or replace function public.update_campaign_authorization(
  p_actor_id text,
  p_authorization_id uuid,
  p_reference text,
  p_label text,
  p_recipient_name text,
  p_contact_service text,
  p_priority text,
  p_valid_from date,
  p_valid_until date,
  p_is_permanent boolean,
  p_description text
)
returns setof public.campaign_authorizations
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  updated_authorization public.campaign_authorizations;
begin
  actor_role := public.authorization_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'authorization_edit_requires_manager' using errcode = '42501';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid_authorization_priority' using errcode = '22023';
  end if;
  if nullif(trim(p_label), '') is null or nullif(trim(p_contact_service), '') is null then
    raise exception 'authorization_label_and_service_required' using errcode = '22023';
  end if;
  if not p_is_permanent and p_valid_from is not null and p_valid_until is null then
    raise exception 'authorization_end_date_required' using errcode = '22023';
  end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until < p_valid_from then
    raise exception 'authorization_dates_invalid' using errcode = '22023';
  end if;

  update public.campaign_authorizations a
  set reference = nullif(trim(p_reference), ''),
      label = trim(p_label),
      recipient_name = nullif(trim(p_recipient_name), ''),
      contact_service = trim(p_contact_service),
      priority = p_priority,
      valid_from = p_valid_from,
      valid_until = case when p_is_permanent then null else p_valid_until end,
      is_permanent = p_is_permanent,
      description = nullif(trim(p_description), ''),
      updated_at = now()
  where a.id = p_authorization_id
  returning * into updated_authorization;

  if updated_authorization.id is null then
    raise exception 'authorization_not_found' using errcode = 'P0002';
  end if;
  return next updated_authorization;
end;
$function$;

grant execute on function public.update_campaign_authorization(text, uuid, text, text, text, text, text, date, date, boolean, text) to anon, authenticated;

create or replace function public.mark_campaign_authorization_received(
  p_authorization_id uuid,
  p_receiver_id text,
  p_received_photo_url text
)
returns setof public.campaign_authorizations
language plpgsql
security definer
set search_path = public
as $function$
declare
  receiver_role text;
  received_authorization public.campaign_authorizations;
begin
  receiver_role := public.authorization_actor_role(p_receiver_id);
  if receiver_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'authorization_receiver_requires_manager' using errcode = '42501';
  end if;
  if nullif(trim(p_received_photo_url), '') is null then
    raise exception 'received_photo_required' using errcode = '22023';
  end if;
  if length(p_received_photo_url) > 900000 then
    raise exception 'received_photo_too_large' using errcode = '22023';
  end if;

  update public.campaign_authorizations a
  set status = 'received', received_at = now(), received_by = p_receiver_id,
      received_photo_url = p_received_photo_url, updated_at = now()
  where a.id = p_authorization_id
  returning * into received_authorization;

  if received_authorization.id is null then
    raise exception 'authorization_not_found' using errcode = 'P0002';
  end if;
  return next received_authorization;
end;
$function$;

grant execute on function public.mark_campaign_authorization_received(uuid, text, text) to anon, authenticated;
