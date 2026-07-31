import type { Entitlement } from "./entitlement";

export type CloudAction = "read" | "write" | "export";

export type AuthorizationInput = {
  authenticated: boolean;
  ownerMatches: boolean;
  entitlement: Pick<Entitlement, "canReadProjects" | "canWriteProjects" | "canExport">;
};

export function authorizeProjectAction(input: AuthorizationInput, action: CloudAction) {
  if (!input.authenticated) return { allowed: false, status: 401, code: "AUTHENTICATION_REQUIRED" } as const;
  if (!input.ownerMatches) return { allowed: false, status: 404, code: "PROJECT_NOT_FOUND" } as const;
  const allowed = action === "write"
    ? input.entitlement.canWriteProjects
    : action === "export"
      ? input.entitlement.canExport
      : input.entitlement.canReadProjects || input.entitlement.canWriteProjects;
  return allowed
    ? ({ allowed: true, status: 200, code: "OK" } as const)
    : ({ allowed: false, status: 402, code: `${action.toUpperCase()}_ENTITLEMENT_REQUIRED` } as const);
}

export function storageReservationAllowed(usedBytes: number, currentProjectBytes: number, replacementBytes: number, quotaBytes: number) {
  if (![usedBytes, currentProjectBytes, replacementBytes, quotaBytes].every(Number.isSafeInteger)) return false;
  if (usedBytes < 0 || currentProjectBytes < 0 || replacementBytes < 0 || quotaBytes < 0) return false;
  const nextUsage = usedBytes - currentProjectBytes + replacementBytes;
  return nextUsage >= 0 && nextUsage <= quotaBytes;
}
