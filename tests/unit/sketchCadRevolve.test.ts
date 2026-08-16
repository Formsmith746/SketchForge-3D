import { describe, expect, it } from "vitest";
import { normalizeSketchRevolveSettings, sketchProfileToRevolvePolygons } from "@/lib/sketchRevolve";
import type { SketchProfile } from "@/types/sketchforge";
import type { SketchCadBuildRequest } from "@/lib/sketchCadTypes";

function rectangleProfile(innerRadius = 5, outerRadius = 10, height = 20): SketchProfile {
  return {
    points: [
      { id: "a", x: -innerRadius, z: 0 },
      { id: "b", x: -outerRadius, z: 0 },
      { id: "c", x: -outerRadius, z: height },
      { id: "d", x: -innerRadius, z: height },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line" },
      { id: "bc", startId: "b", endId: "c", kind: "line" },
      { id: "cd", startId: "c", endId: "d", kind: "line" },
      { id: "da", startId: "d", endId: "a", kind: "line" },
    ],
  };
}

describe("sketch CAD revolve request and polygon generation", () => {
  it("converts a sketch profile to 2D section polygons suitable for CAD B-Rep revolve", () => {
    const profile = rectangleProfile();
    const settings = normalizeSketchRevolveSettings({ startAngle: 0, sweepAngle: 360 });
    const polygons = sketchProfileToRevolvePolygons(profile, settings);
    expect(polygons).toHaveLength(1);
    expect(polygons[0].length).toBe(4);
    // Radial distances from axis (x=0)
    const radii = polygons[0].map((point) => point[0]);
    expect(Math.min(...radii)).toBeCloseTo(5, 4);
    expect(Math.max(...radii)).toBeCloseTo(10, 4);
  });

  it("constructs a valid SketchCadBuildRequest of type revolve", () => {
    const profile = rectangleProfile();
    const request: SketchCadBuildRequest = {
      type: "revolve",
      requestId: 1,
      profile,
      settings: { startAngle: 0, sweepAngle: 180 },
    };
    expect(request.type).toBe("revolve");
    expect(request.settings.sweepAngle).toBe(180);
  });
});
