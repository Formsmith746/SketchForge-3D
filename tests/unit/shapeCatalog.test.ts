import { describe, expect, it } from "vitest";
import type { ShapeAsset } from "@/types/sketchforge";
import { makeShapeFromAsset, sceneShape, toolbarShapeAssets } from "@/lib/shapeCatalog";

describe("shape catalog", () => {
  it("does not expose removed decorative shapes in the toolbar catalog", () => {
    const kinds = toolbarShapeAssets.map((asset) => asset.kind);

    expect(kinds).not.toContain("star");
    expect(kinds).not.toContain("heart");
  });

  it("creates placed shapes from toolbar assets", () => {
    const asset: ShapeAsset = { id: "box", name: "Box", src: "box.png", kind: "box", color: "#d41721" };
    const placed = makeShapeFromAsset(asset, { x: 12, z: -8, elevation: 4 });

    expect(placed.id).toMatch(/^box-/);
    expect(placed).toMatchObject({
      name: "Box",
      kind: "box",
      color: "#d41721",
      x: 12,
      z: -8,
      elevation: 4,
      size: 20,
      width: 20,
      depth: 20,
      height: 20,
      radius: 0,
      steps: 10,
      locked: false,
      hidden: false,
    });
  });

  it("uses shape-specific defaults for text and round profiles", () => {
    const text = makeShapeFromAsset({ id: "text", name: "Text", src: "text.png", kind: "text", color: "#cf101b" });
    const torus = makeShapeFromAsset({ id: "torus", name: "Torus", src: "torus.png", kind: "torus", color: "#0098c7" });
    const gear = makeShapeFromAsset({ id: "gear", name: "Gear", src: "gear.svg", kind: "gear", color: "#6f7f8d" });

    expect(text).toMatchObject({ width: 86, depth: 28, height: 10, text: "TEXT", font: "Multilanguage" });
    expect(torus).toMatchObject({ size: 22, width: 22, depth: 22, height: 5 });
    expect(gear).toMatchObject({
      size: 30,
      width: 30,
      depth: 30,
      height: 6,
      teeth: 12,
      toothSize: 2.5,
      centerHoleSize: 6,
      gearType: "spur",
      helixAngle: 22.5,
      helixQuality: 16,
    });

    const loft = makeShapeFromAsset({ id: "loft", name: "Loft", src: "loft.svg", kind: "loft", color: "#5b5ce2" });
    expect(loft).toMatchObject({
      size: 24,
      width: 24,
      depth: 24,
      height: 28,
      loftBottomShape: "Rectangle",
      loftTopShape: "Oval",
      loftTopWidth: 24,
      loftTopDepth: 24,
      loftBottomRotation: 0,
      loftTopRotation: 0,
      loftSegments: 40,
      loftLayers: 24,
    });
  });

  it("creates canonical scene shapes with stable defaults", () => {
    const created = sceneShape({
      name: "Part",
      kind: "box",
      color: "#d41721",
      width: 12,
      depth: 18,
      rotation: 359.9,
      mirrorX: false,
    });

    expect(created.id).toMatch(/^shape-/);
    expect(created).toMatchObject({
      name: "Part",
      kind: "box",
      color: "#d41721",
      x: 0,
      z: 0,
      elevation: 0,
      width: 12,
      depth: 18,
      height: 20,
      size: 18,
      rotation: 0,
      locked: false,
      hidden: false,
    });
    expect(created.mirrorX).toBeUndefined();
  });
});
