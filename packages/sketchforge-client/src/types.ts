/**
 * The wire shapes of `/api/v1`, typed.
 *
 * These mirror `apps/web/src/lib/shapeRequests.ts`, `revolveRequests.ts` and
 * `apiShapes.ts`. The server is forgiving -- an unknown field is ignored and a
 * missing one takes the editor's default -- so the types here are deliberately
 * tighter than the server's validation: a caller is better served by a compile
 * error on `sids: 6` than by a hexagon that came out round.
 */

/** Kinds the server can build from parameters alone, with no OCCT and no browser. */
export const PARAMETRIC_SHAPE_KINDS = [
  "box",
  "cube",
  "cylinder",
  "cone",
  "sphere",
  "halfSphere",
  "torus",
  "tube",
  "ring",
  "polygon",
  "pyramid",
  "roof",
  "roundRoof",
  "wedge",
  "icosahedron",
  "text",
  "loft",
  "gear",
] as const;

export type ParametricShapeKind = (typeof PARAMETRIC_SHAPE_KINDS)[number];

/** Every kind a shape request may name, including the two swept ones. */
export type ShapeKind = ParametricShapeKind | "revolve" | "thread";

/** Sampled wall-thickness estimate; not a certified minimum-thickness result. */
export type WallThicknessEstimate = {
  minimum: number | null;
  unit: "mm";
  method: "sampled-opposing-surface-distance";
  samplesPerFace: number;
  facesChecked: number;
};

/** Thread designations the server's catalog carries a pitch for. */
export const THREAD_DESIGNATIONS = [
  "M2",
  "M2.5",
  "M3",
  "M4",
  "M5",
  "M6",
  "M8",
  "M10",
  "M12",
  "M16",
  "M20",
  "#4-40",
  "#6-32",
  "#8-32",
  "#10-24",
  "1/4-20",
  "5/16-18",
  "3/8-16",
  "1/2-13",
] as const;

export type ThreadDesignation = (typeof THREAD_DESIGNATIONS)[number];

/** Dimensions outside this range are clamped by the server rather than refused. */
export const MIN_DIMENSION = 0.01;
export const MAX_DIMENSION = 10_000;

/** One POST may carry at most this many shapes. */
export const MAX_SHAPES_PER_REQUEST = 200;

export type ShapePlacement = {
  name?: string;
  /** A CSS hex colour, as the editor stores it. */
  color?: string;
  x?: number;
  z?: number;
  elevation?: number;
  rotation?: number;
  rotationX?: number;
  rotationZ?: number;
  /** Marked as a hole, so grouping it with a solid subtracts it. */
  hole?: boolean;
};

export type ShapeDimensions = {
  width?: number;
  depth?: number;
  height?: number;
  /** Stands in for all three, which is what `cube` is for. */
  size?: number;
};

export type LoftProfileShape = "Oval" | "Rectangle" | "Triangle" | "Pentagon" | "Hexagon";

/**
 * The taper every kind but `gear` carries: the footprint at each end of the
 * extrusion, which need not match the shape's own width and depth.
 */
export type TaperFields = {
  taperTopWidth?: number;
  taperTopDepth?: number;
  taperBottomWidth?: number;
  taperBottomDepth?: number;
};

export type GearKindType = "spur" | "helical" | "bevel";

type KindFields = {
  box: unknown;
  cube: unknown;
  /** `sides` under 96 is a prism rather than a cylinder; 6 gives a hex bar. */
  cylinder: { sides?: number };
  cone: { sides?: number; topRadius?: number; baseRadius?: number };
  sphere: { steps?: number };
  halfSphere: { steps?: number };
  torus: unknown;
  /** `bevel` is the wall thickness, measured inwards. */
  tube: { bevel?: number };
  ring: { bevel?: number };
  polygon: unknown;
  pyramid: { sides?: number };
  roof: unknown;
  roundRoof: unknown;
  wedge: unknown;
  icosahedron: unknown;
  text: { text?: string; font?: string; bevel?: number; segments?: number };
  loft: {
    loftBottomShape?: LoftProfileShape;
    loftTopShape?: LoftProfileShape;
    loftTopWidth?: number;
    loftTopDepth?: number;
    loftBottomRotation?: number;
    loftTopRotation?: number;
    loftSegments?: number;
    loftLayers?: number;
  };
  gear: {
    teeth?: number;
    toothSize?: number;
    toothWidth?: number;
    centerHoleSize?: number;
    gearType?: GearKindType;
    helixAngle?: number;
  };
};

/** Every per-kind parameter, for a context that does not know the kind yet. */
export type AnyKindFields = {
  [Kind in ParametricShapeKind]: KindFields[Kind] extends object ? KindFields[Kind] : Record<never, never>;
}[ParametricShapeKind] extends infer Union
  ? Partial<UnionToIntersection<Union>>
  : never;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends
  (value: infer Intersection) => void ? Intersection : never;

export type ParametricShapeRequest = {
  [Kind in ParametricShapeKind]: { kind: Kind } & ShapePlacement &
    ShapeDimensions &
    (KindFields[Kind] extends object ? KindFields[Kind] : Record<never, never>) &
    (Kind extends "gear" ? Record<never, never> : TaperFields);
}[ParametricShapeKind];

/** A point of a revolve outline: `[distance from the axis, position along it]`. */
export type ProfilePoint = readonly [number, number];

export type RevolveSettings = {
  /** Axial rise per full turn, in mm. `0` is a plain revolve; negative is left-hand. */
  pitch?: number;
  /** Full turns to sweep, 0.1 to 20. */
  turns?: number;
  startAngle?: number;
  /** How far round to revolve when there is no pitch, +/-360. */
  sweepAngle?: number;
  /** The solid the sweep is fused into. `0` leaves the bare ribbon. */
  coreRadius?: number;
};

export type RevolveShapeRequest = { kind: "revolve"; profile: readonly ProfilePoint[] } &
  RevolveSettings &
  ShapePlacement;

export type ThreadShapeRequest = {
  kind: "thread";
  /** A catalog designation, which carries its own pitch. Defaults to `M8`. */
  size?: ThreadDesignation | string;
  /** Outside diameter, for a size the catalog does not list. */
  diameter?: number;
  pitch?: number;
  turns?: number;
  /** How long the thread should be, instead of counting turns. */
  length?: number;
  /** Cut wider by a clearance and marked as a hole, so a bolt of that size fits. */
  hole?: boolean;
  clearance?: number;
  /** `false` leaves the bare helix, with no shank and no drilled hole. */
  core?: boolean;
  /** Overrides the catalog's 60-degree V. */
  profile?: readonly ProfilePoint[];
} & ShapePlacement;

export type ShapeRequest = ParametricShapeRequest | RevolveShapeRequest | ThreadShapeRequest;

/**
 * The fields a PATCH may change.
 *
 * Everything a summary reports is here, which is the point: a shape can be read,
 * one number changed, and the whole thing sent back. The kind is not in the type
 * -- a summary reports it as a plain string, so there is nothing to narrow on --
 * which means this is wider than any one shape accepts. The server refuses what
 * the shape's kind has no use for, naming the fields in `fields` on a
 * `422 unapplicable_fields`, rather than ignoring them as it used to.
 */
export type ShapePatch = ShapePlacement &
  ShapeDimensions &
  AnyKindFields &
  TaperFields &
  RevolveSettings & {
    locked?: boolean;
    hidden?: boolean;
    /** Replaces a revolve's outline; the sweep is rebuilt on the server. */
    profile?: readonly ProfilePoint[];
    /** The sweep's settings as one object, for a caller that keeps them together. */
    revolve?: RevolveSettings;
  };

/** How far round a sweep goes, and how fast it rises, as the server reports it. */
export type RevolveSummary = {
  startAngle: number;
  sweepAngle: number;
  /** Facets per full turn of the sweep, not a prism's side count. */
  sides: number;
  /** How finely a curved profile is sampled, 1 to 10. */
  quality: number;
  pitch: number;
  turns: number;
  coreRadius: number;
};

/** The operation a shape's geometry came out of, for the ones that have one. */
export type SketchOperation = "extrude" | "revolve" | "loft" | "sweep";

/**
 * A shape as the server reports it.
 *
 * `kind` is the stored kind rather than the requested one: a `cube` comes back
 * as a `box`, and a `revolve` or `thread` as a `mesh`, because that is what the
 * project holds. `requestKind` is the other half of that -- the kind a `POST`
 * would need to build the shape again, which is what tells a thread apart from
 * an imported STL when both store as `mesh`. It is absent for a shape no request
 * can reproduce, such as a boolean cut.
 *
 * Every per-kind parameter the server accepts also comes back, so a read,
 * change and write loses nothing; which ones are present depends on the kind.
 */
export type ShapeSummary = {
  id: string;
  name: string;
  kind: string;
  requestKind?: ShapeKind;
  sketchOperation?: SketchOperation;
  color: string;
  hole: boolean;
  locked: boolean;
  hidden: boolean;
  x: number;
  z: number;
  elevation: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  rotationX: number;
  rotationZ: number;
  steps?: number;
  sides?: number;
  bevel?: number;
  segments?: number;
  topRadius?: number;
  baseRadius?: number;
  teeth?: number;
  toothSize?: number;
  toothWidth?: number;
  centerHoleSize?: number;
  gearType?: GearKindType;
  helixAngle?: number;
  loftBottomShape?: LoftProfileShape;
  loftTopShape?: LoftProfileShape;
  loftTopWidth?: number;
  loftTopDepth?: number;
  loftBottomRotation?: number;
  loftTopRotation?: number;
  loftSegments?: number;
  loftLayers?: number;
  text?: string;
  font?: string;
  /** Present on a revolve or a thread: the sweep that built it. */
  revolve?: RevolveSummary;
  /**
   * The outline the sweep ran round, when it was described rather than drawn.
   *
   * A profile drawn in the editor can be several paths with curve handles, which
   * no list of `[x, z]` pairs describes, so it is omitted rather than flattened.
   */
  profile?: ProfilePoint[];
  groupedCount?: number;
} & TaperFields;

export type ProjectSummary = {
  id: string;
  name: string;
  /** How many shapes the project holds. */
  shapes: number;
  revision: number;
  updatedAt: number;
  packageBytes: number;
};

export type ProjectSnapGrid = { enabled?: boolean; size?: number } & Record<string, unknown>;

export type ProjectDetail = {
  id: string;
  name: string;
  createdAt: number;
  snapGrid: ProjectSnapGrid;
  workspace: Record<string, unknown>;
  shapes: ShapeSummary[];
};

export type EdgeSummary = {
  index: number;
  length: number;
  /** As OCCT names it: `line`, `circle`, `bspline`, or `unknown`. */
  curveType: string;
  midpoint: { x: number; y: number; z: number };
  /**
   * Whether a fillet or chamfer can act on this edge. A seam -- where one
   * curved surface meets itself -- has no two faces to blend, and naming one
   * explicitly is an error rather than a silent skip.
   */
  filletable: boolean;
};

export type EdgeTreatment = {
  kind: "fillet" | "chamfer";
  /** Fillet radius or chamfer distance, in mm. */
  amount: number;
  /** Chamfers only; 45 is symmetric. */
  angle?: number;
  /** Edge indexes from the edge listing, or omitted for every edge that can be treated. */
  edges?: readonly number[];
};

/**
 * The directions a shell request can name a face by, in the shape's own frame:
 * centred in X and Z with its base at the bottom, `front` towards the viewer.
 */
export const FACE_DIRECTIONS = ["top", "bottom", "left", "right", "front", "back"] as const;

export type FaceDirection = (typeof FACE_DIRECTIONS)[number];

export type FaceSummary = {
  index: number;
  /** As OCCT names the surface: `plane`, `cylinder`, `bspline`, or `unknown`. */
  surfaceType: string;
  area: number;
  /** Area-weighted centre, which is a real point on the face even when curved. */
  centroid: { x: number; y: number; z: number };
  /** The outward normal, or null for a surface that cannot report one. */
  normal: { x: number; y: number; z: number } | null;
  /**
   * The direction name this face answers to in a shell request.
   *
   * Only the outermost flat face pointing a given way takes the name: the floor
   * of a hollow part's cavity points up as surely as its lid does, and opening
   * the wrong one of those looks like nothing happened.
   */
  facing: FaceDirection | null;
};

export type ShellRequest = {
  /** Wall thickness in mm, measured inwards from the surface. */
  thickness: number;
  /**
   * Faces to leave open, as direction names or as indexes from the face
   * listing. Omitted or empty seals the hollow in.
   */
  openFaces?: readonly (FaceDirection | number)[];
};

/** The entities a measurement listing reports, one entry each. */
export const MEASUREMENT_ENTITIES = ["edge", "face"] as const;

export type MeasurementEntity = (typeof MEASUREMENT_ENTITIES)[number];

/**
 * What one end of a between-entities measurement names.
 *
 * `shape` is the whole solid, which is what "how far apart are these two parts"
 * means; `edge` and `face` narrow it to one entity of that solid.
 */
export const MEASUREMENT_END_ENTITIES = ["edge", "face", "shape"] as const;

export type MeasurementEndEntity = (typeof MEASUREMENT_END_ENTITIES)[number];

/**
 * Why there is no radius, instead of a guessed number.
 *
 * The first three answer for an edge and the last four for a face, which is
 * why they are one set: a caller reads them off `radiusUnavailable` without
 * having to know which entity it was looking at.
 */
export const MEASUREMENT_RADIUS_UNAVAILABLE_CODES = [
  "notCircular",
  "ellipseHasNoSingleRadius",
  "degenerateCurve",
  "notCurved",
  "radiusVariesOverSurface",
  "radiusNotReportedByKernel",
  "degenerateSurface",
] as const;

export type MeasurementRadiusUnavailableCode = (typeof MEASUREMENT_RADIUS_UNAVAILABLE_CODES)[number];

/** Why there is no angle. An angle is only defined between two flat faces. */
export const MEASUREMENT_ANGLE_UNAVAILABLE_CODES = ["notPlanar", "degenerateNormal"] as const;

export type MeasurementAngleUnavailableCode = (typeof MEASUREMENT_ANGLE_UNAVAILABLE_CODES)[number];

/**
 * Either reason, for a caller that only logs it.
 *
 * The server derives both from one union of its own, but the two fields draw
 * on disjoint halves of it -- a radius is never missing because a face was not
 * planar -- so each field is typed to its own half and this is the sum.
 */
export type MeasurementUnavailableCode = MeasurementRadiusUnavailableCode | MeasurementAngleUnavailableCode;

/**
 * One edge or face, measured from the exact B-rep rather than the mesh.
 *
 * `index` is the same index the edge and face listings give the entity, so a
 * measurement and the fillet that follows it name the same thing. The fields
 * that do not apply are `null` rather than zero: a face has no length, an edge
 * has no area, and a straight line has no radius -- and a radius of 0 would
 * read as a measurement rather than as the absence of one.
 */
export type MeasurementSummary = {
  entity: MeasurementEntity;
  index: number;
  /** As OCCT names it: `line`, `circle`, `ellipse`, `bspline` for an edge; `plane`, `cylinder`, `sphere`, `cone`, `torus` for a face. */
  geometryType: string;
  /** Edge length in mm, arcs measured along the curve. Null for a face. */
  length: number | null;
  /** Face area in mm^2. Null for an edge. */
  area: number | null;
  radius: number | null;
  diameter: number | null;
  /** Degrees a circular edge runs through; a full circle is 360. Null otherwise. */
  sweepDegrees: number | null;
  /** Why there is no radius. Null when one is reported. */
  radiusUnavailable: MeasurementRadiusUnavailableCode | null;
};

/**
 * One end of a between-entities measurement.
 *
 * The `shapeId` is required on each end rather than shared, because the two
 * ends may be different shapes -- which is the measurement the route exists
 * for. An `entity` left out means the whole shape, and takes no `index`.
 */
export type MeasurementEnd = {
  shapeId: string;
  entity?: MeasurementEndEntity;
  /** Which edge or face, from the measurement listing. Required for those two. */
  index?: number;
};

export type MeasurementPair = {
  /** Exact minimum distance between the two entities, in mm. Zero when they touch. */
  distance: number;
  /** Angle between two planar faces' outward normals, 0 to 180. Null otherwise. */
  angleDegrees: number | null;
  /** Why there is no angle. Null when one is reported. */
  angleUnavailable: MeasurementAngleUnavailableCode | null;
};

/** Which stored representation supplied the solid to the CAD kernel. */
export type ShapeGeometryProvenance = {
  source: "parametric" | "brep" | "mesh";
  precision: "exact" | "tessellated";
};

/** Exact mass properties for one shape in project coordinates. */
export type ShapeProperties = {
  volume: number;
  area: number;
  centerOfMass: { x: number; y: number; z: number };
  bbox: { xmin: number; ymin: number; zmin: number; xmax: number; ymax: number; zmax: number };
  isValid: boolean;
  provenance: ShapeGeometryProvenance;
};

/** Exact surface-gap and penetration report for selected visible solids. */
export type InterferenceReport = {
  shapesChecked: number;
  candidatePairsChecked: number;
  clearance: number;
  method: "OCCT exact distance and common volume; AABB candidate prefilter";
  pairs: Array<{
    a: { id: string; name: string };
    b: { id: string; name: string };
    gap: number;
    overlapVolume: number;
    precision: "exact" | "tessellated";
  }>;
};

export type InterferenceRequest = { ids?: readonly string[]; clearance?: number };

export const ALIGN_AXES = ["x", "y", "z"] as const;

/** `x` is left/right, `z` front/back, `y` bottom/top. */
export type AlignAxis = (typeof ALIGN_AXES)[number];

export const ALIGN_TARGETS = ["min", "center", "max"] as const;

/** Which edge or centre of each shape to line up. */
export type AlignTarget = (typeof ALIGN_TARGETS)[number];

export type AlignRequest = {
  ids: readonly string[];
  axis: AlignAxis;
  target: AlignTarget;
  /**
   * The shape to keep fixed.
   *
   * Omit and the reference is the box around the whole selection. A locked
   * shape in the selection becomes the anchor whatever this says, since it
   * cannot move, and the result reports which shape was used.
   */
  anchorId?: string;
};

export type AlignResult = {
  /** How many shapes actually moved. Zero means the selection was already flush. */
  moved: number;
  axis: AlignAxis;
  target: AlignTarget;
  anchorId: string | null;
  shapes: ShapeSummary[];
  revision: number;
};

export type MirrorAxis = "x" | "y" | "z";

/** Result of reflecting exact parameter-built solids across their selection bounds plane. */
export type BakedMirrorResult = {
  moved: number;
  axis: MirrorAxis;
  shapes: ShapeSummary[];
  revision: number;
};

export const DISTRIBUTE_SPACINGS = ["gaps", "centers"] as const;

/** `gaps` leaves equal clear space; `centers` puts the centres at an equal pitch. */
export type DistributeSpacing = (typeof DISTRIBUTE_SPACINGS)[number];

export type DistributeRequest = {
  ids: readonly string[];
  /** Omit to spread along whichever axis the shapes are already most spread along. */
  axis?: "x" | "z";
  spacing?: DistributeSpacing;
};

export type DistributeResult = {
  moved: number;
  axis: "x" | "z";
  spacing: DistributeSpacing;
  shapes: ShapeSummary[];
  revision: number;
};

export const PATTERN_KINDS = ["linear", "circular"] as const;

export type PatternKind = (typeof PATTERN_KINDS)[number];

export const MIN_PATTERN_COUNT = 2;
export const MAX_PATTERN_COUNT = 200;

export type PatternRequest = {
  ids: readonly string[];
  kind?: PatternKind;
  /** Total copies including the original, so 4 adds 3. From 2 to 200; default 4. */
  count?: number;
  /** `linear`: centre-to-centre step along each axis, in mm. A pitch, not a gap. */
  stepX?: number;
  stepZ?: number;
  /** `circular`: the point to turn about. Default the origin. */
  centerX?: number;
  centerZ?: number;
  /** `circular`: how far round to spread the copies, in degrees. Default 360. */
  sweepAngle?: number;
  /** `circular`: whether each copy turns to follow the ring. On by default. */
  rotateCopies?: boolean;
};

export type PatternResult = {
  /** How many copies were added, which is `count` minus the original. */
  created: number;
  kind: PatternKind;
  shapes: ShapeSummary[];
  revision: number;
};

export const IMPORTABLE_MESH_FORMATS = ["stl", "obj", "svg"] as const;

/** Axis-aligned section planes in the CAD drawing's Z-up coordinates. */
export const SECTION_PLANES = ["xy", "xz", "yz"] as const;
export type SectionPlane = (typeof SECTION_PLANES)[number];

export type SectionDrawingRequest = {
  plane: SectionPlane;
  /** Coordinate of the plane's omitted axis, in millimetres. */
  offset: number;
  shapeIds?: readonly string[];
  name?: string;
};

export type SectionDrawingArtifact = {
  filename: string;
  mimeType: "image/svg+xml";
  bytes: number;
  shapeCount: number;
  svg: string;
};

/**
 * A model file to import.
 *
 * `fileName` chooses the importer, names the stored asset, and for an STL
 * decides which way is up -- a slicer writes Z-up and SketchForge's own older
 * exports are Y-up, recognised by the word in the file header.
 */
export type MeshImportRequest = {
  fileName: string;
  bytes: Uint8Array;
  /** Recorded on the stored asset; the format's own default otherwise. */
  mediaType?: string;
};

/** The same three fields a treatment answers with; an import is one more of them. */
export type MeshImportResult = TreatmentResult;

export type ShapeWriteResult = { shapes: ShapeSummary[]; revision: number };
export type ShapePatchResult = { shape: ShapeSummary; revision: number };
export type TreatmentResult = { shape: ShapeSummary; triangles: number; revision: number };
/** The same three fields a treatment answers with; hollowing is one more of them. */
export type ShellResult = TreatmentResult;
export type DeleteResult = { deleted: true; id: string; revision?: number };
