import { describe, expect, it } from "vitest";
import { EXPIRED_RETENTION_SECONDS, getEntitlement, retentionDeadline } from "../../worker/src/entitlement";

const NOW = 2_000_000_000;

describe("SketchForge Cloud entitlement", () => {
  it.each(["active", "trialing"])("allows full access for %s", (status) => {
    const result = getEntitlement({ status, periodEnd: NOW + 3600, retentionDeleteEligibleAt: null, now: NOW });
    expect(result).toMatchObject({ canOpenEditor: true, canReadProjects: true, canWriteProjects: true, canExport: true, route: "/cloud" });
  });

  it("keeps access through the active paid period before scheduled cancellation becomes effective", () => {
    expect(getEntitlement({ status: "active", periodEnd: NOW + 1, retentionDeleteEligibleAt: null, now: NOW }).canWriteProjects).toBe(true);
  });

  it("freezes access immediately when Stripe reports the subscription as canceled", () => {
    expect(getEntitlement({ status: "canceled", periodEnd: NOW + 3600, retentionDeleteEligibleAt: NOW + 100, now: NOW })).toMatchObject({
      projectAccess: "frozen",
      canReadProjects: true,
      canWriteProjects: false,
    });
  });

  it.each(["past_due", "unpaid", "paused"])("freezes %s projects during the seven-day recovery window", (status) => {
    expect(getEntitlement({ status, periodEnd: NOW, retentionDeleteEligibleAt: NOW + 100, now: NOW })).toMatchObject({
      projectAccess: "frozen",
      graceEndsAt: NOW + 100,
      canOpenEditor: false,
      canReadProjects: true,
      canWriteProjects: false,
      canExport: true,
      needsPaymentRecovery: true,
      route: "/cloud/account",
    });
  });

  it.each(["past_due", "unpaid", "paused"])("locks %s projects after the recovery window", (status) => {
    expect(getEntitlement({ status, periodEnd: NOW, retentionDeleteEligibleAt: NOW, now: NOW })).toMatchObject({
      projectAccess: "locked",
      canReadProjects: false,
      canWriteProjects: false,
      canExport: false,
      needsPaymentRecovery: true,
      route: "/cloud/account",
    });
  });

  it("does not activate an incomplete Checkout", () => {
    expect(getEntitlement({ status: "incomplete", periodEnd: NOW + 3600, retentionDeleteEligibleAt: null, now: NOW })).toMatchObject({
      canOpenEditor: false,
      canWriteProjects: false,
      route: "/cloud/activating",
    });
  });

  it("allows read-only export during the seven-day grace window, then blocks all project access", () => {
    const deadline = retentionDeadline(NOW, null)!;
    expect(deadline).toBe(NOW + EXPIRED_RETENTION_SECONDS);
    expect(retentionDeadline(NOW + 3600, NOW)).toBe(NOW + EXPIRED_RETENTION_SECONDS);
    expect(getEntitlement({ status: "canceled", periodEnd: NOW, retentionDeleteEligibleAt: deadline, now: NOW + 1 })).toMatchObject({
      projectAccess: "frozen",
      canReadProjects: true,
      canWriteProjects: false,
      canExport: true,
    });
    expect(getEntitlement({ status: "canceled", periodEnd: NOW, retentionDeleteEligibleAt: deadline, now: deadline })).toMatchObject({
      projectAccess: "locked",
      canReadProjects: false,
      canWriteProjects: false,
      canExport: false,
    });
  });

  it("routes users without a subscription to plan selection", () => {
    expect(getEntitlement({ status: null, periodEnd: null, retentionDeleteEligibleAt: null, now: NOW }).route).toBe("/cloud/subscribe");
  });
});
