import { ONBOARDING_DRAFT_KEY } from "@/src/lib/constants";
import { storage } from "@/src/utils/storage";

export const ONBOARDING_STAGES = [
  { key: "identity", title: "Identity & consent", aliases: ["identity", "nin", "nin_verification"] },
  { key: "verified_identity", title: "Verified information", aliases: ["verified_identity", "identity_verified", "personal_information"] },
  { key: "address", title: "Address verification", aliases: ["address", "address_verification", "residential_address"] },
  { key: "emergency", title: "Emergency contact", aliases: ["emergency", "emergency_contact"] },
  { key: "selfie", title: "Selfie verification", aliases: ["selfie", "selfie_verification"] },
  { key: "government_id", title: "Government ID", aliases: ["government_id", "document", "documents", "id_upload"] },
  { key: "vehicle", title: "Vehicle information", aliases: ["vehicle", "vehicle_information"] },
  { key: "training", title: "Training", aliases: ["training", "rider_training"] },
  { key: "review", title: "Review", aliases: ["review", "review_submit"] },
  { key: "submit", title: "Submit", aliases: ["submit", "submitted", "pending_review"] },
] as const;

export type OnboardingDraft = {
  step: number;
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

function numberValue(source: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = source?.[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function backendOnboardingStep(...sources: any[]): number {
  for (const source of sources) {
    const stage = String(source?.onboarding_stage || source?.stage || source?.current_stage || "").toLowerCase();
    if (stage) {
      let stageIndex = ONBOARDING_STAGES.findIndex((item) => item.aliases.some((alias) => stage === alias));
      if (stageIndex < 0) {
        const matches = ONBOARDING_STAGES.flatMap((item, index) => item.aliases.map((alias) => ({ alias, index })))
          .filter((item) => stage.includes(item.alias))
          .sort((a, b) => b.alias.length - a.alias.length);
        stageIndex = matches[0]?.index ?? -1;
      }
      if (stageIndex >= 0) return stageIndex;
    }
    const raw = numberValue(source, ["current_step", "onboarding_current_step", "step"]);
    if (raw !== null) return Math.max(0, Math.min(ONBOARDING_STAGES.length - 1, raw > 0 ? raw - 1 : raw));
  }
  return 0;
}

export function clampOnboardingStep(step: number): number {
  return Math.max(0, Math.min(ONBOARDING_STAGES.length - 1, Math.floor(step || 0)));
}

export async function loadOnboardingDraft(): Promise<OnboardingDraft> {
  const raw = await storage.secureGet<string>(ONBOARDING_DRAFT_KEY, "");
  if (!raw) return { step: 0 };
  try {
    const parsed = JSON.parse(raw) as OnboardingDraft;
    return { ...parsed, step: clampOnboardingStep(parsed.step) };
  } catch {
    return { step: 0 };
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft) {
  await storage.secureSet(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...draft, step: clampOnboardingStep(draft.step), updatedAt: new Date().toISOString() }));
}

export async function clearOnboardingDraft() {
  await storage.secureRemove(ONBOARDING_DRAFT_KEY);
}

export function safeVerifiedIdentity(response: any): Record<string, string> {
  const envelope = response?.data || response || {};
  const source = envelope?.worker_data || envelope?.verified_data || envelope?.identity || response?.worker_data || response?.verified_data || response?.identity || envelope;
  const fields: Record<string, string> = {};
  const mappings: [string, string[]][] = [
    ["Full name", ["full_name", "name"]],
    ["First name", ["first_name", "firstname"]],
    ["Middle name", ["middle_name", "middlename"]],
    ["Last name", ["last_name", "surname", "lastname"]],
    ["Date of birth", ["date_of_birth", "dob"]],
    ["Gender", ["gender", "sex"]],
  ];
  for (const [label, keys] of mappings) {
    const value = keys.map((key) => source?.[key]).find((item) => item !== undefined && item !== null && String(item).trim());
    if (value) fields[label] = String(value);
  }
  return fields;
}
