import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isValidMsisdn, normalizePhone } from "./phone";

export type UserRole = "agent" | "supervisor" | "sub_admin" | "admin" | "super_admin";
export type CampaignType = "hostess" | "brand_ambassador" | "operations";
export type AuthorizationPriority = "low" | "normal" | "high" | "urgent";
export type AuthorizationStatus = "pending" | "received";

export type UserProfile = {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  user_category: string | null;
  avatar_url: string | null;
  profile_updated_at: string | null;
};

export const AUTHORIZATION_ROLES: UserRole[] = ["supervisor", "sub_admin", "admin", "super_admin"];

export function canAccessAuthorizations(role: UserRole): boolean {
  return AUTHORIZATION_ROLES.includes(role);
}

export type CampaignRecord = {
  id: string;
  code: string;
  name: string;
  campaign_type: CampaignType | string;
  status: "active" | "draft" | "paused" | string;
  starts_on: string | null;
  ends_on: string | null;
  daily_pos_target?: number | null;
  transactions_per_pos_target?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type AuthorizationRecord = {
  id: string;
  campaign_id: string;
  reference: string | null;
  label: string;
  recipient_name: string | null;
  contact_service: string;
  priority: AuthorizationPriority;
  valid_from: string | null;
  valid_until: string | null;
  is_permanent: boolean;
  description: string | null;
  status: AuthorizationStatus;
  received_at: string | null;
  received_by: string | null;
  received_photo_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AuthorizationInput = {
  campaignId: string;
  reference: string | null;
  label: string;
  recipientName: string | null;
  contactService: string;
  priority: AuthorizationPriority;
  validFrom: string | null;
  validUntil: string | null;
  isPermanent: boolean;
  description: string | null;
};

export type SupabaseConnection = { url: string; publishableKey: string };

const runtimeKey = "btl-supabase-connection";
const profileKey = "btl-authorization-profile";
const defaultConnection: SupabaseConnection = {
  url: "https://upkzlppvwckriuidnyvq.supabase.co",
  publishableKey: "sb_publishable_36S8t4yZQhYXXMZa3p9ldg_EWnP8gPL",
};
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

function readRuntimeConnection(): SupabaseConnection | null {
  try {
    const raw = localStorage.getItem(runtimeKey) || sessionStorage.getItem(runtimeKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseConnection>;
    return parsed.url && parsed.publishableKey ? { url: parsed.url, publishableKey: parsed.publishableKey } : null;
  } catch {
    return null;
  }
}

function createConfiguredClient(connection: SupabaseConnection): SupabaseClient {
  return createClient(connection.url, connection.publishableKey);
}

function readStoredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(profileKey);
    return raw ? JSON.parse(raw) as UserProfile : null;
  } catch {
    return null;
  }
}

// This is the shared BTL project. A prior explicit local configuration or
// deployment environment still wins, while a new device uses this default.
let activeConnection: SupabaseConnection | null = readRuntimeConnection() || (envUrl && envKey ? { url: envUrl, publishableKey: envKey } : defaultConnection);
let supabaseClient: SupabaseClient | null = activeConnection ? createConfiguredClient(activeConnection) : null;
let activeProfile: UserProfile | null = readStoredProfile();

export function getSupabaseConnection(): SupabaseConnection | null { return activeConnection; }
export function isSupabaseConfigured(): boolean { return Boolean(activeConnection && supabaseClient); }
export function getStoredProfile(): UserProfile | null { return activeProfile; }

export function configureSupabase(url: string, publishableKey: string): SupabaseConnection {
  const normalizedUrl = url.trim().replace(/\/$/, "");
  const normalizedKey = publishableKey.trim();
  if (!/^https:\/\/[^\s]+\.supabase\.co$/i.test(normalizedUrl)) throw new Error("L’URL Supabase doit ressembler à https://votre-projet.supabase.co.");
  if (normalizedKey.length < 20 || normalizedKey.toLowerCase().includes("service_role")) throw new Error("Utilisez uniquement la clé publishable/anon, jamais la clé service_role.");
  activeConnection = { url: normalizedUrl, publishableKey: normalizedKey };
  supabaseClient = createConfiguredClient(activeConnection);
  activeProfile = null;
  localStorage.setItem(runtimeKey, JSON.stringify(activeConnection));
  sessionStorage.setItem(runtimeKey, JSON.stringify(activeConnection));
  localStorage.removeItem(profileKey);
  return activeConnection;
}

export function clearSupabaseConnection(): void {
  activeConnection = null;
  supabaseClient = null;
  activeProfile = null;
  localStorage.removeItem(profileKey);
  localStorage.removeItem(runtimeKey);
  sessionStorage.removeItem(runtimeKey);
}

export async function testSupabaseConnection(url: string, publishableKey: string): Promise<void> {
  const normalizedUrl = url.trim().replace(/\/$/, "");
  const key = publishableKey.trim();
  if (!normalizedUrl || !key) throw new Error("Renseignez l’URL et la clé publishable.");
  const response = await fetch(`${normalizedUrl}/rest/v1/users?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (response.status === 401) throw new Error("Clé Supabase refusée.");
  if (![200, 206, 403].includes(response.status)) throw new Error(`Connexion refusée (${response.status}).`);
}

const userColumns = "id,full_name,phone,role,user_category,avatar_url,profile_updated_at";

function first<T>(data: T | T[]): T | null { return Array.isArray(data) ? data[0] || null : data || null; }
function assertClient(): SupabaseClient { if (!supabaseClient) throw new Error("Configurez Supabase avant de continuer."); return supabaseClient; }
function asProfile(row: unknown): UserProfile { return row as UserProfile; }
function asCampaign(row: unknown): CampaignRecord { return row as CampaignRecord; }
function asAuthorization(row: unknown): AuthorizationRecord { return row as AuthorizationRecord; }

export async function signIn(phone: string, password: string): Promise<UserProfile> {
  const client = assertClient();
  const normalized = normalizePhone(phone);
  if (!isValidMsisdn(normalized)) throw new Error("Le MSISDN fourni est invalide.");
  const candidates = Array.from(new Set([normalized, `+243${normalized.slice(1)}`]));
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const { data, error } = await client.from("users").select(`${userColumns},password_hash`).eq("phone", candidate).eq("password_hash", password).maybeSingle();
    if (!error && data) {
      const profile = asProfile(data);
      if (!canAccessAuthorizations(profile.role)) {
        localStorage.removeItem(profileKey);
        throw new Error("Ce compte n’a pas accès au registre des autorisations. Utilisez un compte superviseur ou administratif.");
      }
      activeProfile = profile;
      localStorage.setItem(profileKey, JSON.stringify(profile));
      return profile;
    }
    lastError = error;
  }
  if (lastError) throw lastError;
  throw new Error("MSISDN ou mot de passe incorrect.");
}

export function signOut(): void { activeProfile = null; localStorage.removeItem(profileKey); }

export async function loadCampaigns(actorId: string): Promise<CampaignRecord[]> {
  const { data, error } = await assertClient().rpc("list_authorization_campaigns", { p_actor_id: actorId });
  if (error) throw error;
  return (data || []).map(asCampaign);
}

export async function loadAuthorizations(actorId: string, campaignId: string): Promise<AuthorizationRecord[]> {
  const { data, error } = await assertClient().rpc("list_campaign_authorizations", { p_actor_id: actorId, p_campaign_id: campaignId });
  if (error) throw error;
  return (data || []).map(asAuthorization);
}

export async function createCampaign(input: { actorId: string; code: string; name: string; campaignType: CampaignType; status: string; startsOn: string | null; endsOn: string | null }): Promise<CampaignRecord> {
  const { data, error } = await assertClient().rpc("create_authorization_campaign", { p_actor_id: input.actorId, p_code: input.code, p_name: input.name, p_campaign_type: input.campaignType, p_status: input.status, p_starts_on: input.startsOn, p_ends_on: input.endsOn });
  if (error) throw error;
  const campaign = first(data);
  if (!campaign) throw new Error("La campagne n’a pas pu être créée.");
  return asCampaign(campaign);
}

export async function createAuthorization(actorId: string, input: AuthorizationInput): Promise<AuthorizationRecord> {
  const { data, error } = await assertClient().rpc("create_campaign_authorization", { p_actor_id: actorId, p_campaign_id: input.campaignId, p_reference: input.reference, p_label: input.label, p_recipient_name: input.recipientName, p_contact_service: input.contactService, p_priority: input.priority, p_valid_from: input.validFrom, p_valid_until: input.isPermanent ? null : input.validUntil, p_is_permanent: input.isPermanent, p_description: input.description });
  if (error) throw error;
  const authorization = first(data);
  if (!authorization) throw new Error("L’autorisation n’a pas pu être créée.");
  return asAuthorization(authorization);
}

export async function updateAuthorization(actorId: string, id: string, input: AuthorizationInput): Promise<AuthorizationRecord> {
  const { data, error } = await assertClient().rpc("update_campaign_authorization", { p_actor_id: actorId, p_authorization_id: id, p_reference: input.reference, p_label: input.label, p_recipient_name: input.recipientName, p_contact_service: input.contactService, p_priority: input.priority, p_valid_from: input.validFrom, p_valid_until: input.isPermanent ? null : input.validUntil, p_is_permanent: input.isPermanent, p_description: input.description });
  if (error) throw error;
  const authorization = first(data);
  if (!authorization) throw new Error("L’autorisation n’a pas pu être mise à jour.");
  return asAuthorization(authorization);
}

export async function markAuthorizationReceived(actorId: string, authorizationId: string, photoUrl: string): Promise<AuthorizationRecord> {
  const { data, error } = await assertClient().rpc("mark_campaign_authorization_received", { p_authorization_id: authorizationId, p_receiver_id: actorId, p_received_photo_url: photoUrl });
  if (error) throw error;
  const authorization = first(data);
  if (!authorization) throw new Error("La réception n’a pas pu être enregistrée.");
  return asAuthorization(authorization);
}
