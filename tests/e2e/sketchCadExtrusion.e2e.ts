import { beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SketchProfile } from "@/types/sketchforge";

// Load the real OCCT kernel directly (same approach as stepRoundTrip.e2e.ts).
vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return {
    loadBrepWithOcct: () =>
      (ready ??= (async () => {
        const kernel = await OcctKernel.init({ wasm });
        brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
        return brep;
      })()),
  };
});

let cadSketchRegions: typeof import("@/lib/sketchCadProfile").cadSketchRegions;

beforeAll(async () => {
  ({ cadSketchRegions } = await import("@/lib/sketchCadProfile"));
});

function rectangle(id: string, x: number, z: number, width: number, depth: number): SketchProfile {
  const points = [
    { id: `${id}-0`, x, z },
    { id: `${id}-1`, x: x + width, z },
    { id: `${id}-2`, x: x + width, z: z + depth },
    { id: `${id}-3`, x, z: z + depth },
  ];
  const segments = points.map((point, index) => ({
    id: `${id}-s${index}`,
    kind: "line" as const,
    startId: point.id,
    endId: points[(index + 1) % points.length].id,
  }));
  return { points, segments };
}

function mergeProfiles(...profiles: SketchProfile[]): SketchProfile {
  return {
    points: profiles.flatMap((p) => p.points),
    segments: profiles.flatMap((p) => p.segments),
  };
}

describe("Sketch CAD profile → B-Rep extrusion (real OCCT kernel)", () => {
  it("produces valid B-Rep from a single closed rectangle", async () => {
    const { OcctKernel } = await import("occt-wasm");
    const profile = rectangle("rect", 0, 0, 20, 10);
    const regions = cadSketchRegions(profile);
    expect(regions).toHaveLength(1);
    expect(regions[0].outer.closed).toBe(true);
    expect(regions[0].holes).toHaveLength(0);

    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    const kernel = await OcctKernel.init({ wasm });

    const edges = regions[0].outer.steps.map(({ from, to }) =>
      kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
    );
    const wire = kernel.makeWire(edges);
    const face = kernel.makeFace(wire);
    const solid = kernel.extrude(face, 0, 15, 0);
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.isSolid(solid)).toBe(true);

    const mesh = kernel.tessellate(solid, { linearDeflection: 0.05, angularDeflection: 0.16 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.positions.length).toBeGreaterThanOrEqual(9);
    expect(mesh.indices.length).toBeGreaterThanOrEqual(3);

    const brep = kernel.toBREP(solid);
    expect(brep).toBeTruthy();
    expect(brep.length).toBeGreaterThan(0);
    kernel.releaseAll();
  });

  it("extrudes a rectangle with a hole into a valid hollow solid", async () => {
    const { OcctKernel } = await import("occt-wasm");
    const profile = mergeProfiles(
      rectangle("outer", 0, 0, 40, 40),
      rectangle("hole", 10, 10, 20, 20),
    );
    const regions = cadSketchRegions(profile);
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(1);

    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    const kernel = await OcctKernel.init({ wasm });

    const outerEdges = regions[0].outer.steps.map(({ from, to }) =>
      kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
    );
    const outerWire = kernel.makeWire(outerEdges);
    let face = kernel.makeFace(outerWire);

    const holeEdges = regions[0].holes[0].steps.map(({ from, to }) =>
      kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
    );
    const holeWire = kernel.makeWire(holeEdges);
    face = kernel.addHolesInFace(face, [holeWire]);

    const solid = kernel.extrude(face, 0, 10, 0);
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.isSolid(solid)).toBe(true);

    const mesh = kernel.tessellate(solid, { linearDeflection: 0.05, angularDeflection: 0.16 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    kernel.releaseAll();
  });

  it("produces two separate solids from disjoint rectangles", async () => {
    const { OcctKernel } = await import("occt-wasm");
    const profile = mergeProfiles(
      rectangle("left", 0, 0, 10, 10),
      rectangle("right", 20, 0, 10, 10),
    );
    const regions = cadSketchRegions(profile);
    expect(regions).toHaveLength(2);

    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    const kernel = await OcctKernel.init({ wasm });

    const solids = regions.map((region) => {
      const edges = region.outer.steps.map(({ from, to }) =>
        kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
      );
      const wire = kernel.makeWire(edges);
      const face = kernel.makeFace(wire);
      return kernel.extrude(face, 0, 5, 0);
    });

    const compound = kernel.makeCompound(solids);
    expect(kernel.isValid(compound)).toBe(true);

    const mesh = kernel.tessellate(compound, { linearDeflection: 0.05, angularDeflection: 0.16 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    kernel.releaseAll();
  });

  it("extrudes a profile with an island inside a hole", async () => {
    const { OcctKernel } = await import("occt-wasm");
    const profile = mergeProfiles(
      rectangle("outer", 0, 0, 40, 40),
      rectangle("hole", 5, 5, 30, 30),
      rectangle("island", 12, 12, 16, 16),
    );
    const regions = cadSketchRegions(profile);
    expect(regions).toHaveLength(2);

    const outerRegion = regions.find((r) => r.outer.id.includes("outer"));
    const islandRegion = regions.find((r) => r.outer.id.includes("island"));
    expect(outerRegion).toBeDefined();
    expect(islandRegion).toBeDefined();
    expect(outerRegion!.holes).toHaveLength(1);
    expect(islandRegion!.holes).toHaveLength(0);

    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    const kernel = await OcctKernel.init({ wasm });

    const buildSolid = (region: { outer: typeof regions[0]["outer"]; holes: typeof regions[0]["holes"] }) => {
      const outerEdges = region.outer.steps.map(({ from, to }) =>
        kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
      );
      let face = kernel.makeFace(kernel.makeWire(outerEdges));
      if (region.holes.length > 0) {
        const holeWires = region.holes.map((hole) => {
          const holeEdges = hole.steps.map(({ from, to }) =>
            kernel.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }),
          );
          return kernel.makeWire(holeEdges);
        });
        face = kernel.addHolesInFace(face, holeWires);
      }
      return kernel.extrude(face, 0, 8, 0);
    };

    const solids = regions.map(buildSolid);
    const compound = kernel.makeCompound(solids);
    expect(kernel.isValid(compound)).toBe(true);

    const mesh = kernel.tessellate(compound, { linearDeflection: 0.05, angularDeflection: 0.16 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    kernel.releaseAll();
  });

  it("rejects a profile with only open paths", () => {
    const openProfile: SketchProfile = {
      points: [
        { id: "a-0", x: 0, z: 0 },
        { id: "a-1", x: 10, z: 0 },
        { id: "a-2", x: 10, z: 10 },
      ],
      segments: [
        { id: "a-s0", kind: "line", startId: "a-0", endId: "a-1" },
        { id: "a-s1", kind: "line", startId: "a-1", endId: "a-2" },
      ],
    };
    expect(() => cadSketchRegions(openProfile)).toThrow(/open/i);
  });
});
