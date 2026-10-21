/**
 * The client, and the project handle a macro actually works through.
 *
 * Resources are plain objects hanging off the client, each owning one route.
 * A route added to the API later is a new file here and one more field; nothing
 * in the transport or the handle needs to know about it.
 */

import { SketchForgeApiError, SketchForgeTransportError } from "./errors.js";
import { Transport, type TransportOptions } from "./http.js";
import { Align, Distribute, Patterns } from "./resources/arrange.js";
import { Drawings } from "./resources/drawings.js";
import { Edges } from "./resources/edges.js";
import { Faces } from "./resources/faces.js";
import { Imports } from "./resources/imports.js";
import { Interference } from "./resources/interference.js";
import { Measurements } from "./resources/measurements.js";
import { Mirrors } from "./resources/mirrors.js";
import { Projects } from "./resources/projects.js";
import { Properties } from "./resources/properties.js";
import { Shapes } from "./resources/shapes.js";
import { Shell } from "./resources/shell.js";
import { Treatments } from "./resources/treatments.js";
import { Thickness } from "./resources/thickness.js";
import type {
  AlignRequest,
  BakedMirrorResult,
  MirrorAxis,
  AlignResult,
  DistributeRequest,
  DistributeResult,
  EdgeSummary,
  EdgeTreatment,
  FaceDirection,
  FaceSummary,
  MeasurementEnd,
  MeasurementPair,
  MeasurementSummary,
  ShapeProperties,
  MeshImportRequest,
  MeshImportResult,
  PatternRequest,
  PatternResult,
  ProjectDetail,
  ShapePatch,
  ShapeRequest,
  ShapeSummary,
  ShapeWriteResult,
  ShellRequest,
  ShellResult,
  TreatmentResult,
  SectionDrawingArtifact,
  SectionDrawingRequest,
} from "./types.js";

export type SketchForgeClientOptions = TransportOptions;

export class SketchForgeClient {
  readonly projects: Projects;
  readonly shapes: Shapes;
  readonly edges: Edges;
  readonly faces: Faces;
  readonly measurements: Measurements;
  readonly mirrors: Mirrors;
  readonly properties: Properties;
  readonly treatments: Treatments;
  readonly drawings: Drawings;
  readonly shell: Shell;
  readonly align: Align;
  readonly distribute: Distribute;
  readonly patterns: Patterns;
  readonly imports: Imports;
  readonly interference: Interference;
  readonly thickness: Thickness;
  private readonly transport: Transport;

  constructor(options: SketchForgeClientOptions) {
    this.transport = new Transport(options);
    this.projects = new Projects(this.transport);
    this.shapes = new Shapes(this.transport);
    this.edges = new Edges(this.transport);
    this.faces = new Faces(this.transport);
    this.measurements = new Measurements(this.transport);
    this.mirrors = new Mirrors(this.transport);
    this.properties = new Properties(this.transport);
    this.treatments = new Treatments(this.transport);
    this.drawings = new Drawings(this.transport);
    this.shell = new Shell(this.transport);
    this.align = new Align(this.transport);
    this.distribute = new Distribute(this.transport);
    this.patterns = new Patterns(this.transport);
    this.imports = new Imports(this.transport);
    this.interference = new Interference(this.transport);
    this.thickness = new Thickness(this.transport);
  }

  get apiRoot() {
    return this.transport.apiRoot;
  }

  /** A view of one project, so a macro does not thread its id through every call. */
  project(projectId: string) {
    return new ProjectHandle(this, projectId);
  }

  /**
   * Whether the API is reachable, enabled, and has storage.
   *
   * Worth calling first in anything interactive: the three ways this fails --
   * no token on the server, no project directory, wrong port -- are answered by
   * a 404, a 503 and a connection error, none of which reads as a
   * configuration mistake on its own.
   */
  async check(): Promise<{ ok: true; projects: number } | { ok: false; reason: string }> {
    try {
      const projects = await this.projects.list();
      return { ok: true, projects: projects.length };
    } catch (error) {
      if (error instanceof SketchForgeApiError) {
        if (error.looksDisabled) return { ok: false, reason: "The server has no SKETCHFORGE_API_TOKEN set, so the API is off." };
        if (error.needsStorage) return { ok: false, reason: "The server has no SKETCHFORGE_PROJECTS_DIR set, so it can store nothing." };
        if (error.status === 401) return { ok: false, reason: "The token was refused." };
        return { ok: false, reason: error.message };
      }
      if (error instanceof SketchForgeTransportError) return { ok: false, reason: error.message };
      throw error;
    }
  }
}

export class ProjectHandle {
  constructor(
    private readonly client: SketchForgeClient,
    readonly id: string,
  ) {}

  get(): Promise<ProjectDetail> {
    return this.client.projects.get(this.id);
  }

  delete() {
    return this.client.projects.delete(this.id);
  }

  listShapes(): Promise<ShapeSummary[]> {
    return this.client.shapes.list(this.id);
  }

  add(shape: ShapeRequest): Promise<ShapeSummary> {
    return this.client.shapes.create(this.id, shape);
  }

  addMany(shapes: readonly ShapeRequest[]): Promise<ShapeWriteResult> {
    return this.client.shapes.createMany(this.id, shapes);
  }

  update(shapeId: string, changes: ShapePatch) {
    return this.client.shapes.update(this.id, shapeId, changes);
  }

  remove(shapeId: string) {
    return this.client.shapes.delete(this.id, shapeId);
  }

  clear(): Promise<number> {
    return this.client.shapes.deleteAll(this.id);
  }

  edges(shapeId: string): Promise<EdgeSummary[]> {
    return this.client.edges.list(this.id, shapeId);
  }

  filletableEdges(shapeId: string): Promise<number[]> {
    return this.client.edges.filletableIndexes(this.id, shapeId);
  }

  treat(shapeId: string, treatment: EdgeTreatment): Promise<TreatmentResult> {
    return this.client.treatments.apply(this.id, shapeId, treatment);
  }

  fillet(shapeId: string, radius: number, edges?: readonly number[]) {
    return this.client.treatments.fillet(this.id, shapeId, radius, edges);
  }

  chamfer(shapeId: string, distance: number, options?: { angle?: number; edges?: readonly number[] }) {
    return this.client.treatments.chamfer(this.id, shapeId, distance, options);
  }

  faces(shapeId: string): Promise<FaceSummary[]> {
    return this.client.faces.list(this.id, shapeId);
  }

  facesFacing(shapeId: string, direction: FaceDirection): Promise<number[]> {
    return this.client.faces.facing(this.id, shapeId, direction);
  }

  measurements(shapeId: string): Promise<MeasurementSummary[]> {
    return this.client.measurements.list(this.id, shapeId);
  }

  propertiesOf(shapeId: string): Promise<ShapeProperties> {
    return this.client.properties.get(this.id, shapeId);
  }

  sectionDrawing(request: SectionDrawingRequest): Promise<SectionDrawingArtifact> {
    return this.client.drawings.section(this.id, request);
  }

  measurementsWithRadius(shapeId: string): Promise<MeasurementSummary[]> {
    return this.client.measurements.withRadius(this.id, shapeId);
  }

  /** The distance between two entities, which may be on two different shapes. */
  measureBetween(from: MeasurementEnd, to: MeasurementEnd): Promise<MeasurementPair> {
    return this.client.measurements.between(this.id, from, to);
  }

  /** Exact gaps and penetration volumes between selected project solids. */
  interferenceReport(request: import("./types.js").InterferenceRequest = {}) {
    return this.client.interference.check(this.id, request);
  }

  /** Reflects exact parameter-built solids across the selected bounds plane. */
  mirrorBaked(ids: readonly string[], axis: MirrorAxis): Promise<BakedMirrorResult> {
    return this.client.mirrors.bake(this.id, ids, axis);
  }

  /** Hollows the shape out, sealed unless `openFaces` names faces to leave off. */
  shell(shapeId: string, request: ShellRequest): Promise<ShellResult> {
    return this.client.shell.apply(this.id, shapeId, request);
  }

  hollow(shapeId: string, thickness: number) {
    return this.client.shell.hollow(this.id, shapeId, thickness);
  }

  tray(shapeId: string, thickness: number, openFaces?: ShellRequest["openFaces"]) {
    return this.client.shell.tray(this.id, shapeId, thickness, openFaces);
  }

  /** Puts one edge or one centre of every named shape on the same coordinate. */
  align(request: AlignRequest): Promise<AlignResult> {
    return this.client.align.apply(this.id, request);
  }

  /** Flush tops, which is the alignment a row of parts on a plate usually wants. */
  alignTops(ids: readonly string[], anchorId?: string) {
    return this.client.align.tops(this.id, ids, anchorId);
  }

  /** Spreads three or more shapes evenly; the outermost two define the span. */
  distribute(request: DistributeRequest): Promise<DistributeResult> {
    return this.client.distribute.apply(this.id, request);
  }

  /** Repeats shapes in a row or around a ring, adding the copies. */
  pattern(request: PatternRequest): Promise<PatternResult> {
    return this.client.patterns.apply(this.id, request);
  }

  /** A row at a centre-to-centre pitch; `count` includes the original. */
  row(ids: readonly string[], count: number, stepX: number, stepZ?: number) {
    return this.client.patterns.row(this.id, ids, count, stepX, stepZ);
  }

  /** A ring about a point, which is how a bolt circle is made. */
  ring(
    ids: readonly string[],
    count: number,
    center: { x: number; z: number },
    options?: { sweepAngle?: number; rotateCopies?: boolean },
  ) {
    return this.client.patterns.ring(this.id, ids, count, center, options);
  }

  /** Adds the model a file describes, keeping the file with the project. */
  importMesh(request: MeshImportRequest): Promise<MeshImportResult> {
    return this.client.imports.apply(this.id, request);
  }
}
