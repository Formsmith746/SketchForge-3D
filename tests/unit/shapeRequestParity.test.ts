import { describe, expect, it } from "vitest";
import { shapeFromRequest, shapeParameterNamesFor, shapeWithRequestedChanges, SHAPE_PARAMETERS } from "@constructorfleet/sketchforge-engine/shapeRequests";
import { shapeHasTaper, shapeTaperDimensions } from "@constructorfleet/sketchforge-engine/workplaneShapes";
import type { ShapeKind, WorkplaneShape } from "@/types/sketchforge";

/**
 * Create and change are two readings of one table, and they disagreed: the
 * per-kind branches in `shapeFromRequest` named only the parameters a kind
 * cannot do without, so anything else the caller asked for was dropped and
 * answered 201. `shapeWithRequestedChanges` looped over the table and applied
 * it. A script could create a tapered box, get a straight one, and only find
 * out by patching the shape it had just made.
 */
function created(request: Record<string, unknown>) {
  const shape = shapeFromRequest(request);
  if (!shape) throw new Error(`no shape for ${JSON.stringify(request)}`);
  return shape;
}

function patched(shape: WorkplaneShape, request: Record<string, unknown>) {
  const result = shapeWithRequestedChanges(shape, request);
  if (!("ok" in result) || !result.ok) throw new Error(`patch refused: ${JSON.stringify(result)}`);
  return result.shape;
}

describe("creating a shape applies what the request asked for", () => {
  it("tapers a box asked for with a taper", () => {
    const box = created({ kind: "box", width: 20, depth: 20, height: 30, taperTopWidth: 2, taperTopDepth: 2 });

    expect(shapeHasTaper(box)).toBe(true);
    expect(shapeTaperDimensions(box)).toMatchObject({ topWidth: 2, topDepth: 2, bottomWidth: 20, bottomDepth: 20 });
  });

  it("gives the same shape whether the taper arrives on create or on a change", () => {
    const direct = created({ kind: "box", width: 20, depth: 20, height: 30, taperTopWidth: 2, taperTopDepth: 2 });
    const viaPatch = patched(created({ kind: "box", width: 20, depth: 20, height: 30 }), { taperTopWidth: 2, taperTopDepth: 2 });

    expect(shapeTaperDimensions(direct)).toEqual(shapeTaperDimensions(viaPatch));
  });

  it("leaves a shape untapered when the request says nothing about taper", () => {
    expect(shapeHasTaper(created({ kind: "box", width: 20, depth: 20, height: 30 }))).toBe(false);
  });

  it("still honours a kind's own mandatory parameters and their defaults", () => {
    // The branches supply these when the request is silent; that must survive.
    expect(created({ kind: "cylinder", width: 10, depth: 10, height: 10 }).sides).toBe(96);
    expect(created({ kind: "pyramid", width: 10, depth: 10, height: 10 }).sides).toBe(4);
    expect(created({ kind: "cylinder", width: 10, depth: 10, height: 10, sides: 6 }).sides).toBe(6);
  });

  it("falls back to the kind's own default, not the table's generic one", () => {
    // A pyramid defaults to 4 sides and a cylinder to 96, and the kind's
    // branch is what knows that. So the branch has to be applied *after* the
    // request, or an unreadable `sides` on a pyramid would come out as 96.
    expect(created({ kind: "pyramid", width: 10, depth: 10, height: 10, sides: "not a number" }).sides).toBe(4);
    expect(created({ kind: "cylinder", width: 10, depth: 10, height: 10, sides: "not a number" }).sides).toBe(96);
  });

  it("does not apply a parameter the kind does not claim", () => {
    // `steps` belongs to spheres. A box that carried one would contradict the
    // table that every reader consults -- and `PATCH` refuses the same field
    // with a 422, so applying it here would make create and change disagree
    // again, in the opposite direction.
    const box = created({ kind: "box", width: 20, depth: 20, height: 20, steps: 8 });
    expect(box.steps).toBeUndefined();

    const change = shapeWithRequestedChanges(box, { steps: 8 });
    expect("ok" in change && change.ok).toBe(false);
  });

  it("allows each mirror axis to be toggled by a shape change", () => {
    const box = created({ kind: "box", width: 20, depth: 20, height: 20 });
    const change = shapeWithRequestedChanges(box, { mirrorX: true, mirrorY: true, mirrorZ: true });
    expect(change).toMatchObject({ ok: true, shape: { mirrorX: true, mirrorY: true, mirrorZ: true } });
  });

  it("stores colors by current face index and drops them after a geometry edit", () => {
    const box = created({ kind: "box", width: 20, depth: 20, height: 20 });
    const painted = shapeWithRequestedChanges(box, { faceColors: { 0: "#ff0000", 3: "#00ff00" } });
    expect(painted).toMatchObject({ ok: true, shape: { faceColors: { 0: "#ff0000", 3: "#00ff00" } } });
    if (!painted.ok) return;
    const unchanged = shapeWithRequestedChanges(painted.shape, { width: painted.shape.width });
    expect(unchanged.ok && unchanged.shape.faceColors).toEqual({ 0: "#ff0000", 3: "#00ff00" });
    const resized = shapeWithRequestedChanges(painted.shape, { width: 30 });
    expect(resized.ok).toBe(true);
    if (resized.ok) expect(resized.shape).not.toHaveProperty("faceColors");
  });

  it("rejects malformed per-face color maps", () => {
    const box = created({ kind: "box", width: 20, depth: 20, height: 20 });
    expect(shapeWithRequestedChanges(box, { faceColors: { "-1": "red" } })).toMatchObject({ ok: false, unapplicable: ["faceColors"] });
  });

  it("applies every table parameter its kind claims, on create as on change", () => {
    // Table-driven so a parameter added later is covered without anyone
    // remembering this test exists.
    const sample: Partial<Record<string, unknown>> = {
      steps: 8, sides: 7, bevel: 1.5, segments: 3, topRadius: 2, baseRadius: 6,
      taperTopWidth: 5, taperTopDepth: 5, taperBottomWidth: 15, taperBottomDepth: 15,
      teeth: 12, toothSize: 3, centerHoleSize: 4, gearType: "herringbone", helixAngle: 20,
      loftTopWidth: 8, loftTopDepth: 8, loftBottomRotation: 10, loftTopRotation: 20,
      loftSegments: 5, loftLayers: 6, text: "hi", font: "sans",
    };
    const kinds: ShapeKind[] = ["box", "cylinder", "cone", "sphere", "halfSphere", "tube", "ring", "pyramid", "roof", "wedge", "text", "loft", "gear"];
    const missed: string[] = [];

    for (const kind of kinds) {
      for (const name of shapeParameterNamesFor(kind)) {
        const value = sample[name];
        if (value === undefined) continue;
        const shape = created({ kind, width: 20, depth: 20, height: 20, [name]: value });
        // Compare against what a change to the same shape produces, which is
        // the behaviour that was already right.
        const reference = patched(created({ kind, width: 20, depth: 20, height: 20 }), { [name]: value });
        if (JSON.stringify(shape[name]) !== JSON.stringify(reference[name])) {
          missed.push(`${kind}.${name}: created ${JSON.stringify(shape[name])} vs changed ${JSON.stringify(reference[name])}`);
        }
      }
    }

    expect(missed).toEqual([]);
    expect(Object.keys(SHAPE_PARAMETERS).length).toBeGreaterThan(20);
  });
});
