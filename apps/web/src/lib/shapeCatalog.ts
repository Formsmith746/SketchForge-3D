import { canonicalizeShape } from "@/lib/workplaneShapes";
import { createLocalId } from "@/lib/localIds";
import {
  DEFAULT_GEAR_CENTER_HOLE_SIZE,
  DEFAULT_GEAR_HELIX_ANGLE,
  DEFAULT_GEAR_HELIX_QUALITY,
  DEFAULT_GEAR_TEETH,
  DEFAULT_GEAR_TOOTH_SIZE,
  DEFAULT_GEAR_TYPE,
  normalizeGearCenterHoleSize,
  normalizeGearHelixAngle,
  normalizeGearHelixQuality,
  normalizeGearTeeth,
  normalizeGearToothSize,
  normalizeGearToothWidth,
  normalizeGearType,
} from "@/lib/gearGeometry";
import type { ShapeAsset, ShapeCustomization, ShapeKind, WorkplaneShape } from "@/types/sketchforge";

export type ToolbarShapeAsset = ShapeAsset & { menuIcon: string };

export const toolbarShapeAssets: ToolbarShapeAsset[] = [
  { id: "box", name: "Box", src: "assets/sketchforge/shape-icons-gray/box.png", menuIcon: "assets/sketchforge/shape-icons-gray/box.png", kind: "box", color: "#d41721" },
  { id: "cylinder", name: "Cylinder", src: "assets/sketchforge/shape-icons-gray/cylinder.png", menuIcon: "assets/sketchforge/shape-icons-gray/cylinder.png", kind: "cylinder", color: "#d97813" },
  { id: "sphere", name: "Sphere", src: "assets/sketchforge/shape-icons-gray/sphere.png", menuIcon: "assets/sketchforge/shape-icons-gray/sphere.png", kind: "sphere", color: "#0098c7" },
  { id: "cone", name: "Cone", src: "assets/sketchforge/shape-icons-gray/cone.png", menuIcon: "assets/sketchforge/shape-icons-gray/cone.png", kind: "cone", color: "#6e2786" },
  { id: "pyramid", name: "Pyramid", src: "assets/sketchforge/shape-icons-gray/pyramid.png", menuIcon: "assets/sketchforge/shape-icons-gray/pyramid.png", kind: "pyramid", color: "#f2cf10" },
  { id: "wedge", name: "Wedge", src: "assets/sketchforge/shape-icons-gray/wedge.png", menuIcon: "assets/sketchforge/shape-icons-gray/wedge.png", kind: "wedge", color: "#33983d" },
  { id: "text", name: "Text", src: "assets/sketchforge/shape-icons-gray/text.png", menuIcon: "assets/sketchforge/shape-icons-gray/text.png", kind: "text", color: "#cf101b" },
  { id: "round-roof", name: "Round Roof", src: "assets/sketchforge/shape-icons-gray/round-roof.png", menuIcon: "assets/sketchforge/shape-icons-gray/round-roof.png", kind: "roundRoof", color: "#67c4ce" },
  { id: "half-sphere", name: "Half Sphere", src: "assets/sketchforge/shape-icons-gray/half-sphere.png", menuIcon: "assets/sketchforge/shape-icons-gray/half-sphere.png", kind: "halfSphere", color: "#c9009a" },
  { id: "torus", name: "Torus", src: "assets/sketchforge/shape-icons-gray/torus.png", menuIcon: "assets/sketchforge/shape-icons-gray/torus.png", kind: "torus", color: "#0098c7" },
  { id: "tube", name: "Tube", src: "assets/sketchforge/shape-icons-gray/tube.png", menuIcon: "assets/sketchforge/shape-icons-gray/tube.png", kind: "tube", color: "#ce7013" },
  { id: "gear", name: "Gear", src: "assets/sketchforge/gear-types/spur.png", menuIcon: "assets/sketchforge/gear-types/spur.png", kind: "gear", color: "#6f7f8d" },
];

export function shapeAssetDefaultDimensions(kind: ShapeKind) {
  const roundProfile = kind === "sphere" || kind === "torus" || kind === "ring" || kind === "halfSphere";
  const flatProfile = kind === "torus" || kind === "ring" || kind === "text" || kind === "gear";
  const size = kind === "gear" ? 30 : roundProfile ? 22 : 20;
  return {
    width: kind === "text" ? 86 : size,
    depth: kind === "text" ? 28 : size,
    height: kind === "gear" ? 6 : kind === "text" ? 10 : kind === "roundRoof" ? 10 : kind === "halfSphere" ? 11 : flatProfile ? 5 : 20,
  };
}

export function shapeAssetSpecialDefaults(kind: ShapeKind, dimensions = shapeAssetDefaultDimensions(kind)): ShapeCustomization {
  if (kind === "cylinder") return { sides: 96 };
  if (kind === "sphere") return { steps: 24 };
  if (kind === "halfSphere") return { steps: 32 };
  if (kind === "cone") return { topRadius: 0, baseRadius: dimensions.width / 2, sides: 96 };
  if (kind === "pyramid") return { sides: 4 };
  if (kind === "roundRoof") return { sides: 64 };
  if (kind === "tube" || kind === "ring") return { bevel: 4 };
  if (kind === "text") return { text: "TEXT", font: "Multilanguage", bevel: 0, segments: 0 };
  if (kind === "gear") {
    const teeth = DEFAULT_GEAR_TEETH;
    const toothSize = normalizeGearToothSize(DEFAULT_GEAR_TOOTH_SIZE, dimensions.width, dimensions.depth);
    return {
      teeth,
      toothSize,
      toothWidth: normalizeGearToothWidth(undefined, dimensions.width, dimensions.depth, teeth),
      centerHoleSize: normalizeGearCenterHoleSize(DEFAULT_GEAR_CENTER_HOLE_SIZE, dimensions.width, dimensions.depth, toothSize),
      gearType: DEFAULT_GEAR_TYPE,
      helixAngle: DEFAULT_GEAR_HELIX_ANGLE,
      helixQuality: DEFAULT_GEAR_HELIX_QUALITY,
    };
  }
  return {};
}

export function sceneShape(shape: Partial<WorkplaneShape> & Pick<WorkplaneShape, "name" | "kind" | "color">): WorkplaneShape {
  const width = shape.width ?? shape.size ?? 20;
  const depth = shape.depth ?? shape.size ?? 20;
  const height = shape.height ?? 20;
  return canonicalizeShape({
    id: shape.id ?? createLocalId("shape"),
    name: shape.name,
    kind: shape.kind,
    color: shape.color,
    hole: shape.hole,
    x: shape.x ?? 0,
    z: shape.z ?? 0,
    elevation: shape.elevation ?? 0,
    size: shape.size ?? Math.max(width, depth),
    width,
    depth,
    height,
    rotation: shape.rotation ?? 0,
    rotationX: shape.rotationX ?? 0,
    rotationZ: shape.rotationZ ?? 0,
    radius: shape.radius,
    steps: shape.steps,
    sides: shape.sides,
    bevel: shape.bevel,
    segments: shape.segments,
    topRadius: shape.topRadius,
    baseRadius: shape.baseRadius,
    taperTopWidth: shape.taperTopWidth,
    taperTopDepth: shape.taperTopDepth,
    taperBottomWidth: shape.taperBottomWidth,
    taperBottomDepth: shape.taperBottomDepth,
    taperTopScale: shape.taperTopScale,
    taperBottomScale: shape.taperBottomScale,
    teeth: shape.teeth,
    toothSize: shape.toothSize,
    toothWidth: shape.toothWidth,
    centerHoleSize: shape.centerHoleSize,
    gearType: shape.gearType,
    helixAngle: shape.helixAngle,
    helixQuality: shape.helixQuality,
    text: shape.text,
    font: shape.font,
    importedMesh: shape.importedMesh,
    imagePlate: shape.imagePlate,
    sketchProfile: shape.sketchProfile,
    sketchOperation: shape.sketchOperation,
    sketchRevolve: shape.sketchRevolve,
    groupedShapes: shape.groupedShapes,
    groupedBaseWidth: shape.groupedBaseWidth,
    groupedBaseDepth: shape.groupedBaseDepth,
    groupedBaseHeight: shape.groupedBaseHeight,
    groupOperation: shape.groupOperation,
    locked: shape.locked ?? false,
    hidden: shape.hidden ?? false,
  });
}

export function makeShapeFromAsset(
  asset: ShapeAsset,
  point?: { x: number; z: number; elevation?: number },
  customization: ShapeCustomization = {},
): WorkplaneShape {
  const defaults = shapeAssetDefaultDimensions(asset.kind);
  const width = customization.width ?? defaults.width;
  const depth = customization.depth ?? defaults.depth;
  const height = customization.height ?? defaults.height;
  const size = Math.max(width, depth);
  const gearTeeth = asset.kind === "gear" ? normalizeGearTeeth(customization.teeth ?? DEFAULT_GEAR_TEETH) : undefined;
  const gearToothSize = asset.kind === "gear" ? normalizeGearToothSize(customization.toothSize ?? DEFAULT_GEAR_TOOTH_SIZE, width, depth) : undefined;

  return {
    id: createLocalId(asset.id),
    name: asset.name,
    kind: asset.kind,
    color: asset.color,
    hole: asset.hole,
    x: point?.x ?? 0,
    z: point?.z ?? 0,
    elevation: point?.elevation ?? 0,
    size,
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    radius: asset.kind === "box" ? 0 : undefined,
    text: asset.kind === "text" ? customization.text ?? "TEXT" : undefined,
    font: asset.kind === "text" ? customization.font ?? "Multilanguage" : undefined,
    steps: asset.kind === "box" ? 10 : asset.kind === "sphere" ? customization.steps ?? 24 : asset.kind === "halfSphere" ? customization.steps ?? 32 : undefined,
    sides: asset.kind === "cylinder" || asset.kind === "cone" ? customization.sides ?? 96 : asset.kind === "roundRoof" ? customization.sides ?? 64 : asset.kind === "pyramid" ? customization.sides ?? 4 : undefined,
    bevel: asset.kind === "cylinder" ? 0 : asset.kind === "tube" || asset.kind === "ring" ? customization.bevel ?? 4 : asset.kind === "text" ? customization.bevel : undefined,
    segments: asset.kind === "cylinder" ? 1 : asset.kind === "text" ? customization.segments : undefined,
    topRadius: asset.kind === "cone" ? customization.topRadius ?? 0 : undefined,
    baseRadius: asset.kind === "cone" ? customization.baseRadius ?? width / 2 : undefined,
    teeth: gearTeeth,
    toothSize: gearToothSize,
    toothWidth: asset.kind === "gear" && customization.toothWidth !== undefined
      ? normalizeGearToothWidth(customization.toothWidth, width, depth, gearTeeth)
      : undefined,
    centerHoleSize: asset.kind === "gear" ? normalizeGearCenterHoleSize(customization.centerHoleSize ?? DEFAULT_GEAR_CENTER_HOLE_SIZE, width, depth, gearToothSize) : undefined,
    gearType: asset.kind === "gear" ? normalizeGearType(customization.gearType ?? DEFAULT_GEAR_TYPE) : undefined,
    helixAngle: asset.kind === "gear" ? normalizeGearHelixAngle(customization.helixAngle ?? DEFAULT_GEAR_HELIX_ANGLE) : undefined,
    helixQuality: asset.kind === "gear" ? normalizeGearHelixQuality(customization.helixQuality ?? DEFAULT_GEAR_HELIX_QUALITY) : undefined,
    locked: false,
    hidden: false,
  };
}
