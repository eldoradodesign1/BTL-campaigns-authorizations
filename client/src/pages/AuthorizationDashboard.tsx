import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  FilePenLine,
  ImagePlus,
  Info,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  UserCircle2,
  X,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import {
  CampaignCockpit,
  CampaignCockpitForm,
  MilestoneForm,
} from "@/components/CampaignCockpit";
import {
  clearSupabaseConnection,
  canAccessAuthorizations,
  configureSupabase,
  createCockpitMilestone,
  createAuthorization,
  createCampaign,
  getStoredProfile,
  getSupabaseConnection,
  isSupabaseConfigured,
  loadAuthorizations,
  loadCockpitDetails,
  loadCockpitMilestones,
  loadCockpitSupervisors,
  loadCockpitUsers,
  loadCampaigns,
  markAuthorizationReceived,
  signIn,
  signOut,
  syncCockpitSupervisors,
  testSupabaseConnection,
  updateCockpitMilestone,
  updateAuthorization,
  upsertCockpitDetails,
  type AuthorizationInput,
  type AuthorizationPriority,
  type AuthorizationRecord,
  type CampaignCockpitDetail,
  type CampaignCockpitMilestone,
  type CampaignCockpitSupervisor,
  type CockpitUser,
  type CampaignRecord,
  type CampaignType,
  type CockpitMilestoneKind,
  type CockpitMilestoneStatus,
  type CockpitTerritory,
  type UserProfile,
} from "@/lib/supabase";

const ROLE_LABELS: Record<UserProfile["role"], string> = {
  agent: "Agent",
  supervisor: "Superviseur",
  sub_admin: "Coordination",
  admin: "Administrateur",
  super_admin: "Support IT",
};
const PRIORITY_LABELS: Record<AuthorizationPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};
const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  hostess: "Hôtesse",
  brand_ambassador: "Brand Ambassador",
  operations: "Opérations",
};
const TERRITORY_LABELS: Record<CockpitTerritory, string> = {
  kinshasa: "Kinshasa",
  interior: "Intérieur / région",
  provincial: "Provincial",
  national: "National",
};
const MILESTONE_KIND_LABELS: Record<CockpitMilestoneKind, string> = {
  brief: "Brief / cadrage",
  proforma: "Proforma",
  authorization: "Autorisations",
  media: "Médias",
  operations: "Opérations terrain",
  launch: "Lancement",
  reporting: "Reporting",
  other: "Autre",
};
const MILESTONE_STATUS_LABELS: Record<CockpitMilestoneStatus, string> = {
  planned: "Planifié",
  in_progress: "En cours",
  done: "Terminé",
  blocked: "Bloqué",
};
const EMPTY_AUTH: AuthorizationInput = {
  campaignId: "",
  reference: "",
  label: "",
  recipientName: "",
  contactService: "",
  priority: "normal",
  validFrom: "",
  validUntil: "",
  isPermanent: false,
  description: "",
};
const EMPTY_COCKPIT_DETAIL: Omit<
  CampaignCockpitDetail,
  "campaign_id" | "finance_owner_id" | "it_support_id" | "it_backup_id"
> = {
  client_name: "",
  project_owner_id: "",
  project_manager_id: "",
  media_owner_id: "",
  field_operations_owner_id: "",
  authorization_owner_id: "",
  territory: "national",
  objective: "",
  proforma_reference: "",
  proforma_url: "",
  allocated_budget: null,
  budget_currency: "USD",
  updated_by: null,
  updated_at: undefined,
};

type Notice = { kind: "success" | "error"; message: string } | null;
type ModalProps = {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
};

type SelectProps = {
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  label: string;
};
function CustomSelect({
  value,
  placeholder,
  options,
  onChange,
  label,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected =
    options.find(option => option.value === value)?.label || placeholder;
  return (
    <div className={`custom-select ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="select-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span>{selected}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="select-backdrop"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div className="select-menu">
            {options.map(option => (
              <button
                type="button"
                key={option.value}
                className={option.value === value ? "is-selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
                {option.value === value && <Check size={13} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ children, onClose, wide = false }: ModalProps) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className={`modal-card ${wide ? "modal-wide" : ""}`}>{children}</div>
    </div>,
    document.body
  );
}

function readableError(error: unknown, fallback: string): string {
  const candidate = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  const detail = [candidate?.message, candidate?.details, candidate?.hint]
    .filter(Boolean)
    .join(" · ");
  return detail
    ? `${fallback} (${detail}${candidate?.code ? ` · code ${candidate.code}` : ""})`
    : fallback;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const target = new Date(`${value}T23:59:59`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function AuthorizationForm({
  value,
  campaigns,
  editing,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  value: AuthorizationInput;
  campaigns: CampaignRecord[];
  editing: boolean;
  busy: boolean;
  onChange: (next: AuthorizationInput) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const availableCampaigns = campaigns.filter(
    campaign => campaign.status !== "paused"
  );
  return (
    <form className="modal-form" onSubmit={onSubmit}>
      <div className="modal-header">
        <div>
          <div className="eyebrow">
            <Archive size={14} />{" "}
            {editing ? "Mise à jour" : "Nouvelle autorisation"}
          </div>
          <h2>
            {editing
              ? "Modifier l’autorisation"
              : "Enregistrer une autorisation"}
          </h2>
          <p>
            Une autorisation démarre en attente jusqu’à réception de sa preuve.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X size={16} />
        </button>
      </div>
      <div className="form-grid two">
        <label>
          <span>
            Libellé <b>*</b>
          </span>
          <input
            value={value.label}
            onChange={event =>
              onChange({ ...value, label: event.target.value })
            }
            placeholder="Ex. Accord accès terrain"
            required
          />
        </label>
        <label>
          <span>Référence interne</span>
          <input
            value={value.reference || ""}
            onChange={event =>
              onChange({ ...value, reference: event.target.value })
            }
            placeholder="Ex. AUT-2026-014"
          />
        </label>
        <label>
          <span>
            Campagne concernée <b>*</b>
          </span>
          <CustomSelect
            value={value.campaignId}
            onChange={campaignId => onChange({ ...value, campaignId })}
            label="Campagne concernée"
            placeholder="Sélectionner une campagne"
            options={availableCampaigns.map(campaign => ({
              value: campaign.id,
              label: campaign.name,
            }))}
          />
        </label>
        <label>
          <span>
            Service contacté / à contacter <b>*</b>
          </span>
          <input
            value={value.contactService}
            onChange={event =>
              onChange({ ...value, contactService: event.target.value })
            }
            placeholder="Ex. Direction magasin"
            required
          />
        </label>
        <label>
          <span>Priorité</span>
          <CustomSelect
            value={value.priority}
            onChange={priority =>
              onChange({
                ...value,
                priority: priority as AuthorizationPriority,
              })
            }
            label="Priorité"
            placeholder="Choisir une priorité"
            options={(
              Object.keys(PRIORITY_LABELS) as AuthorizationPriority[]
            ).map(priority => ({
              value: priority,
              label: PRIORITY_LABELS[priority],
            }))}
          />
        </label>
        <label>
          <span>Destinataire</span>
          <input
            value={value.recipientName || ""}
            onChange={event =>
              onChange({ ...value, recipientName: event.target.value })
            }
            placeholder="Personne ou équipe concernée"
          />
        </label>
      </div>
      <div className="date-panel">
        <div className="date-panel-title">
          <CalendarDays size={15} />
          <div>
            <strong>Période de validité</strong>
            <span>
              La date de début est optionnelle. Si elle est fixée, la date de
              fin est requise sauf autorisation pérenne.
            </span>
          </div>
        </div>
        <div className="form-grid two">
          <label>
            <span>Date de début</span>
            <input
              value={value.validFrom || ""}
              onChange={event =>
                onChange({ ...value, validFrom: event.target.value })
              }
              type="date"
            />
          </label>
          <label>
            <span>
              Date de fin {!value.isPermanent && value.validFrom && <b>*</b>}
            </span>
            <input
              value={value.validUntil || ""}
              onChange={event =>
                onChange({ ...value, validUntil: event.target.value })
              }
              type="date"
              disabled={value.isPermanent}
              required={Boolean(value.validFrom && !value.isPermanent)}
            />
          </label>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={value.isPermanent}
            onChange={event =>
              onChange({
                ...value,
                isPermanent: event.target.checked,
                validUntil: event.target.checked ? "" : value.validUntil,
              })
            }
          />
          <span className="check-box">
            <Check size={12} />
          </span>
          <span>
            <strong>Autorisation pérenne / définitive</strong>
            <small>Elle n’expire pas automatiquement.</small>
          </span>
        </label>
      </div>
      <label>
        <span>Commentaire / description</span>
        <textarea
          value={value.description || ""}
          onChange={event =>
            onChange({ ...value, description: event.target.value })
          }
          placeholder="Contexte, restrictions, points de vigilance…"
          rows={4}
        />
      </label>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          type="submit"
          disabled={busy || !value.campaignId}
        >
          {busy
            ? "Enregistrement…"
            : editing
              ? "Enregistrer les changements"
              : "Créer l’autorisation"}
          <ArrowRight size={14} />
        </button>
      </div>
    </form>
  );
}

export default function AuthorizationDashboard({
  onConnectionChanged,
}: {
  onConnectionChanged: () => void;
}) {
  const [configured, setConfigured] = useState(isSupabaseConfigured());
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const stored = getStoredProfile();
    return stored && canAccessAuthorizations(stored.role) ? stored : null;
  });
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [authorizations, setAuthorizations] = useState<AuthorizationRecord[]>(
    []
  );
  const [cockpitUsers, setCockpitUsers] = useState<CockpitUser[]>([]);
  const [cockpitAvailable, setCockpitAvailable] = useState(false);
  const [cockpitDetails, setCockpitDetails] = useState<CampaignCockpitDetail[]>(
    []
  );
  const [cockpitSupervisors, setCockpitSupervisors] = useState<
    CampaignCockpitSupervisor[]
  >([]);
  const [cockpitMilestones, setCockpitMilestones] = useState<
    CampaignCockpitMilestone[]
  >([]);
  const [cockpitFormOpen, setCockpitFormOpen] = useState(false);
  const [milestoneFormOpen, setMilestoneFormOpen] = useState(false);
  const [campaignAuthorizations, setCampaignAuthorizations] = useState<
    Record<string, AuthorizationRecord[]>
  >({});
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedAuthorization, setSelectedAuthorization] =
    useState<AuthorizationRecord | null>(null);
  const [authorizationDraft, setAuthorizationDraft] =
    useState<AuthorizationInput>(EMPTY_AUTH);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState({
    code: "",
    name: "",
    campaignType: "operations" as CampaignType,
    status: "draft",
    startsOn: "",
    endsOn: "",
  });
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [setupUrl, setSetupUrl] = useState(getSupabaseConnection()?.url || "");
  const [setupKey, setSetupKey] = useState("");
  const [showConfig, setShowConfig] = useState(!configured);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [receivePhoto, setReceivePhoto] = useState("");

  const selectedCampaign =
    campaigns.find(campaign => campaign.id === selectedCampaignId) || null;
  const selectedCockpitDetail =
    cockpitDetails.find(detail => detail.campaign_id === selectedCampaignId) ||
    null;
  const canEditCockpit =
    profile?.role === "sub_admin" ||
    profile?.role === "admin" ||
    profile?.role === "super_admin";
  const selectedCockpitAuthorizations =
    campaignAuthorizations[selectedCampaignId] || [];
  const canCreateCampaign =
    profile?.role === "admin" || profile?.role === "super_admin";
  const campaignStats = useMemo(
    () => ({
      total: authorizations.length,
      pending: authorizations.filter(item => item.status === "pending").length,
      received: authorizations.filter(item => item.status === "received")
        .length,
    }),
    [authorizations]
  );
  const overviewStats = useMemo(() => {
    const all = Object.values(campaignAuthorizations).flat();
    const pending = all.filter(item => item.status === "pending").length;
    const received = all.filter(item => item.status === "received").length;
    return {
      total: all.length,
      pending,
      received,
      completion: all.length ? Math.round((received / all.length) * 100) : 0,
    };
  }, [campaignAuthorizations]);
  const deadlineItems = useMemo(
    () =>
      Object.values(campaignAuthorizations)
        .flat()
        .filter(item => item.valid_until && !item.is_permanent)
        .sort((a, b) =>
          (a.valid_until || "").localeCompare(b.valid_until || "")
        )
        .slice(0, 5),
    [campaignAuthorizations]
  );

  async function refreshCampaigns(actor = profile) {
    if (!actor) return;
    setLoadingData(true);
    try {
      const nextCampaigns = await loadCampaigns(actor.id);
      const [usersResult, detailsResult, supervisorsResult, milestonesResult] =
        await Promise.allSettled([
          loadCockpitUsers(actor.id),
          loadCockpitDetails(actor.id),
          loadCockpitSupervisors(actor.id),
          loadCockpitMilestones(actor.id),
        ]);
      setCampaigns(nextCampaigns);
      setCockpitUsers(
        usersResult.status === "fulfilled" ? usersResult.value : []
      );
      setCockpitDetails(
        detailsResult.status === "fulfilled" ? detailsResult.value : []
      );
      setCockpitSupervisors(
        supervisorsResult.status === "fulfilled" ? supervisorsResult.value : []
      );
      setCockpitMilestones(
        milestonesResult.status === "fulfilled" ? milestonesResult.value : []
      );
      setCockpitAvailable(
        [usersResult, detailsResult, supervisorsResult, milestonesResult].some(
          result => result.status === "fulfilled"
        )
      );
      const overviewEntries = await Promise.all(
        nextCampaigns.map(
          async campaign =>
            [
              campaign.id,
              await loadAuthorizations(actor.id, campaign.id),
            ] as const
        )
      );
      setCampaignAuthorizations(Object.fromEntries(overviewEntries));
      setSelectedCampaignId(current =>
        current && nextCampaigns.some(campaign => campaign.id === current)
          ? current
          : nextCampaigns[0]?.id || ""
      );
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Impossible de charger les campagnes."),
      });
    } finally {
      setLoadingData(false);
    }
  }

  async function refreshAuthorizations(
    actor = profile,
    campaignId = selectedCampaignId
  ) {
    if (!actor || !campaignId) {
      setAuthorizations([]);
      return;
    }
    setLoadingData(true);
    try {
      const nextAuthorizations = await loadAuthorizations(actor.id, campaignId);
      setAuthorizations(nextAuthorizations);
      setCampaignAuthorizations(current => ({
        ...current,
        [campaignId]: nextAuthorizations,
      }));
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(
          error,
          "Impossible de charger les autorisations."
        ),
      });
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (profile && canAccessAuthorizations(profile.role))
      void refreshCampaigns(profile);
  }, [profile]);
  useEffect(() => {
    if (profile && canAccessAuthorizations(profile.role) && selectedCampaignId)
      void refreshAuthorizations(profile, selectedCampaignId);
  }, [profile, selectedCampaignId]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const nextProfile = await signIn(loginPhone, loginPassword);
      setProfile(nextProfile);
      setLoginPhone("");
      setLoginPassword("");
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Connexion impossible."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      configureSupabase(setupUrl, setupKey);
      setConfigured(true);
      setShowConfig(false);
      setSetupKey("");
      onConnectionChanged();
      setNotice({
        kind: "success",
        message: "La connexion Supabase est enregistrée.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Configuration invalide.",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    signOut();
    setProfile(null);
    setCampaigns([]);
    setAuthorizations([]);
    setCampaignAuthorizations({});
    setSelectedCampaignId("");
  }
  function openCreateAuthorization() {
    if (!selectedCampaign) return;
    setSelectedAuthorization(null);
    setAuthorizationDraft({ ...EMPTY_AUTH, campaignId: selectedCampaign.id });
    setAuthOpen(true);
  }
  function openEditAuthorization(authorization: AuthorizationRecord) {
    setSelectedAuthorization(authorization);
    setAuthorizationDraft({
      campaignId: authorization.campaign_id,
      reference: authorization.reference || "",
      label: authorization.label,
      recipientName: authorization.recipient_name || "",
      contactService: authorization.contact_service,
      priority: authorization.priority,
      validFrom: authorization.valid_from || "",
      validUntil: authorization.valid_until || "",
      isPermanent: authorization.is_permanent,
      description: authorization.description || "",
    });
    setAuthOpen(true);
  }

  async function handleAuthorizationSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    try {
      const saved = selectedAuthorization
        ? await updateAuthorization(
            profile.id,
            selectedAuthorization.id,
            authorizationDraft
          )
        : await createAuthorization(profile.id, authorizationDraft);
      setAuthorizations(current =>
        selectedAuthorization
          ? current.map(item => (item.id === saved.id ? saved : item))
          : [saved, ...current]
      );
      setCampaignAuthorizations(current => ({
        ...current,
        [saved.campaign_id]: selectedAuthorization
          ? (current[saved.campaign_id] || []).map(item =>
              item.id === saved.id ? saved : item
            )
          : [saved, ...(current[saved.campaign_id] || [])],
      }));
      setAuthOpen(false);
      setNotice({
        kind: "success",
        message: selectedAuthorization
          ? "Autorisation mise à jour."
          : "Autorisation créée en attente de réception.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(
          error,
          "Impossible d’enregistrer l’autorisation."
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCampaignSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    try {
      const created = await createCampaign({
        actorId: profile.id,
        code: campaignDraft.code,
        name: campaignDraft.name,
        campaignType: campaignDraft.campaignType,
        status: campaignDraft.status,
        startsOn: campaignDraft.startsOn || null,
        endsOn: campaignDraft.endsOn || null,
      });
      setCampaigns(current =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setSelectedCampaignId(created.id);
      setCampaignOpen(false);
      setCampaignDraft({
        code: "",
        name: "",
        campaignType: "operations",
        status: "draft",
        startsOn: "",
        endsOn: "",
      });
      setNotice({ kind: "success", message: "Campagne créée." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Impossible de créer la campagne."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCockpitSave(
    input: Parameters<typeof upsertCockpitDetails>[2],
    supervisorIds: string[]
  ) {
    if (!profile || !selectedCampaign) return;
    setBusy(true);
    try {
      const [savedDetail, savedSupervisors] = await Promise.all([
        upsertCockpitDetails(profile.id, selectedCampaign.id, input),
        syncCockpitSupervisors(profile.id, selectedCampaign.id, supervisorIds),
      ]);
      setCockpitDetails(current => [
        ...current.filter(item => item.campaign_id !== savedDetail.campaign_id),
        savedDetail,
      ]);
      setCockpitSupervisors(current => [
        ...current.filter(item => item.campaign_id !== selectedCampaign.id),
        ...savedSupervisors,
      ]);
      setCockpitFormOpen(false);
      setNotice({
        kind: "success",
        message: "La fiche projet et son équipe ont été enregistrées.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(
          error,
          "Impossible d’enregistrer la fiche projet."
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleMilestoneSave(
    input: Parameters<typeof createCockpitMilestone>[1]
  ) {
    if (!profile) return;
    setBusy(true);
    try {
      const created = await createCockpitMilestone(profile.id, input);
      setCockpitMilestones(current => [...current, created]);
      setMilestoneFormOpen(false);
      setNotice({ kind: "success", message: "Jalon ajouté à la chronologie." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Impossible de créer le jalon."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleMilestoneStatus(
    milestone: CampaignCockpitMilestone,
    status: CockpitMilestoneStatus
  ) {
    if (!profile) return;
    setBusy(true);
    try {
      const updated = await updateCockpitMilestone(
        profile.id,
        milestone.id,
        status
      );
      setCockpitMilestones(current =>
        current.map(item => (item.id === updated.id ? updated : item))
      );
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Impossible de mettre à jour le jalon."),
      });
    } finally {
      setBusy(false);
    }
  }

  function openReceive(authorization: AuthorizationRecord) {
    setSelectedAuthorization(authorization);
    setReceivePhoto("");
    setReceiveOpen(true);
  }
  async function handleReceive(event: FormEvent) {
    event.preventDefault();
    if (!profile || !selectedAuthorization || !receivePhoto) return;
    setBusy(true);
    try {
      const updated = await markAuthorizationReceived(
        profile.id,
        selectedAuthorization.id,
        receivePhoto
      );
      setAuthorizations(current =>
        current.map(item => (item.id === updated.id ? updated : item))
      );
      setCampaignAuthorizations(current => ({
        ...current,
        [updated.campaign_id]: (current[updated.campaign_id] || []).map(item =>
          item.id === updated.id ? updated : item
        ),
      }));
      setReceiveOpen(false);
      setNotice({
        kind: "success",
        message: "Réception confirmée avec photo.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: readableError(error, "Impossible de confirmer la réception."),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!configured || !profile)
    return (
      <section className="auth-shell">
        <div className="auth-brand">
          <BrandLogo />
          <div>
            <strong>BTL Africa</strong>
            <span>Campaign authorizations</span>
          </div>
        </div>
        <div className="auth-layout">
          <div className="auth-intro">
            <div className="eyebrow">
              <ShieldCheck size={14} /> Registre d’autorisations
            </div>
            <h1>
              Les campagnes,
              <br />
              <span>autorisées clairement.</span>
            </h1>
            <p>
              Centralisez les autorisations, leur validité et la preuve de
              réception dans un espace calme, lisible et partagé.
            </p>
            <div className="intro-note">
              <Sparkles size={15} />
              <span>
                Une autorisation est créée en attente, puis confirmée par la
                personne qui la reçoit.
              </span>
            </div>
          </div>
          <div className="auth-card glass-card">
            {!configured && showConfig ? (
              <form onSubmit={handleSetup}>
                <div className="card-icon">
                  <Database size={18} />
                </div>
                <div className="eyebrow">Première configuration</div>
                <h2>Connecter la base BTL</h2>
                <p className="muted">
                  Cette application utilise le même projet Supabase que les
                  outils BTL existants.
                </p>
                <label>
                  URL Supabase
                  <input
                    value={setupUrl}
                    onChange={event => setSetupUrl(event.target.value)}
                    placeholder="https://votre-projet.supabase.co"
                    required
                  />
                </label>
                <label>
                  Clé publishable
                  <input
                    value={setupKey}
                    onChange={event => setSetupKey(event.target.value)}
                    type="password"
                    placeholder="Clé publishable / anon"
                    required
                  />
                </label>
                <button className="button primary full" disabled={busy}>
                  {busy ? "Connexion…" : "Enregistrer la connexion"}
                  <ArrowRight size={15} />
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin}>
                <div className="card-icon">
                  <LogIn size={18} />
                </div>
                <div className="eyebrow">Accès administratif</div>
                <h2>Ouvrir le registre</h2>
                <p className="muted">
                  Connectez-vous avec vos identifiants BTL. Les droits suivent
                  votre rôle existant.
                </p>
                <label>
                  MSISDN
                  <input
                    value={loginPhone}
                    onChange={event => setLoginPhone(event.target.value)}
                    placeholder="081 234 5678"
                    type="tel"
                    inputMode="tel"
                    required
                  />
                </label>
                <label>
                  Mot de passe
                  <input
                    value={loginPassword}
                    onChange={event => setLoginPassword(event.target.value)}
                    placeholder="Mot de passe"
                    type="password"
                    required
                  />
                </label>
                <button className="button primary full" disabled={busy}>
                  {busy ? "Vérification…" : "Se connecter"}
                  <ArrowRight size={15} />
                </button>
                {configured && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setShowConfig(true)}
                  >
                    Changer de projet Supabase
                  </button>
                )}
              </form>
            )}
            {notice && (
              <div className={`notice ${notice.kind}`}>
                <AlertCircle size={14} />
                {notice.message}
              </div>
            )}
          </div>
        </div>
      </section>
    );

  return (
    <section className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <BrandLogo />
          <div>
            <strong>BTL Africa</strong>
            <span>Campaign authorizations</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="role-chip">
            <span className="status-dot" />
            {profile.full_name} · {ROLE_LABELS[profile.role]}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={handleLogout}
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowConfig(true)}
            aria-label="Configuration Supabase"
            title="Configuration Supabase"
          >
            <Database size={15} />
          </button>
        </div>
      </header>
      <main className="dashboard-page">
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <ShieldCheck size={14} /> Autorisations de campagne
            </div>
            <h1>
              Le registre <span>opérationnel.</span>
            </h1>
            <p>
              Suivez ce qui a été demandé, ce qui est encore attendu et les
              preuves reçues sur chaque campagne.
            </p>
          </div>
          <div className="intro-metrics">
            <div>
              <strong>{campaigns.length}</strong>
              <span>campagnes</span>
            </div>
            <div>
              <strong>{overviewStats.pending}</strong>
              <span>en attente</span>
            </div>
            <div>
              <strong>{overviewStats.received}</strong>
              <span>reçues</span>
            </div>
          </div>
        </div>
        {notice && (
          <div className={`notice dashboard-notice ${notice.kind}`}>
            <AlertCircle size={14} />
            {notice.message}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <section className="insights-section">
          <div className="insights-heading">
            <div>
              <div className="eyebrow">
                <Sparkles size={14} /> Cockpit décisionnel
              </div>
              <h2>La situation, en un regard.</h2>
            </div>
            <span className="insights-live">
              <span className="status-dot" /> Données synchronisées
            </span>
          </div>
          <div className="insights-grid">
            <article className="insight-card completion-insight">
              <div className="insight-card-head">
                <div>
                  <div className="card-kicker">
                    <TrendingUp size={14} /> Taux de réception
                  </div>
                  <h3>Le registre avance</h3>
                </div>
                <span className="metric-badge">GLOBAL</span>
              </div>
              <div className="donut-layout">
                <div
                  className="donut-chart"
                  style={
                    {
                      "--progress": `${overviewStats.completion}%`,
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{overviewStats.completion}%</strong>
                    <span>reçues</span>
                  </div>
                </div>
                <div className="donut-legend">
                  <div>
                    <span className="legend-dot received-dot" />
                    <strong>{overviewStats.received}</strong>
                    <small>preuves reçues</small>
                  </div>
                  <div>
                    <span className="legend-dot pending-dot" />
                    <strong>{overviewStats.pending}</strong>
                    <small>en attente</small>
                  </div>
                  <div className="legend-foot">
                    {overviewStats.total} autorisation
                    {overviewStats.total > 1 ? "s" : ""} suivie
                    {overviewStats.total > 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </article>

            <article className="insight-card campaign-insight">
              <div className="insight-card-head">
                <div>
                  <div className="card-kicker">
                    <BarChart3 size={14} /> Lecture par campagne
                  </div>
                  <h3>Où agir en premier</h3>
                </div>
                <span className="metric-badge">
                  {campaigns.length} CAMPAGNES
                </span>
              </div>
              <div className="campaign-bars">
                {campaigns.map(campaign => {
                  const items = campaignAuthorizations[campaign.id] || [];
                  const received = items.filter(
                    item => item.status === "received"
                  ).length;
                  const progress = items.length
                    ? Math.round((received / items.length) * 100)
                    : 0;
                  return (
                    <button
                      type="button"
                      className="campaign-bar-row"
                      key={campaign.id}
                      onClick={() => setSelectedCampaignId(campaign.id)}
                    >
                      <span className="bar-label">
                        <strong>{campaign.name}</strong>
                        <small>
                          {received}/{items.length} reçue
                          {received > 1 ? "s" : ""}
                        </small>
                      </span>
                      <span className="bar-track">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                      <strong className="bar-percent">{progress}%</strong>
                    </button>
                  );
                })}
                {!campaigns.length && (
                  <div className="insight-empty">
                    Les campagnes apparaîtront ici dès leur synchronisation.
                  </div>
                )}
              </div>
            </article>

            <article className="insight-card deadline-insight">
              <div className="insight-card-head">
                <div>
                  <div className="card-kicker">
                    <TimerReset size={14} /> Radar des échéances
                  </div>
                  <h3>Les dates à surveiller</h3>
                </div>
                <span className="metric-badge">5 PROCHAINES</span>
              </div>
              <div className="deadline-list">
                {deadlineItems.map(item => {
                  const days = daysUntil(item.valid_until);
                  const campaignName =
                    campaigns.find(campaign => campaign.id === item.campaign_id)
                      ?.name || "Campagne";
                  const urgent = days !== null && days <= 7;
                  const expired = days !== null && days < 0;
                  return (
                    <button
                      type="button"
                      className={`deadline-row ${urgent ? "is-urgent" : ""} ${expired ? "is-expired" : ""}`}
                      key={item.id}
                      onClick={() => setSelectedCampaignId(item.campaign_id)}
                    >
                      <span className="deadline-date">
                        <strong>{formatDate(item.valid_until)}</strong>
                        <small>
                          {expired
                            ? "Dépassée"
                            : days === 0
                              ? "Aujourd’hui"
                              : `J-${days}`}
                        </small>
                      </span>
                      <span className="deadline-detail">
                        <strong>{item.label}</strong>
                        <small>{campaignName}</small>
                      </span>
                      <span
                        className={`deadline-status ${item.status === "received" ? "received" : "pending"}`}
                      >
                        {item.status === "received" ? "Reçue" : "À traiter"}
                      </span>
                    </button>
                  );
                })}
                {!deadlineItems.length && (
                  <div className="insight-empty">
                    Aucune échéance datée à signaler. Les autorisations pérennes
                    sont stables.
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>
        {selectedCampaign && (
          <CampaignCockpit
            campaign={selectedCampaign}
            detail={selectedCockpitDetail}
            users={cockpitUsers}
            supervisors={cockpitSupervisors}
            milestones={cockpitMilestones}
            authorizationTotal={selectedCockpitAuthorizations.length}
            authorizationReceived={
              selectedCockpitAuthorizations.filter(
                item => item.status === "received"
              ).length
            }
            available={cockpitAvailable}
            canEdit={Boolean(canEditCockpit)}
            busy={busy}
            onEdit={() => setCockpitFormOpen(true)}
            onAddMilestone={() => setMilestoneFormOpen(true)}
            onMilestoneStatus={(milestone, status) =>
              void handleMilestoneStatus(milestone, status)
            }
            onNotice={setNotice}
          />
        )}
        <div className="dashboard-grid">
          <aside className="campaign-panel glass-card">
            <div className="section-head">
              <div>
                <div className="card-kicker">
                  <BriefcaseBusiness size={14} /> Campagnes
                </div>
                <h2>Registre actif</h2>
              </div>
              {canCreateCampaign && (
                <button
                  className="icon-button accent"
                  type="button"
                  onClick={() => setCampaignOpen(true)}
                  aria-label="Créer une campagne"
                  title="Créer une campagne"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="campaign-list">
              {campaigns.map(campaign => (
                <button
                  type="button"
                  key={campaign.id}
                  className={`campaign-item ${campaign.id === selectedCampaignId ? "is-active" : ""}`}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                >
                  <span className="campaign-symbol">
                    <BriefcaseBusiness size={15} />
                  </span>
                  <span>
                    <strong>{campaign.name}</strong>
                    <small>
                      {campaign.code} ·{" "}
                      {CAMPAIGN_TYPE_LABELS[
                        campaign.campaign_type as CampaignType
                      ] || "Opérations"}
                    </small>
                  </span>
                  <span className={`status-pill status-${campaign.status}`}>
                    {campaign.status === "active"
                      ? "Active"
                      : campaign.status === "paused"
                        ? "Pause"
                        : "Brouillon"}
                  </span>
                </button>
              ))}
              {!campaigns.length && (
                <div className="empty-state">
                  <BriefcaseBusiness size={20} />
                  <strong>Aucune campagne</strong>
                  <span>
                    Les campagnes seront disponibles après la migration.
                  </span>
                </div>
              )}
            </div>
          </aside>
          <section className="authorization-panel glass-card">
            <div className="section-head">
              <div>
                <div className="card-kicker">
                  <Archive size={14} />{" "}
                  {selectedCampaign ? selectedCampaign.name : "Sélection"}
                </div>
                <h2>Autorisations</h2>
                <p>
                  {selectedCampaign
                    ? "Les autorisations de cette campagne, avec leur état de réception."
                    : "Choisissez une campagne pour consulter son registre."}
                </p>
              </div>
              {selectedCampaign && (
                <div className="section-actions">
                  <button
                    className="button secondary compact"
                    type="button"
                    onClick={() => void refreshAuthorizations()}
                    disabled={loadingData}
                  >
                    <RefreshCw size={14} /> Actualiser
                  </button>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={openCreateAuthorization}
                  >
                    <Plus size={14} /> Ajouter
                  </button>
                </div>
              )}
            </div>
            {selectedCampaign && (
              <div className="authorization-summary">
                <span>
                  <strong>{campaignStats.total}</strong> total
                </span>
                <span className="pending-text">
                  <Clock3 size={13} /> {campaignStats.pending} en attente
                </span>
                <span className="received-text">
                  <CheckCircle2 size={13} /> {campaignStats.received} reçue
                  {campaignStats.received > 1 ? "s" : ""}
                </span>
                <span className="validity-text">
                  <CalendarDays size={13} />{" "}
                  {selectedCampaign.starts_on
                    ? `${formatDate(selectedCampaign.starts_on)} → ${formatDate(selectedCampaign.ends_on)}`
                    : "Période libre"}
                </span>
              </div>
            )}
            <div className="authorization-list">
              {loadingData && (
                <div className="loading-line">
                  <RefreshCw className="spin" size={15} /> Synchronisation du
                  registre…
                </div>
              )}
              {!loadingData &&
                selectedCampaign &&
                authorizations.map(authorization => (
                  <article
                    className={`authorization-card priority-${authorization.priority}`}
                    key={authorization.id}
                  >
                    <div className="authorization-topline">
                      <span
                        className={`status-pill ${authorization.status === "received" ? "status-received" : "status-pending"}`}
                      >
                        {authorization.status === "received" ? (
                          <>
                            <CheckCircle2 size={12} /> Reçue
                          </>
                        ) : (
                          <>
                            <Clock3 size={12} /> En attente
                          </>
                        )}
                      </span>
                      <span
                        className={`priority-tag priority-${authorization.priority}`}
                      >
                        {PRIORITY_LABELS[authorization.priority]}
                      </span>
                      <span className="authorization-date">
                        {authorization.is_permanent
                          ? "Pérenne"
                          : `${formatDate(authorization.valid_from)} → ${formatDate(authorization.valid_until)}`}
                      </span>
                    </div>
                    <div className="authorization-body">
                      <div>
                        <h3>{authorization.label}</h3>
                        <p>
                          {authorization.description ||
                            "Aucune description fournie."}
                        </p>
                      </div>
                      <div className="authorization-meta">
                        <div>
                          <small>Service</small>
                          <strong>{authorization.contact_service}</strong>
                        </div>
                        <div>
                          <small>Destinataire</small>
                          <strong>
                            {authorization.recipient_name || "Non précisé"}
                          </strong>
                        </div>
                        <div>
                          <small>Référence</small>
                          <strong>{authorization.reference || "—"}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="authorization-actions">
                      <small>
                        Créée le{" "}
                        {formatDate(authorization.created_at.slice(0, 10))}
                      </small>
                      <div>
                        <button
                          className="text-action"
                          type="button"
                          onClick={() => openEditAuthorization(authorization)}
                        >
                          <FilePenLine size={13} /> Modifier
                        </button>
                        {authorization.status === "pending" && (
                          <button
                            className="button primary compact"
                            type="button"
                            onClick={() => openReceive(authorization)}
                          >
                            <CheckCircle2 size={13} /> Marquer reçue
                          </button>
                        )}
                        {authorization.status === "received" &&
                          authorization.received_photo_url && (
                            <a
                              className="text-action"
                              href={authorization.received_photo_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ImagePlus size={13} /> Voir la preuve
                            </a>
                          )}
                      </div>
                    </div>
                  </article>
                ))}
              {!loadingData && selectedCampaign && !authorizations.length && (
                <div className="empty-state large">
                  <Archive size={25} />
                  <strong>Aucune autorisation pour cette campagne</strong>
                  <span>
                    Ajoutez la première demande d’accès, de partenariat ou de
                    validation.
                  </span>
                  <button
                    className="button primary compact"
                    type="button"
                    onClick={openCreateAuthorization}
                  >
                    <Plus size={14} /> Ajouter une autorisation
                  </button>
                </div>
              )}
              {!selectedCampaign && (
                <div className="empty-state large">
                  <Sparkles size={25} />
                  <strong>Choisissez une campagne</strong>
                  <span>Le registre détaillé apparaîtra ici.</span>
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="footer-note">
          <Info size={13} /> Les autorisations sont visibles par les
          administratifs autorisés. La réception exige une photo de preuve.
        </div>
      </main>
      {campaignOpen && (
        <Modal onClose={() => setCampaignOpen(false)}>
          <form className="modal-form" onSubmit={handleCampaignSubmit}>
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  <BriefcaseBusiness size={14} /> Nouvelle campagne
                </div>
                <h2>Créer une campagne</h2>
                <p>
                  Les campagnes sont créées uniquement par les administrateurs.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCampaignOpen(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="form-grid two">
              <label>
                <span>
                  Code interne <b>*</b>
                </span>
                <input
                  value={campaignDraft.code}
                  onChange={event =>
                    setCampaignDraft({
                      ...campaignDraft,
                      code: event.target.value,
                    })
                  }
                  placeholder="ex. access-2026"
                  required
                />
              </label>
              <label>
                <span>
                  Nom de la campagne <b>*</b>
                </span>
                <input
                  value={campaignDraft.name}
                  onChange={event =>
                    setCampaignDraft({
                      ...campaignDraft,
                      name: event.target.value,
                    })
                  }
                  placeholder="Nom lisible"
                  required
                />
              </label>
              <label>
                <span>Type</span>
                <CustomSelect
                  value={campaignDraft.campaignType}
                  onChange={campaignType =>
                    setCampaignDraft({
                      ...campaignDraft,
                      campaignType: campaignType as CampaignType,
                    })
                  }
                  label="Type de campagne"
                  placeholder="Type"
                  options={(
                    Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]
                  ).map(type => ({
                    value: type,
                    label: CAMPAIGN_TYPE_LABELS[type],
                  }))}
                />
              </label>
              <label>
                <span>État initial</span>
                <CustomSelect
                  value={campaignDraft.status}
                  onChange={status =>
                    setCampaignDraft({ ...campaignDraft, status })
                  }
                  label="État initial"
                  placeholder="État"
                  options={[
                    { value: "draft", label: "Brouillon" },
                    { value: "active", label: "Active" },
                    { value: "paused", label: "En pause" },
                  ]}
                />
              </label>
              <label>
                <span>Début</span>
                <input
                  type="date"
                  value={campaignDraft.startsOn}
                  onChange={event =>
                    setCampaignDraft({
                      ...campaignDraft,
                      startsOn: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Fin</span>
                <input
                  type="date"
                  value={campaignDraft.endsOn}
                  onChange={event =>
                    setCampaignDraft({
                      ...campaignDraft,
                      endsOn: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setCampaignOpen(false)}
              >
                Annuler
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                Créer la campagne <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {cockpitFormOpen && selectedCampaign && (
        <CampaignCockpitForm
          campaign={selectedCampaign}
          detail={selectedCockpitDetail}
          users={cockpitUsers}
          supervisors={cockpitSupervisors}
          busy={busy}
          onSave={(input, supervisorIds) =>
            void handleCockpitSave(input, supervisorIds)
          }
          onClose={() => setCockpitFormOpen(false)}
        />
      )}
      {milestoneFormOpen && selectedCampaign && (
        <MilestoneForm
          campaign={selectedCampaign}
          users={cockpitUsers}
          busy={busy}
          onSave={input => void handleMilestoneSave(input)}
          onClose={() => setMilestoneFormOpen(false)}
        />
      )}
      {authOpen && (
        <Modal wide onClose={() => setAuthOpen(false)}>
          <AuthorizationForm
            value={authorizationDraft}
            campaigns={campaigns}
            editing={Boolean(selectedAuthorization)}
            busy={busy}
            onChange={setAuthorizationDraft}
            onSubmit={handleAuthorizationSubmit}
            onClose={() => setAuthOpen(false)}
          />
        </Modal>
      )}
      {receiveOpen && selectedAuthorization && (
        <Modal onClose={() => setReceiveOpen(false)}>
          <form className="modal-form" onSubmit={handleReceive}>
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  <ImagePlus size={14} /> Preuve de réception
                </div>
                <h2>Confirmer la réception</h2>
                <p>{selectedAuthorization.label}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setReceiveOpen(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="receive-callout">
              <ShieldCheck size={17} />
              <span>
                La photo est obligatoire. Elle sera associée à l’autorisation et
                au compte qui la confirme.
              </span>
            </div>
            <label className="photo-drop">
              <ImagePlus size={20} />
              <strong>
                {receivePhoto ? "Photo sélectionnée" : "Ajouter une photo"}
              </strong>
              <small>JPG, PNG ou WebP · 700 Ko maximum</small>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith("image/") || file.size > 700000) {
                    setNotice({
                      kind: "error",
                      message:
                        "La photo doit être une image de moins de 700 Ko.",
                    });
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setReceivePhoto(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setReceiveOpen(false)}
              >
                Annuler
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={busy || !receivePhoto}
              >
                {busy ? "Confirmation…" : "Confirmer comme reçue"}
                <CheckCircle2 size={14} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {showConfig && profile && (
        <Modal onClose={() => setShowConfig(false)}>
          <form
            className="modal-form"
            onSubmit={async event => {
              await handleSetup(event);
              setShowConfig(false);
            }}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  <Database size={14} /> Configuration
                </div>
                <h2>Projet Supabase</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowConfig(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <label>
              URL Supabase
              <input
                value={setupUrl}
                onChange={event => setSetupUrl(event.target.value)}
                required
              />
            </label>
            <label>
              Clé publishable
              <input
                value={setupKey}
                onChange={event => setSetupKey(event.target.value)}
                type="password"
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  clearSupabaseConnection();
                  setConfigured(false);
                  setProfile(null);
                  setShowConfig(false);
                }}
              >
                Déconnecter le projet
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
