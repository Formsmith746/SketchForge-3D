import { describe, expect, it } from "vitest";
import {
  horizontalPlacementWorkplane,
  placementPatchForNewShape,
  placementWorkplaneCoordinates,
  placementWorkplaneFromSurface,
  placementWorkplanePoint,
  snapPlacementWorkplaneOrigin,
  translationToWorkplane,
} from "@/lib/placementWorkplane";

describe("placement workplanes", () => {
  it("round-trips coordinates on an oriented surface", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 10, y: 5, z: -4 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
    );
    const world = placementWorkplanePoint(plane, 12, -7);
    const local = placementWorkplaneCoordinates(plane, world);

    expect(local.x).toBeCloseTo(12);
    expect(local.y).toBeCloseTo(0);
    expect(local.z).toBeCloseTo(-7);
  });

  it("places a new shape flush with a vertical face", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 20, y: 10, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const patch = placementPatchForNewShape({ height: 8 }, plane);

    expect(patch.x).toBeCloseTo(24);
    expect(patch.elevation).toBeCloseTo(6);
    expect(Math.abs(patch.rotationZ ?? 0)).toBeCloseTo(90);
  });

  it("reverses which side receives newly placed shapes", () => {
    const normal = { x: 0, y: 1, z: 0 };
    const regular = placementWorkplaneFromSurface({ x: 0, y: 4, z: 0 }, normal, { x: 1, y: 0, z: 0 });
    const reversed = placementWorkplaneFromSurface({ x: 0, y: 4, z: 0 }, normal, { x: 1, y: 0, z: 0 }, true);

    expect(placementPatchForNewShape({ height: 10 }, regular).elevation).toBe(4);
    expect(placementPatchForNewShape({ height: 10 }, reversed).elevation).toBe(-6);
  });

  it("snaps a horizontal surface origin to the base grid", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 7.3, y: 12, z: -4.6 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2);

    expect(snapped.origin).toEqual({ x: 8, y: 12, z: -4 });
  });

  it("snaps both in-plane coordinates without moving a vertical surface", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 20, y: 7.3, z: -4.6 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2);

    expect(snapped.origin).toEqual({ x: 20, y: 8, z: -4 });
    expect(snapped.origin.x).toBe(plane.origin.x);
  });

  it("keeps an angled surface coplanar while snapping from the base origin", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 7.2, y: 5.1, z: -3.8 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2.5);
    const snappedCoordinates = placementWorkplaneCoordinates(plane, snapped.origin);
    const planeOffset = (
      plane.origin.x * plane.normal.x
      + plane.origin.y * plane.normal.y
      + plane.origin.z * plane.normal.z
    );
    const baseGridAnchor = {
      ...plane,
      origin: {
        x: plane.normal.x * planeOffset,
        y: plane.normal.y * planeOffset,
        z: plane.normal.z * planeOffset,
      },
    };
    const gridCoordinates = placementWorkplaneCoordinates(baseGridAnchor, snapped.origin);

    expect(snappedCoordinates.y).toBeCloseTo(0);
    expect(gridCoordinates.x / 2.5).toBeCloseTo(Math.round(gridCoordinates.x / 2.5));
    expect(gridCoordinates.z / 2.5).toBeCloseTo(Math.round(gridCoordinates.z / 2.5));
  });

  it("computes the exact translation required to drop geometry onto a plane", () => {
    const plane = horizontalPlacementWorkplane(3);
    const translation = translationToWorkplane(plane, [
      { x: -2, y: 8, z: -2 },
      { x: 2, y: 8, z: 2 },
      { x: 0, y: 12, z: 0 },
    ]);

    expect(translation).toEqual({ x: 0, y: -5, z: 0 });
  });
});
