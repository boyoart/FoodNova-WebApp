export const APPROVED_STATUSES = new Set(["approved", "active", "verified", "online", "offline"]);
export const PENDING_STATUSES = new Set(["submitted", "pending", "pending_review", "in_review", "under_review"]);
export const REJECTED_STATUSES = new Set(["rejected", "declined", "suspended", "disabled"]);

export function riderStatus(source: any): string {
  const worker = source?.worker || source?.rider || source?.profile || {};
  return String(
    source?.approval_status ||
      source?.kyc_status ||
      source?.verification_status ||
      source?.status ||
      worker?.approval_status ||
      worker?.kyc_status ||
      worker?.status ||
      ""
  ).toLowerCase();
}

export function isApprovedRider(source: any): boolean {
  return APPROVED_STATUSES.has(riderStatus(source));
}

export function isPendingRider(source: any): boolean {
  return PENDING_STATUSES.has(riderStatus(source));
}

export function isRejectedRider(source: any): boolean {
  return REJECTED_STATUSES.has(riderStatus(source));
}

export function riderLooksOnline(source: any): boolean {
  const values = [
    source?.status,
    source?.availability,
    source?.operational_status,
    source?.online_status,
    source?.delivery_status,
    source?.worker_status,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase());
  return source?.is_online === true || source?.isOnline === true || values.some((value) => ["online", "available"].includes(value));
}
