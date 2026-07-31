import { describe, expect, it } from "vitest";
import { authorizeProjectAction, storageReservationAllowed } from "../../worker/src/authorization";
import {
  CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES,
  CLOUD_STORAGE_QUOTA_BYTES,
  progressiveStorageAllocationBytes,
} from "../../worker/src/entitlement";

const active = { canReadProjects: true, canWriteProjects: true, canExport: true };
const readOnly = { canReadProjects: true, canWriteProjects: false, canExport: true };

describe("Cloud project authorization", () => {
  it("rejects unauthenticated access", () => {
    expect(authorizeProjectAction({ authenticated: false, ownerMatches: true, entitlement: active }, "read")).toMatchObject({ status: 401, allowed: false });
  });

  it("hides another user's project", () => {
    expect(authorizeProjectAction({ authenticated: true, ownerMatches: false, entitlement: active }, "read")).toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
  });

  it("allows active saves and blocks past-due saves without blocking export", () => {
    expect(authorizeProjectAction({ authenticated: true, ownerMatches: true, entitlement: active }, "write").allowed).toBe(true);
    expect(authorizeProjectAction({ authenticated: true, ownerMatches: true, entitlement: readOnly }, "write").allowed).toBe(false);
    expect(authorizeProjectAction({ authenticated: true, ownerMatches: true, entitlement: readOnly }, "export").allowed).toBe(true);
  });
});

describe("Cloud storage quota", () => {
  it("uses the server-calculated replacement delta", () => {
    expect(storageReservationAllowed(90, 20, 30, 100)).toBe(true);
    expect(storageReservationAllowed(90, 20, 31, 100)).toBe(false);
  });

  it("rejects invalid and negative counters", () => {
    expect(storageReservationAllowed(-1, 0, 0, 100)).toBe(false);
    expect(storageReservationAllowed(0.5, 0, 0, 100)).toBe(false);
  });

  it("starts at 1 GB and grows one GB at each half-GB threshold", () => {
    const gib = CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES;
    expect(progressiveStorageAllocationBytes(0)).toBe(gib);
    expect(progressiveStorageAllocationBytes(gib / 2 - 1)).toBe(gib);
    expect(progressiveStorageAllocationBytes(gib / 2)).toBe(2 * gib);
    expect(progressiveStorageAllocationBytes(1.5 * gib)).toBe(3 * gib);
  });

  it("never shrinks an existing allocation and never exceeds 20 GB", () => {
    const gib = CLOUD_STORAGE_INITIAL_ALLOCATION_BYTES;
    expect(progressiveStorageAllocationBytes(0, 5 * gib)).toBe(5 * gib);
    expect(progressiveStorageAllocationBytes(CLOUD_STORAGE_QUOTA_BYTES)).toBe(CLOUD_STORAGE_QUOTA_BYTES);
  });
});
