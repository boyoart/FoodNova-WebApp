import { ONBOARDING_DRAFT_KEY } from "@/src/lib/constants";
import { storage } from "@/src/utils/storage";

export const ONBOARDING_STAGES = [
  { key: "identity", title: "Identity & consent" },
  { key: "verified_identity", title: "Verified information" },
  { key: "address", title: "Address verification" },
  { key: "emergency", title: "Emergency contact" },
  { key: "selfie", title: "Selfie verification" },
  { key: "government_id", title: "Government ID" },
  { key: "vehicle", title: "Vehicle information" },
  { key: "training", title: "Training" },
  { key: "review", title: "Review" },
  { key: "submit", title: "Submit" },
] as const;

export type OnboardingDestination = "onboarding" | "pending_review" | "dashboard" | "rejected";
export type OnboardingResolution = { destination: OnboardingDestination; step: number; serverStep: number; forceReonboarding: boolean; reason: string };
export type OnboardingDraft = {
  step: number;
  accountId?: string;
  verifiedIdentity?: Record<string, string>;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
  governmentIdType?: string;
  updatedAt?: string;
};

const draftKey = (accountId: string) => `${ONBOARDING_DRAFT_KEY}:${String(accountId || "unknown")}`;
const POINTER_KEY = `${ONBOARDING_DRAFT_KEY}:active_account`;
const validServerStep = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ONBOARDING_STAGES.length ? parsed : null;
};
const sourceList = (sources: any[]) => sources.flatMap((source) => [source?.data, source?.onboarding_progress, source]).filter(Boolean);
const firstValue = (sources: any[], key: string) => sourceList(sources).map((source) => source?.[key]).find((value) => value !== undefined && value !== null);

export function resolveOnboardingState(...sources: any[]): OnboardingResolution {
  const all = sourceList(sources);
  const force = all.map((source) => source?.force_reonboarding).find((value) => value?.active) || {};
  const declaredDestination = String(firstValue(sources, "destination") || firstValue(sources, "authoritative_status") || "").toLowerCase();
  const approval = String(firstValue(sources, "approval_status") || firstValue(sources, "kyc_status") || "").toLowerCase();
  const submitted = firstValue(sources, "application_submitted") === true;
  let destination: OnboardingDestination = "onboarding";
  if (!force.active && (declaredDestination === "dashboard" || ["active", "approved"].includes(approval))) destination = "dashboard";
  else if (!force.active && (declaredDestination === "rejected" || ["rejected", "suspended", "declined"].includes(approval))) destination = "rejected";
  else if (!force.active && (declaredDestination === "pending_review" || submitted || ["pending_review", "submitted", "in_review"].includes(approval))) destination = "pending_review";

  const authoritative = validServerStep(firstValue(sources, "first_incomplete_step"));
  const documents = (firstValue(sources, "documents") || {}) as Record<string, any>;
  const profile = (firstValue(sources, "profile_data") || {}) as Record<string, any>;
  const facts = [
    firstValue(sources, "nin_verified") === true,
    firstValue(sources, "nin_verified") === true && Boolean(firstValue(sources, "nin_data")),
    Boolean(documents.address_proof || documents.proof_of_address || profile.address),
    Boolean(profile.emergency_contact_name && profile.emergency_contact_phone),
    Boolean(documents.selfie || firstValue(sources, "selfie_url")),
    Boolean(documents.driver_license || firstValue(sources, "id_document_url")),
    Boolean(profile.rider_type === "walker" || profile.rider_type === "messenger" || (profile.vehicle_type && profile.plate_number)),
    firstValue(sources, "training_completed") === true,
  ];
  const computed = facts.findIndex((complete) => !complete) + 1 || 9;
  const serverStep = force.active && force.scope === "full_resubmission" ? 1 : authoritative || computed;
  return { destination, serverStep, step: serverStep - 1, forceReonboarding: Boolean(force.active), reason: String(force.reason || "") };
}

export function backendOnboardingStep(...sources: any[]): number {
  return resolveOnboardingState(...sources).step;
}

export function clampOnboardingStep(step: number): number {
  return Math.max(0, Math.min(ONBOARDING_STAGES.length - 1, Number.isFinite(step) ? Math.floor(step) : 0));
}

export async function loadOnboardingDraft(accountId: string): Promise<OnboardingDraft> {
  if (!accountId) return { step: 0 };
  const raw = await storage.secureGet<string>(draftKey(accountId), "");
  if (!raw) return { step: 0, accountId };
  try {
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (String(parsed.accountId || "") !== String(accountId)) return { step: 0, accountId };
    return { ...parsed, accountId, step: clampOnboardingStep(parsed.step) };
  } catch {
    return { step: 0, accountId };
  }
}

export async function saveOnboardingDraft(accountId: string, draft: OnboardingDraft) {
  if (!accountId) return;
  await storage.secureSet(draftKey(accountId), JSON.stringify({ ...draft, accountId, step: clampOnboardingStep(draft.step), updatedAt: new Date().toISOString() }));
  await storage.secureSet(POINTER_KEY, accountId);
}

export async function clearOnboardingDraft(accountId?: string) {
  const activeAccount = accountId || await storage.secureGet<string>(POINTER_KEY, "");
  if (activeAccount) await storage.secureRemove(draftKey(activeAccount));
  await storage.secureRemove(POINTER_KEY);
  await storage.secureRemove(ONBOARDING_DRAFT_KEY); // remove the unsafe legacy global draft
}

export function safeVerifiedIdentity(response: any): Record<string, string> {
  const envelope = response?.data || response || {};
  const source = envelope?.worker_data || envelope?.verified_data || envelope?.identity || response?.worker_data || response?.verified_data || response?.identity || envelope;
  const fields: Record<string, string> = {};
  const mappings: [string, string[]][] = [
    ["Full name", ["full_name", "name"]], ["First name", ["first_name", "firstname"]],
    ["Middle name", ["middle_name", "middlename"]], ["Last name", ["last_name", "surname", "lastname"]],
    ["Date of birth", ["date_of_birth", "dob"]], ["Gender", ["gender", "sex"]],
  ];
  for (const [label, keys] of mappings) {
    const value = keys.map((key) => source?.[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    if (value) fields[label] = String(value);
  }
  return fields;
}
