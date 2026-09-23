import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  FilePenLine,
  ListChecks,
  MapPin,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  createCockpitMilestone,
  upsertCockpitDetails,
  type CampaignCockpitDetail,
  type CampaignCockpitMilestone,
  type CampaignCockpitSupervisor,
  type CampaignRecord,
  type CockpitMilestoneKind,
  type CockpitMilestoneStatus,
  type CockpitTerritory,
  type CockpitUser,
  type UserProfile,
} from "@/lib/supabase";

const ROLE_LABELS: Record<UserProfile["role"], string> = {
  agent: "Agent",
  supervisor: "Superviseur",
  sub_admin: "Coordination",
  admin: "Administrateur",
  super_admin: "Support IT",
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

type Notice = { kind: "success" | "error"; message: string };
type DetailInput = Parameters<typeof upsertCockpitDetails>[2];
type MilestoneInput = Parameters<typeof createCockpitMilestone>[1];

type CockpitProps = {
  campaign: CampaignRecord;
  detail: CampaignCockpitDetail | null;
  users: CockpitUser[];
  supervisors: CampaignCockpitSupervisor[];
  milestones: CampaignCockpitMilestone[];
  authorizationTotal: number;
  authorizationReceived: number;
  available: boolean;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onAddMilestone: () => void;
  onMilestoneStatus: (
    milestone: CampaignCockpitMilestone,
    status: CockpitMilestoneStatus
  ) => void;
  onNotice: (notice: Notice) => void;
};

function Picker({
  value,
  users,
  label,
  placeholder,
  onChange,
  roles,
}: {
  value: string;
  users: CockpitUser[];
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
  roles?: UserProfile["role"][];
}) {
  const options = users
    .filter(user => !roles || roles.includes(user.role))
    .map(user => ({
      value: user.id,
      label: `${user.full_name} · ${ROLE_LABELS[user.role]}`,
    }));
  return (
    <div className="field-stack">
      <span className="field-label">{label}</span>
      <CockpitSelect
        value={value}
        options={[{ value: "", label: placeholder }, ...options]}
        placeholder={placeholder}
        label={label}
        onChange={onChange}
      />
    </div>
  );
}

function CockpitSelect({
  value,
  options,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
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

function CockpitModal({
  children,
  wide = false,
  onClose,
}: {
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className={`modal-card ${wide ? "modal-wide" : ""}`}>{children}</div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function nameOf(
  users: CockpitUser[],
  id: string | null | undefined,
  fallback = "Non attribué"
) {
  return users.find(user => user.id === id)?.full_name || fallback;
}

function daysUntil(value: string) {
  const target = new Date(`${value}T23:59:59`).getTime();
  return Number.isNaN(target)
    ? null
    : Math.ceil((target - Date.now()) / 86_400_000);
}

function formatMoney(value: number | null, currency = "USD") {
  if (value === null || value === undefined) return "Budget à définir";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function CampaignCockpit({
  campaign,
  detail,
  users,
  supervisors,
  milestones,
  authorizationTotal,
  authorizationReceived,
  available,
  canEdit,
  busy,
  onEdit,
  onAddMilestone,
  onMilestoneStatus,
  onNotice,
}: CockpitProps) {
  const completion = authorizationTotal
    ? Math.round((authorizationReceived / authorizationTotal) * 100)
    : 0;
  const campaignSupervisors = supervisors.filter(
    item => item.campaign_id === campaign.id
  );
  const campaignMilestones = milestones
    .filter(item => item.campaign_id === campaign.id)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const roleCards = [
    {
      label: "Porteur du projet",
      icon: UserRound,
      id: detail?.project_owner_id,
      tone: "cyan",
    },
    {
      label: "Responsable projet",
      icon: ShieldCheck,
      id: detail?.project_manager_id,
      tone: "lime",
    },
    {
      label: "Médias",
      icon: BriefcaseBusiness,
      id: detail?.media_owner_id,
      tone: "purple",
    },
    {
      label: "Opérations terrain",
      icon: MapPin,
      id: detail?.field_operations_owner_id,
      tone: "amber",
    },
    {
      label: "Autorisations",
      icon: ListChecks,
      id: detail?.authorization_owner_id,
      tone: "red",
    },
  ];
  return (
    <section className="campaign-cockpit">
      <div className="cockpit-hero">
        <div className="cockpit-hero-copy">
          <div className="card-kicker">
            <LayoutIcon /> Fiche projet
          </div>
          <h2>{campaign.name}</h2>
          <p>
            {detail?.objective ||
              "Ajoutez un brief synthétique pour donner une direction commune à l’équipe."}
          </p>
          <div className="cockpit-tags">
            <span>
              <MapPin size={12} />{" "}
              {TERRITORY_LABELS[detail?.territory || "national"]}
            </span>
            <span>
              <WalletCards size={12} />{" "}
              {formatMoney(
                detail?.allocated_budget ?? null,
                detail?.budget_currency
              )}
            </span>
            {detail?.client_name && (
              <span>
                <BriefcaseBusiness size={12} /> {detail.client_name}
              </span>
            )}
          </div>
        </div>
        <div className="cockpit-hero-actions">
          {detail?.proforma_url && (
            <a
              className="button secondary compact"
              href={detail.proforma_url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> Proforma
            </a>
          )}
          {canEdit && available && (
            <button
              type="button"
              className="button primary compact"
              onClick={onEdit}
            >
              <FilePenLine size={13} /> Modifier la fiche
            </button>
          )}
        </div>
      </div>
      <div className="cockpit-kpis">
        <div>
          <strong>{completion}%</strong>
          <span>autorisations reçues</span>
          <div className="cockpit-progress">
            <i style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div>
          <strong>
            {campaignMilestones.filter(item => item.status === "done").length}/
            {campaignMilestones.length}
          </strong>
          <span>jalons terminés</span>
        </div>
        <div>
          <strong>{campaignSupervisors.length}</strong>
          <span>superviseur{campaignSupervisors.length > 1 ? "s" : ""}</span>
        </div>
        <div>
          <strong>
            {campaign.starts_on ? formatShortDate(campaign.starts_on) : "—"}
          </strong>
          <span>début de campagne</span>
        </div>
      </div>
      <div className="cockpit-columns">
        <div className="cockpit-card">
          <div className="cockpit-card-heading">
            <div>
              <div className="card-kicker">
                <Users size={14} /> Équipe de delivery
              </div>
              <h3>Les rôles qui font avancer le projet</h3>
            </div>
            <small>
              {campaignSupervisors.length} supervision
              {campaignSupervisors.length > 1 ? "s" : ""}
            </small>
          </div>
          <div className="role-card-grid">
            {roleCards.map(({ label, icon: Icon, id, tone }) => (
              <div className={`role-card tone-${tone}`} key={label}>
                <span className="role-card-icon">
                  <Icon size={14} />
                </span>
                <div>
                  <small>{label}</small>
                  <strong>{nameOf(users, id)}</strong>
                </div>
              </div>
            ))}
            <div className="role-card tone-fixed">
              <span className="role-card-icon">
                <WalletCards size={14} />
              </span>
              <div>
                <small>Finance · permanent</small>
                <strong>
                  {nameOf(users, detail?.finance_owner_id, "Michael")}
                </strong>
              </div>
            </div>
            <div className="role-card tone-fixed">
              <span className="role-card-icon">
                <ShieldCheck size={14} />
              </span>
              <div>
                <small>Support IT · backup</small>
                <strong>
                  {nameOf(users, detail?.it_support_id, "Eldo")}{" "}
                  <em>· {nameOf(users, detail?.it_backup_id, "Ruth")}</em>
                </strong>
              </div>
            </div>
          </div>
          <div className="supervisor-roster">
            <small>Superviseurs définis par les opérations</small>
            <div>
              {campaignSupervisors.length ? (
                campaignSupervisors.map(item => (
                  <span className="person-chip static" key={item.id}>
                    {nameOf(users, item.supervisor_id)}
                  </span>
                ))
              ) : (
                <span className="muted-note">
                  À définir dans la fiche projet
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="cockpit-card milestones-card">
          <div className="cockpit-card-heading">
            <div>
              <div className="card-kicker">
                <CalendarDays size={14} /> Chronologie
              </div>
              <h3>Les prochaines échéances</h3>
            </div>
            {canEdit && available && (
              <button
                type="button"
                className="icon-button accent"
                onClick={onAddMilestone}
                aria-label="Ajouter un jalon"
                title="Ajouter un jalon"
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          <div className="milestone-list">
            {campaignMilestones.map(item => {
              const days = daysUntil(item.due_on);
              return (
                <div
                  className={`milestone-row milestone-${item.status} ${days !== null && days < 0 && item.status !== "done" ? "is-late" : ""}`}
                  key={item.id}
                >
                  <span className="milestone-dot" />
                  <div className="milestone-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {MILESTONE_KIND_LABELS[item.kind]} ·{" "}
                      {formatShortDate(item.due_on)} ·{" "}
                      {nameOf(users, item.owner_id)}
                    </small>
                  </div>
                  <div className="milestone-status">
                    <span>
                      {days !== null && item.status !== "done"
                        ? days < 0
                          ? `J+${Math.abs(days)}`
                          : days === 0
                            ? "Aujourd’hui"
                            : `J-${days}`
                        : MILESTONE_STATUS_LABELS[item.status]}
                    </span>
                    {canEdit && item.status !== "done" && (
                      <button
                        type="button"
                        onClick={() =>
                          onMilestoneStatus(
                            item,
                            item.status === "planned" ? "in_progress" : "done"
                          )
                        }
                        aria-label={
                          item.status === "planned"
                            ? "Démarrer le jalon"
                            : "Terminer le jalon"
                        }
                      >
                        {item.status === "planned" ? "Démarrer" : "Terminer"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!campaignMilestones.length && (
              <div className="cockpit-empty">
                <ListChecks size={18} />
                <span>
                  Aucun jalon. Ajoutez les points de passage qui sécurisent la
                  livraison.
                </span>
                {canEdit && available && (
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={onAddMilestone}
                  >
                    Créer le premier jalon
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {!available && (
        <div className="cockpit-migration-note">
          <ShieldCheck size={13} />
          <span>
            La couche de pilotage projet est prête dans l’application ; appliquez
            la migration additive pour activer l’édition des équipes, budgets et
            jalons.
          </span>
        </div>
      )}
      {detail?.proforma_reference && (
        <div className="cockpit-footnote">
          <FilePenLine size={13} /> Proforma{" "}
          <strong>{detail.proforma_reference}</strong> · données projet mises à
          jour le{" "}
          {detail.updated_at
            ? formatShortDate(detail.updated_at.slice(0, 10))
            : "—"}
        </div>
      )}
    </section>
  );
}

function LayoutIcon() {
  return <LayoutDashboardIcon size={14} />;
}
function LayoutDashboardIcon({ size = 14 }: { size?: number }) {
  return <BriefcaseBusiness size={size} />;
}
function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export function CampaignCockpitForm({
  campaign,
  detail,
  users,
  supervisors,
  busy,
  onSave,
  onClose,
}: {
  campaign: CampaignRecord;
  detail: CampaignCockpitDetail | null;
  users: CockpitUser[];
  supervisors: CampaignCockpitSupervisor[];
  busy: boolean;
  onSave: (input: DetailInput, supervisorIds: string[]) => void;
  onClose: () => void;
}) {
  const base = detail || {
    campaign_id: campaign.id,
    client_name: "",
    project_owner_id: "",
    project_manager_id: "",
    finance_owner_id: "michael-admin",
    media_owner_id: "",
    field_operations_owner_id: "",
    authorization_owner_id: "",
    it_support_id: "0a6a2520-96bb-474d-87b6-b0eb8fc46cd6",
    it_backup_id: "usr-8d3144f8",
    territory: "national" as CockpitTerritory,
    objective: "",
    proforma_reference: "",
    proforma_url: "",
    allocated_budget: null,
    budget_currency: "USD",
    updated_by: null,
    updated_at: null,
  };
  const [value, setValue] = useState(base);
  const [selectedSupervisors, setSelectedSupervisors] = useState(
    supervisors
      .filter(item => item.campaign_id === campaign.id)
      .map(item => item.supervisor_id)
  );
  const update = <K extends keyof typeof value>(
    key: K,
    next: (typeof value)[K]
  ) => setValue(current => ({ ...current, [key]: next }));
  const options = users
    .filter(
      user =>
        ["supervisor", "sub_admin", "admin", "super_admin"].includes(
          user.role
        ) && !selectedSupervisors.includes(user.id)
    )
    .map(user => ({
      value: user.id,
      label: `${user.full_name} · ${ROLE_LABELS[user.role]}`,
    }));
  const remove = (id: string) =>
    setSelectedSupervisors(current => current.filter(item => item !== id));
  const fixedFinance = users.find(user => user.id === "michael-admin");
  const fixedIt = users.find(
    user => user.id === "0a6a2520-96bb-474d-87b6-b0eb8fc46cd6"
  );
  const fixedBackup = users.find(user => user.id === "usr-8d3144f8");
  return (
    <CockpitModal wide onClose={onClose}>
      <form
        className="modal-form cockpit-form"
        onSubmit={event => {
          event.preventDefault();
          onSave(
            {
              clientName: value.client_name || "",
              projectOwnerId: value.project_owner_id || "",
              projectManagerId: value.project_manager_id || "",
              mediaOwnerId: value.media_owner_id || "",
              fieldOperationsOwnerId: value.field_operations_owner_id || "",
              authorizationOwnerId: value.authorization_owner_id || "",
              territory: value.territory,
              objective: value.objective || "",
              proformaReference: value.proforma_reference || "",
              proformaUrl: value.proforma_url || "",
              allocatedBudget:
                value.allocated_budget === null
                  ? null
                  : Number(value.allocated_budget),
              budgetCurrency: value.budget_currency || "USD",
            },
            selectedSupervisors
          );
        }}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">
              <BriefcaseBusiness size={14} /> Fiche projet
            </div>
            <h2>{campaign.name}</h2>
            <p>
              Une fiche de pilotage additive, sans modifier les tables
              historiques.
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
        <div className="cockpit-form-section">
          <div className="cockpit-form-title">
            <BriefcaseBusiness size={15} />
            <span>Contexte commercial et financier</span>
          </div>
          <div className="form-grid two">
            <label>
              <span>Client</span>
              <input
                value={value.client_name || ""}
                onChange={event => update("client_name", event.target.value)}
                placeholder="Nom du client / annonceur"
              />
            </label>
            <Picker
              value={value.project_owner_id || ""}
              users={users}
              label="Porteur du projet"
              placeholder="Choisir un utilisateur"
              onChange={next => update("project_owner_id", next)}
            />
            <Picker
              value={value.project_manager_id || ""}
              users={users}
              roles={["sub_admin", "admin", "super_admin"]}
              label="Responsable du projet"
              placeholder="Coordination / administration"
              onChange={next => update("project_manager_id", next)}
            />
            <div className="field-stack">
              <span className="field-label">Financier permanent</span>
              <div className="fixed-owner">
                <WalletCards size={14} />
                <strong>{fixedFinance?.full_name || "Michael"}</strong>
                <small>Responsable financier · verrouillé</small>
              </div>
            </div>
            <label>
              <span>Budget réellement alloué</span>
              <div className="money-input">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value.allocated_budget ?? ""}
                  onChange={event =>
                    update(
                      "allocated_budget",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value)
                    )
                  }
                  placeholder="0.00"
                />
                <input
                  className="currency-input"
                  value={value.budget_currency || "USD"}
                  onChange={event =>
                    update("budget_currency", event.target.value.toUpperCase())
                  }
                  maxLength={8}
                  aria-label="Devise du budget"
                />
              </div>
            </label>
            <label>
              <span>Référence proforma</span>
              <input
                value={value.proforma_reference || ""}
                onChange={event =>
                  update("proforma_reference", event.target.value)
                }
                placeholder="N° proforma / devis"
              />
            </label>
            <label>
              <span>Lien proforma</span>
              <input
                type="url"
                value={value.proforma_url || ""}
                onChange={event => update("proforma_url", event.target.value)}
                placeholder="https://…"
              />
            </label>
            <div className="field-stack">
              <span className="field-label">Circonscription</span>
              <CockpitSelect
                value={value.territory}
                onChange={next => update("territory", next as CockpitTerritory)}
                label="Circonscription"
                placeholder="Choisir une zone"
                options={(
                  Object.keys(TERRITORY_LABELS) as CockpitTerritory[]
                ).map(key => ({ value: key, label: TERRITORY_LABELS[key] }))}
              />
            </div>
          </div>
          <label>
            <span>Objectif / brief synthétique</span>
            <textarea
              rows={3}
              value={value.objective || ""}
              onChange={event => update("objective", event.target.value)}
              placeholder="Ce que la campagne doit accomplir et comment mesurer le résultat…"
            />
          </label>
        </div>
        <div className="cockpit-form-section">
          <div className="cockpit-form-title">
            <Users size={15} />
            <span>Équipe de delivery</span>
          </div>
          <div className="form-grid two">
            <Picker
              value={value.media_owner_id || ""}
              users={users}
              label="Chargé des médias"
              placeholder="Choisir un utilisateur"
              onChange={next => update("media_owner_id", next)}
            />
            <Picker
              value={value.field_operations_owner_id || ""}
              users={users}
              roles={["supervisor", "sub_admin", "admin", "super_admin"]}
              label="Chargé des opérations terrain"
              placeholder="Choisir un responsable"
              onChange={next => update("field_operations_owner_id", next)}
            />
            <Picker
              value={value.authorization_owner_id || ""}
              users={users}
              label="Chargé des autorisations"
              placeholder="Choisir un utilisateur"
              onChange={next => update("authorization_owner_id", next)}
            />
            <div className="field-stack">
              <span className="field-label">Support IT permanent</span>
              <div className="fixed-owner">
                <ShieldCheck size={14} />
                <strong>{fixedIt?.full_name || "Eldo"}</strong>
                <small>Backup : {fixedBackup?.full_name || "Ruth"}</small>
              </div>
            </div>
          </div>
          <div className="supervisor-picker">
            <span className="field-label">Superviseurs de la campagne</span>
            <div className="supervisor-selected">
              {selectedSupervisors.map(id => (
                <button
                  type="button"
                  className="person-chip"
                  key={id}
                  onClick={() => remove(id)}
                >
                  {nameOf(users, id)}
                  <X size={11} />
                </button>
              ))}
              {!selectedSupervisors.length && (
                <small>Aucun superviseur défini</small>
              )}
            </div>
            <CockpitSelect
              value=""
              onChange={id => {
                if (id) setSelectedSupervisors(current => [...current, id]);
              }}
              label="Ajouter un superviseur"
              placeholder="Ajouter un superviseur"
              options={options}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer la fiche projet"}
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </CockpitModal>
  );
}

export function MilestoneForm({
  campaign,
  users,
  busy,
  onSave,
  onClose,
}: {
  campaign: CampaignRecord;
  users: CockpitUser[];
  busy: boolean;
  onSave: (input: MilestoneInput) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<MilestoneInput>({
    campaignId: campaign.id,
    title: "",
    kind: "other",
    dueOn: "",
    status: "planned",
    ownerId: "",
    notes: "",
  });
  return (
    <CockpitModal onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={event => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">
              <ListChecks size={14} /> Nouveau jalon
            </div>
            <h2>Ajouter une échéance</h2>
            <p>{campaign.name}</p>
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
        <label>
          <span>
            Jalon <b>*</b>
          </span>
          <input
            value={value.title}
            onChange={event =>
              setValue({ ...value, title: event.target.value })
            }
            placeholder="Ex. validation du plan média"
            required
          />
        </label>
        <div className="form-grid two">
          <div className="field-stack">
            <span className="field-label">Type</span>
            <CockpitSelect
              value={value.kind}
              onChange={kind =>
                setValue({ ...value, kind: kind as CockpitMilestoneKind })
              }
              label="Type de jalon"
              placeholder="Type"
              options={(
                Object.keys(MILESTONE_KIND_LABELS) as CockpitMilestoneKind[]
              ).map(kind => ({
                value: kind,
                label: MILESTONE_KIND_LABELS[kind],
              }))}
            />
          </div>
          <label>
            <span>
              Date cible <b>*</b>
            </span>
            <input
              type="date"
              value={value.dueOn}
              onChange={event =>
                setValue({ ...value, dueOn: event.target.value })
              }
              required
            />
          </label>
          <Picker
            value={value.ownerId || ""}
            users={users}
            label="Responsable"
            placeholder="Non attribué"
            onChange={ownerId => setValue({ ...value, ownerId })}
          />
        </div>
        <label>
          <span>Notes</span>
          <textarea
            rows={3}
            value={value.notes || ""}
            onChange={event =>
              setValue({ ...value, notes: event.target.value })
            }
            placeholder="Dépendances, livrable attendu, point de vigilance…"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Création…" : "Créer le jalon"}
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </CockpitModal>
  );
}
