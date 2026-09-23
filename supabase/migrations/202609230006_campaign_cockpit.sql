-- BTL Africa — campaign cockpit extension
-- Additive only: this migration does not alter public.users, public.campaigns,
-- public.user_campaign_assignments or any existing column/function.
-- Apply after the existing campaign and authorization migrations.

create extension if not exists pgcrypto;

create table if not exists public.campaign_cockpit_details (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  client_name text,
  project_owner_id text references public.users(id),
  project_manager_id text references public.users(id),
  finance_owner_id text not null default 'michael-admin' references public.users(id),
  media_owner_id text references public.users(id),
  field_operations_owner_id text references public.users(id),
  authorization_owner_id text references public.users(id),
  it_support_id text not null default '0a6a2520-96bb-474d-87b6-b0eb8fc46cd6' references public.users(id),
  it_backup_id text not null default 'usr-8d3144f8' references public.users(id),
  territory text not null default 'national' check (territory in ('kinshasa', 'interior', 'provincial', 'national')),
  objective text,
  proforma_reference text,
  proforma_url text,
  allocated_budget numeric(14,2) check (allocated_budget is null or allocated_budget >= 0),
  budget_currency text not null default 'USD' check (char_length(trim(budget_currency)) between 3 and 8),
  updated_by text references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_cockpit_details_project_owner_idx
  on public.campaign_cockpit_details (project_owner_id);
create index if not exists campaign_cockpit_details_operations_owner_idx
  on public.campaign_cockpit_details (field_operations_owner_id);

create table if not exists public.campaign_cockpit_supervisors (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  supervisor_id text not null references public.users(id) on delete cascade,
  assigned_by text references public.users(id),
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  constraint campaign_cockpit_supervisor_unique unique (campaign_id, supervisor_id),
  constraint campaign_cockpit_supervisor_not_campaign_owner check (supervisor_id is not null)
);

create index if not exists campaign_cockpit_supervisors_campaign_idx
  on public.campaign_cockpit_supervisors (campaign_id, is_active);

create table if not exists public.campaign_cockpit_milestones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 180),
  kind text not null default 'other' check (kind in ('brief', 'proforma', 'authorization', 'media', 'operations', 'launch', 'reporting', 'other')),
  due_on date not null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'blocked')),
  owner_id text references public.users(id),
  notes text,
  created_by text not null references public.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_cockpit_milestones_campaign_due_idx
  on public.campaign_cockpit_milestones (campaign_id, due_on, status);

alter table public.campaign_cockpit_details enable row level security;
alter table public.campaign_cockpit_supervisors enable row level security;
alter table public.campaign_cockpit_milestones enable row level security;
revoke all on table public.campaign_cockpit_details from anon, authenticated;
revoke all on table public.campaign_cockpit_supervisors from anon, authenticated;
revoke all on table public.campaign_cockpit_milestones from anon, authenticated;

create or replace function public.campaign_cockpit_actor_role(p_actor_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.users u where u.id = p_actor_id;
$$;

grant execute on function public.campaign_cockpit_actor_role(text) to anon, authenticated;

create or replace function public.list_campaign_cockpit_users(p_actor_id text)
returns table (
  id text,
  full_name text,
  role text,
  user_category text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_cockpit_access_required' using errcode = '42501';
  end if;
  return query
    select u.id, u.full_name, u.role, u.user_category, u.avatar_url
    from public.users u
    order by lower(u.full_name), u.id;
end;
$function$;

grant execute on function public.list_campaign_cockpit_users(text) to anon, authenticated;

create or replace function public.list_campaign_cockpit_details(p_actor_id text)
returns setof public.campaign_cockpit_details
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_cockpit_access_required' using errcode = '42501';
  end if;
  return query
    select d.*
    from public.campaign_cockpit_details d
    join public.campaigns c on c.id = d.campaign_id
    order by c.status asc, c.name asc;
end;
$function$;

grant execute on function public.list_campaign_cockpit_details(text) to anon, authenticated;

create or replace function public.list_campaign_cockpit_supervisors(p_actor_id text)
returns setof public.campaign_cockpit_supervisors
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_cockpit_access_required' using errcode = '42501';
  end if;
  return query
    select s.*
    from public.campaign_cockpit_supervisors s
    where s.is_active = true
    order by s.assigned_at desc;
end;
$function$;

grant execute on function public.list_campaign_cockpit_supervisors(text) to anon, authenticated;

create or replace function public.list_campaign_cockpit_milestones(p_actor_id text)
returns setof public.campaign_cockpit_milestones
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('supervisor', 'sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_cockpit_access_required' using errcode = '42501';
  end if;
  return query
    select m.*
    from public.campaign_cockpit_milestones m
    where m.status <> 'done' or m.due_on >= current_date - 30
    order by m.due_on asc, m.created_at asc;
end;
$function$;

grant execute on function public.list_campaign_cockpit_milestones(text) to anon, authenticated;

create or replace function public.upsert_campaign_cockpit_details(
  p_actor_id text,
  p_campaign_id uuid,
  p_client_name text,
  p_project_owner_id text,
  p_project_manager_id text,
  p_media_owner_id text,
  p_field_operations_owner_id text,
  p_authorization_owner_id text,
  p_territory text,
  p_objective text,
  p_proforma_reference text,
  p_proforma_url text,
  p_allocated_budget numeric,
  p_budget_currency text
)
returns public.campaign_cockpit_details
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  saved public.campaign_cockpit_details;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_cockpit_edit_requires_coordination' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    raise exception 'campaign_not_found' using errcode = '22023';
  end if;
  if p_project_manager_id is not null and not exists (
    select 1 from public.users u where u.id = p_project_manager_id and u.role in ('sub_admin', 'admin', 'super_admin')
  ) then
    raise exception 'invalid_project_manager' using errcode = '22023';
  end if;
  if p_field_operations_owner_id is not null and not exists (
    select 1 from public.users u where u.id = p_field_operations_owner_id and u.role in ('supervisor', 'sub_admin', 'admin', 'super_admin')
  ) then
    raise exception 'invalid_operations_owner' using errcode = '22023';
  end if;
  if p_territory not in ('kinshasa', 'interior', 'provincial', 'national') then
    raise exception 'invalid_campaign_territory' using errcode = '22023';
  end if;
  if p_allocated_budget is not null and p_allocated_budget < 0 then
    raise exception 'invalid_campaign_budget' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users u where u.id = 'michael-admin' and lower(u.full_name) like '%michael%') then
    raise exception 'fixed_finance_owner_missing' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.users u where u.id = '0a6a2520-96bb-474d-87b6-b0eb8fc46cd6') then
    raise exception 'fixed_it_support_missing' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.users u where u.id = 'usr-8d3144f8') then
    raise exception 'fixed_it_backup_missing' using errcode = 'P0002';
  end if;

  insert into public.campaign_cockpit_details (
    campaign_id, client_name, project_owner_id, project_manager_id,
    finance_owner_id, media_owner_id, field_operations_owner_id,
    authorization_owner_id, it_support_id, it_backup_id, territory,
    objective, proforma_reference, proforma_url, allocated_budget,
    budget_currency, updated_by, updated_at
  ) values (
    p_campaign_id, nullif(trim(p_client_name), ''), nullif(trim(p_project_owner_id), ''),
    nullif(trim(p_project_manager_id), ''), 'michael-admin', nullif(trim(p_media_owner_id), ''),
    nullif(trim(p_field_operations_owner_id), ''), nullif(trim(p_authorization_owner_id), ''),
    '0a6a2520-96bb-474d-87b6-b0eb8fc46cd6', 'usr-8d3144f8', p_territory,
    nullif(trim(p_objective), ''), nullif(trim(p_proforma_reference), ''),
    nullif(trim(p_proforma_url), ''), p_allocated_budget,
    coalesce(nullif(upper(trim(p_budget_currency)), ''), 'USD'), p_actor_id, now()
  )
  on conflict (campaign_id) do update set
    client_name = excluded.client_name,
    project_owner_id = excluded.project_owner_id,
    project_manager_id = excluded.project_manager_id,
    finance_owner_id = 'michael-admin',
    media_owner_id = excluded.media_owner_id,
    field_operations_owner_id = excluded.field_operations_owner_id,
    authorization_owner_id = excluded.authorization_owner_id,
    it_support_id = '0a6a2520-96bb-474d-87b6-b0eb8fc46cd6',
    it_backup_id = 'usr-8d3144f8',
    territory = excluded.territory,
    objective = excluded.objective,
    proforma_reference = excluded.proforma_reference,
    proforma_url = excluded.proforma_url,
    allocated_budget = excluded.allocated_budget,
    budget_currency = excluded.budget_currency,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$function$;

grant execute on function public.upsert_campaign_cockpit_details(text, uuid, text, text, text, text, text, text, text, text, text, text, numeric, text) to anon, authenticated;

create or replace function public.sync_campaign_cockpit_supervisors(
  p_actor_id text,
  p_campaign_id uuid,
  p_supervisor_ids text[]
)
returns setof public.campaign_cockpit_supervisors
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  supervisor_id text;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_supervisors_edit_requires_coordination' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    raise exception 'campaign_not_found' using errcode = '22023';
  end if;

  update public.campaign_cockpit_supervisors
  set is_active = false, assigned_by = p_actor_id
  where campaign_id = p_campaign_id and is_active = true
    and not (supervisor_id = any(coalesce(p_supervisor_ids, '{}'::text[])));

  foreach supervisor_id in array coalesce(p_supervisor_ids, '{}'::text[]) loop
    if not exists (
      select 1 from public.users u
      where u.id = supervisor_id and u.role in ('supervisor', 'sub_admin', 'admin', 'super_admin')
    ) then
      raise exception 'invalid_campaign_supervisor' using errcode = '22023';
    end if;
    insert into public.campaign_cockpit_supervisors (campaign_id, supervisor_id, assigned_by, is_active, assigned_at)
    values (p_campaign_id, supervisor_id, p_actor_id, true, now())
    on conflict (campaign_id, supervisor_id) do update set
      is_active = true, assigned_by = p_actor_id, assigned_at = now();
  end loop;

  return query
    select s.* from public.campaign_cockpit_supervisors s
    where s.campaign_id = p_campaign_id and s.is_active = true
    order by s.assigned_at desc;
end;
$function$;

grant execute on function public.sync_campaign_cockpit_supervisors(text, uuid, text[]) to anon, authenticated;

create or replace function public.create_campaign_cockpit_milestone(
  p_actor_id text,
  p_campaign_id uuid,
  p_title text,
  p_kind text,
  p_due_on date,
  p_status text,
  p_owner_id text,
  p_notes text
)
returns public.campaign_cockpit_milestones
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  saved public.campaign_cockpit_milestones;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_milestone_edit_requires_coordination' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    raise exception 'campaign_not_found' using errcode = '22023';
  end if;
  if p_kind not in ('brief', 'proforma', 'authorization', 'media', 'operations', 'launch', 'reporting', 'other') then
    raise exception 'invalid_milestone_kind' using errcode = '22023';
  end if;
  if p_status not in ('planned', 'in_progress', 'done', 'blocked') then
    raise exception 'invalid_milestone_status' using errcode = '22023';
  end if;
  if nullif(trim(p_title), '') is null or p_due_on is null then
    raise exception 'milestone_title_and_date_required' using errcode = '22023';
  end if;

  insert into public.campaign_cockpit_milestones (
    campaign_id, title, kind, due_on, status, owner_id, notes, created_by,
    completed_at, updated_at
  ) values (
    p_campaign_id, trim(p_title), p_kind, p_due_on, p_status,
    nullif(trim(p_owner_id), ''), nullif(trim(p_notes), ''), p_actor_id,
    case when p_status = 'done' then now() else null end, now()
  ) returning * into saved;
  return saved;
end;
$function$;

grant execute on function public.create_campaign_cockpit_milestone(text, uuid, text, text, date, text, text, text) to anon, authenticated;

create or replace function public.update_campaign_cockpit_milestone(
  p_actor_id text,
  p_milestone_id uuid,
  p_status text
)
returns public.campaign_cockpit_milestones
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text;
  saved public.campaign_cockpit_milestones;
begin
  actor_role := public.campaign_cockpit_actor_role(p_actor_id);
  if actor_role not in ('sub_admin', 'admin', 'super_admin') then
    raise exception 'campaign_milestone_edit_requires_coordination' using errcode = '42501';
  end if;
  if p_status not in ('planned', 'in_progress', 'done', 'blocked') then
    raise exception 'invalid_milestone_status' using errcode = '22023';
  end if;
  update public.campaign_cockpit_milestones
  set status = p_status,
      completed_at = case when p_status = 'done' then coalesce(completed_at, now()) else null end,
      updated_at = now()
  where id = p_milestone_id
  returning * into saved;
  if saved.id is null then raise exception 'milestone_not_found' using errcode = 'P0002'; end if;
  return saved;
end;
$function$;

grant execute on function public.update_campaign_cockpit_milestone(uuid, uuid, text) to anon, authenticated;

comment on table public.campaign_cockpit_details is
  'Additive project cockpit metadata; existing campaign and user tables remain untouched.';
comment on table public.campaign_cockpit_supervisors is
  'Campaign-scoped cockpit supervisor roster; separate from legacy agency-entry supervisor_id.';
comment on table public.campaign_cockpit_milestones is
  'Operational deadlines and checkpoints for campaign delivery.';
