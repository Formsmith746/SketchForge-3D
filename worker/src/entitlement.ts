export const CLOUD_STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;
export const CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES = 1 * 1024 * 1024 * 1024;
export const CLOUD_STORAGE_ALLOCATION_STEP_BYTES = 1 * 1024 * 1024 * 1024;
export const CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES = 512 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
export const EXPIRED_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export function progressiveStorageAllocationBytes(usedBytes: number, currentAllocationBytes = CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES) {
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0) return CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES;
  const current = Number.isSafeInteger(currentAllocationBytes)
    ? Math.min(CLOUD_STORAGE_QUOTA_BYTES, Math.max(CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES, currentAllocationBytes))
    : CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES;
  const usageBasedAllocation = (
    Math.floor((usedBytes + CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES) / CLOUD_STORAGE_ALLOCATION_STEP_BYTES) + 1
  ) * CLOUD_STORAGE_ALLOCATION_STEP_BYTES;
  return Math.min(CLOUD_STORAGE_QUOTA_BYTES, Math.max(current, usageBasedAllocation));
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | "canceled"
  | "none"
  | "unknown";

export interface EntitlementInput {
  status: string | null;
  periodEnd: number | null;
  retentionDeleteEligibleAt: number | null;
  now?: number;
}

export interface Entitlement {
  status: SubscriptionStatus;
  projectAccess: "active" | "frozen" | "locked";
  graceEndsAt: number | null;
  canOpenEditor: boolean;
  canReadProjects: boolean;
  canWriteProjects: boolean;
  canExport: boolean;
  needsPaymentRecovery: boolean;
  route: "/cloud" | "/cloud/subscribe" | "/cloud/activating" | "/cloud/account";
}

function knownStatus(status: string | null): SubscriptionStatus {
  if (!status) return "none";
  if (["active", "trialing", "past_due", "incomplete", "incomplete_expired", "unpaid", "paused", "canceled"].includes(status)) {
    return status as SubscriptionStatus;
  }
  return "unknown";
}

export function getEntitlement(input: EntitlementInput): Entitlement {
  const status = knownStatus(input.status);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const paidPeriodRemaining = typeof input.periodEnd === "number" && input.periodEnd > now;
  const retained = typeof input.retentionDeleteEligibleAt === "number" && input.retentionDeleteEligibleAt > now;

  if ((status === "active" || status === "trialing") && paidPeriodRemaining) {
    return {
      status,
      projectAccess: "active",
      graceEndsAt: null,
      canOpenEditor: true,
      canReadProjects: true,
      canWriteProjects: true,
      canExport: true,
      needsPaymentRecovery: false,
      route: "/cloud",
    };
  }

  if (status === "active" || status === "trialing") {
    return {
      status,
      projectAccess: "locked",
      graceEndsAt: null,
      canOpenEditor: false,
      canReadProjects: false,
      canWriteProjects: false,
      canExport: false,
      needsPaymentRecovery: true,
      route: "/cloud/account",
    };
  }

  if ((status === "past_due" || status === "unpaid" || status === "paused") && retained) {
    return {
      status,
      projectAccess: "frozen",
      graceEndsAt: input.retentionDeleteEligibleAt,
      canOpenEditor: false,
      canReadProjects: true,
      canWriteProjects: false,
      canExport: true,
      needsPaymentRecovery: true,
      route: "/cloud/account",
    };
  }

  if (status === "incomplete") {
    return {
      status,
      projectAccess: "locked",
      graceEndsAt: null,
      canOpenEditor: false,
      canReadProjects: false,
      canWriteProjects: false,
      canExport: false,
      needsPaymentRecovery: true,
      route: "/cloud/activating",
    };
  }

  if ((status === "canceled" || status === "incomplete_expired") && retained) {
    return {
      status,
      projectAccess: "frozen",
      graceEndsAt: input.retentionDeleteEligibleAt,
      canOpenEditor: false,
      canReadProjects: true,
      canWriteProjects: false,
      canExport: true,
      needsPaymentRecovery: false,
      route: "/cloud/account",
    };
  }

  return {
    status,
    projectAccess: "locked",
    graceEndsAt: null,
    canOpenEditor: false,
    canReadProjects: false,
    canWriteProjects: false,
    canExport: false,
    needsPaymentRecovery: status === "unknown" || status === "past_due" || status === "unpaid" || status === "paused",
    route: status === "unknown" || status === "past_due" || status === "unpaid" || status === "paused"
      ? "/cloud/account"
      : "/cloud/subscribe",
  };
}

export function retentionDeadline(periodEnd: number | null, endedAt: number | null) {
  const anchor = endedAt ?? periodEnd;
  return anchor ? anchor + EXPIRED_RETENTION_SECONDS : null;
}
