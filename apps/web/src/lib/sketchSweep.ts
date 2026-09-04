import * as THREE from "three";
import { orderedCadSketchPaths, type OrderedCadSketchPath, type OrderedCadSketchStep } from "@/lib/sketchCadProfile";
import type { SketchProfile } from "@/types/sketchforge";

export type ResolvedSketchSweep = {
  section: OrderedCadSketchPath;
  path: OrderedCadSketchPath;
};

export type SketchSweepGeometry = ResolvedSketchSweep & {
  geometry: THREE.ExtrudeGeometry;
};

export function resolveSketchSweep(profile: SketchProfile, selectedSegmentIds: readonly string[]): ResolvedSketchSweep {
  const selectedIds = new Set(selectedSegmentIds);
  const selectedSegments = profile.segments.filter((segment) => selectedIds.has(segment.id));
  if (selectedSegments.length < 4) {
    throw new Error("Select one closed profile and one open path before sweeping");
  }

  const selectedProfile: SketchProfile = { ...profile, segments: selectedSegments };
  const paths = orderedCadSketchPaths(selectedProfile);
  const closed = paths.filter((candidate) => candidate.closed);
  const open = paths.filter((candidate) => !candidate.closed);
  if (closed.length !== 1 || open.length !== 1 || paths.length !== 2) {
    throw new Error("Sweep needs exactly one closed profile and one separate open path");
  }
  if (open[0].steps.length < 1) {
    throw new Error("The sweep path must contain at least one segment");
  }
  return { section: closed[0], path: open[0] };
}

function addSectionStep(shape: THREE.Shape, step: OrderedCadSketchStep, centerX: number, centerZ: number) {
  const { segment, from, to } = step;
  const forward = segment.startId === from.id;
  const first = forward ? from.handleOut : from.handleIn;
  const second = forward ? to.handleIn : to.handleOut;
  if (segment.kind !== "line" && first && second) {
    shape.bezierCurveTo(
      first.x - centerX,
      -(first.z - centerZ),
      second.x - centerX,
      -(second.z - centerZ),
      to.x - centerX,
      -(to.z - centerZ),
    );
    return;
  }
  shape.lineTo(to.x - centerX, -(to.z - centerZ));
}

function orientedPathSteps(path: OrderedCadSketchPath, sectionCenter: { x: number; z: number }) {
  const first = path.steps[0]?.from;
  const last = path.steps.at(-1)?.to;
  if (!first || !last) return path.steps;
  const firstDistance = Math.hypot(first.x - sectionCenter.x, first.z - sectionCenter.z);
  const lastDistance = Math.hypot(last.x - sectionCenter.x, last.z - sectionCenter.z);
  if (firstDistance <= lastDistance) return path.steps;
  return [...path.steps].reverse().map((step) => ({ ...step, from: step.to, to: step.from }));
}

function addSweepPathStep(path: THREE.CurvePath<THREE.Vector3>, step: OrderedCadSketchStep) {
  const { segment, from, to } = step;
  const start = new THREE.Vector3(from.x, 0, from.z);
  const end = new THREE.Vector3(to.x, 0, to.z);
  const forward = segment.startId === from.id;
  const first = forward ? from.handleOut : from.handleIn;
  const second = forward ? to.handleIn : to.handleOut;
  if (segment.kind !== "line" && first && second) {
    path.add(new THREE.CubicBezierCurve3(
      start,
      new THREE.Vector3(first.x, 0, first.z),
      new THREE.Vector3(second.x, 0, second.z),
      end,
    ));
    return;
  }
  path.add(new THREE.LineCurve3(start, end));
}

export function buildSketchSweepGeometry(profile: SketchProfile, selectedSegmentIds: readonly string[]): SketchSweepGeometry {
  const resolved = resolveSketchSweep(profile, selectedSegmentIds);
  const sectionXs = resolved.section.points.map((point) => point.x);
  const sectionZs = resolved.section.points.map((point) => point.z);
  const center = {
    x: (Math.min(...sectionXs) + Math.max(...sectionXs)) / 2,
    z: (Math.min(...sectionZs) + Math.max(...sectionZs)) / 2,
  };
  const section = new THREE.Shape();
  const first = resolved.section.steps[0]?.from;
  if (!first) throw new Error("The sweep profile is empty");
  section.moveTo(first.x - center.x, -(first.z - center.z));
  resolved.section.steps.forEach((step) => addSectionStep(section, step, center.x, center.z));
  section.closePath();

  const path = new THREE.CurvePath<THREE.Vector3>();
  const pathSteps = orientedPathSteps(resolved.path, center);
  pathSteps.forEach((step) => addSweepPathStep(path, step));
  const approximateLength = pathSteps.reduce((length, step) => length + Math.hypot(step.to.x - step.from.x, step.to.z - step.from.z), 0);
  const steps = Math.min(256, Math.max(12, Math.ceil(approximateLength * 1.5), pathSteps.length * 8));
  const geometry = new THREE.ExtrudeGeometry(section, {
    steps,
    bevelEnabled: false,
    extrudePath: path,
    curveSegments: 24,
  });
  geometry.computeVertexNormals();
  return { ...resolved, geometry };
}
