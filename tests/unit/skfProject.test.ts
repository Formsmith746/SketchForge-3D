import { afterEach, describe, expect, it, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { projectAssetFromBytes } from "@/lib/projectAssets";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import {
  exportSkfProject,
  importSkfProject,
  inspectSkfProjectPackage,
  SKF_FORMAT_VERSION,
  SKF_SCHEMA_ID,
  type SkfProjectDocumentV1,
  type SkfProjectExportInput,
} from "@/lib/skfProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { ShapeKind, WorkplaneShape } from "@/types/sketchforge";

function shape(kind: ShapeKind, id = `${kind}-1`, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id,
    name: kind,
    kind,
    color: "#12a4cc",
    x: 1,
    z: 2,
    elevation: 3,
    size: 20,
    width: 20,
    depth: 18,
    height: 16,
    rotation: 15,
    rotationX: 5,
    rotationZ: 10,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function input(shapes: WorkplaneShape[], overrides: Partial<SkfProjectExportInput> = {}): SkfProjectExportInput {
  const history = [editorHistoryEntry(shapes, [])];
  return {
    projectId: "project-original",
    projectName: "Round trip",
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_100_000,
    shapes,
    history,
    historyIndex: 0,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 12.5,
    ...overrides,
  };
}

function packageDocument(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return { files, document: JSON.parse(strFromU8(files["project.json"])) as SkfProjectDocumentV1 };
}

function mutateProject(bytes: Uint8Array, mutate: (document: SkfProjectDocumentV1) => void) {
  const files = unzipSync(bytes);
  const document = JSON.parse(strFromU8(files["project.json"])) as SkfProjectDocumentV1;
  mutate(document);
  files["project.json"] = strToU8(JSON.stringify(document));
  return zipSync(files);
}

describe("SketchForge .skf project packages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips every supported native shape kind and editable properties", async () => {
    const nativeKinds: ShapeKind[] = [
      "box", "cylinder", "sphere", "sketch", "scribble", "cone", "pyramid", "roof", "text", "roundRoof",
      "halfSphere", "torus", "tube", "gear", "ring", "wedge", "polygon", "icosahedron",
    ];
    const shapes = nativeKinds.map((kind, index) => shape(kind, `${kind}-${index}`, {
      hole: index === 2,
      locked: index === 3,
      hidden: index === 4,
      mirrorX: index === 5,
      sides: index + 3,
      teeth: kind === "gear" ? 18 : undefined,
      toothSize: kind === "gear" ? 3.25 : undefined,
      toothWidth: kind === "gear" ? 2.75 : undefined,
      centerHoleSize: kind === "gear" ? 7.5 : undefined,
      gearType: kind === "gear" ? "helical" : undefined,
      helixAngle: kind === "gear" ? -30 : undefined,
      helixQuality: kind === "gear" ? 24 : undefined,
      text: kind === "text" ? "Editable" : undefined,
      sketchProfile: kind === "sketch" ? {
        points: [
          { id: "p1", x: 0, z: 0 },
          { id: "p2", x: 10, z: 0 },
          { id: "p3", x: 10, z: 10 },
        ],
        segments: [
          { id: "s1", startId: "p1", endId: "p2", kind: "line" },
          { id: "s2", startId: "p2", endId: "p3", kind: "bezier" },
          { id: "s3", startId: "p3", endId: "p1", kind: "line" },
        ],
        constraints: [
          { id: "fixed-p1", kind: "fixed", pointId: "p1", x: 0, z: 0 },
          { id: "horizontal-s1", kind: "horizontal", segmentId: "s1" },
        ],
        dimensions: [{ id: "length-s1", kind: "length", segmentId: "s1", value: 10 }],
        texts: [{ id: "label-1", text: "10 mm", x: 5, z: -2, fontSize: 4 }],
      } : undefined,
    }));

    const exported = await exportSkfProject(input(shapes));
    const { document } = packageDocument(exported);
    const summary = await inspectSkfProjectPackage(exported);
    const restored = await importSkfProject(exported);

    expect(restored.projectName).toBe("Round trip");
    expect(restored.sourceProjectId).toBe("project-original");
    expect(JSON.stringify(restored.shapes)).toBe(JSON.stringify(shapes.map(canonicalizeShape)));
    expect(restored.workspace).toEqual(DEFAULT_WORKPLANE_WORKSPACE);
    expect(restored.snapGrid).toBe(DEFAULT_SNAP_GRID);
    expect(restored.placementElevation).toBe(12.5);
    expect(summary).toEqual({
      projectName: "Round trip",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      formatVersion: SKF_FORMAT_VERSION,
    });
    expect(document.assets.filter((entry) => entry.kind === "derived-mesh")).toHaveLength(0);
  });

  it("round-trips construction planes and sketch plane attachments", async () => {
    const pose = { origin: [12, 4, -3], quaternion: [0, 0, 0, 1] } as const;
    const plane = shape("constructionPlane", "plane-1", {
      name: "Offset XZ plane",
      constructionPlane: { kind: "principal", principal: "xz", offset: 4, pose },
      locked: true,
      height: 0.1,
    });
    const sketch = shape("mesh", "sketch-on-plane", {
      sketchProfile: {
        points: [{ id: "p1", x: 0, z: 0, projectionId: "projection-1" }, { id: "p2", x: 10, z: 0, projectionId: "projection-1" }, { id: "p3", x: 0, z: 10 }],
        segments: [
          { id: "s1", startId: "p1", endId: "p2", kind: "line", projectionId: "projection-1" },
          { id: "s2", startId: "p2", endId: "p3", kind: "line" },
          { id: "s3", startId: "p3", endId: "p1", kind: "line" },
        ],
        projections: [{ id: "projection-1", sourceShapeId: "source-shape", sourceName: "Source shape", sourceKind: "intersection" }],
      },
      sketchFeature: { kind: "extrusion" },
      sketchPlane: { constructionPlaneId: plane.id, pose, localCenter: [5, 8, 5] },
    });

    const restored = await importSkfProject(await exportSkfProject(input([plane, sketch])));

    expect(restored.shapes).toEqual([canonicalizeShape(plane), canonicalizeShape(sketch)]);
    expect(restored.shapes[0].constructionPlane?.kind).toBe("principal");
    expect(restored.shapes[1].sketchPlane?.constructionPlaneId).toBe("plane-1");
  });

  it("preserves editable revolve sketch settings and generated geometry", async () => {
    const revolve = shape("mesh", "revolve-sketch", {
      name: "Sketch revolve",
      sketchOperation: "revolve",
      sketchRevolve: { startAngle: 25, sweepAngle: -220, sides: 48, quality: 8, thickness: 1.5 },
      sketchProfile: {
        points: [{ id: "p1", x: -4, z: 0 }, { id: "p2", x: -8, z: 0 }, { id: "p3", x: -8, z: 16 }, { id: "p4", x: -4, z: 16 }],
        segments: [
          { id: "s1", startId: "p1", endId: "p2", kind: "line" },
          { id: "s2", startId: "p2", endId: "p3", kind: "line" },
          { id: "s3", startId: "p3", endId: "p4", kind: "line" },
          { id: "s4", startId: "p4", endId: "p1", kind: "line" },
        ],
      },
      importedMesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        baseWidth: 16,
        baseDepth: 16,
        baseHeight: 16,
        triangleCount: 1,
        sourceFormat: "json",
      },
    });
    const restored = await importSkfProject(await exportSkfProject(input([revolve])));
    expect(restored.shapes[0].sketchOperation).toBe("revolve");
    expect(restored.shapes[0].sketchRevolve).toEqual(revolve.sketchRevolve);
    expect(restored.shapes[0].sketchProfile).toEqual(revolve.sketchProfile);
    expect(restored.shapes[0].importedMesh?.positions).toEqual(revolve.importedMesh?.positions);
  });

  it("preserves nested groups, holes, intersection metadata, edge history, B-Rep, and undo/redo", async () => {
    const solid = shape("box", "solid", { x: 0 });
    const hole = shape("cylinder", "hole", { hole: true, color: "#b8c2cc", x: 4 });
    const group = shape("mesh", "group", {
      name: "Intersection",
      groupOperation: "intersection",
      groupedBaseWidth: 30,
      groupedBaseDepth: 30,
      groupedBaseHeight: 20,
      groupedShapes: [solid, hole],
      importedMesh: {
        positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        baseWidth: 2,
        baseDepth: 1,
        baseHeight: 2,
        triangleCount: 1,
        sourceFormat: "json",
      },
      cadBrep: "BREP exact payload",
      edgeTreatments: [{ kind: "fillet", amount: 1.25, edgeCount: 3 }],
      edgeTreatmentHistory: [{
        id: "edge-history-1",
        createdAt: 1_700_000_050_000,
        feature: { kind: "fillet", amount: 1.25, edgeCount: 3 },
        before: shape("box", "group", { width: 30, depth: 30, height: 20 }),
      }],
    });
    const before = editorHistoryEntry([solid, hole], ["solid", "hole"]);
    const after = editorHistoryEntry([group], ["group"]);
    const exported = await exportSkfProject(input([group], { history: [before, after], historyIndex: 1 }));
    const { document } = packageDocument(exported);

    expect(document.groups[0].operation).toBe("boolean-intersection");
    expect(document.features.some((feature) => feature.type === "fillet")).toBe(true);
    expect(document.exactCad).toHaveLength(1);

    const restored = await importSkfProject(exported);
    expect(restored.history).toHaveLength(2);
    expect(restored.historyIndex).toBe(1);
    expect(restored.shapes[0].groupedShapes).toEqual([solid, hole]);
    expect(restored.shapes[0].groupOperation).toBe("intersection");
    expect(restored.shapes[0].cadBrep).toBe("BREP exact payload");
    expect(restored.shapes[0].edgeTreatmentHistory?.[0].before.kind).toBe("box");
  });

  it("stores one original source asset for repeated imported instances and regenerates it once", async () => {
    const sourceBytes = strToU8("solid source");
    const asset = await projectAssetFromBytes("shared.stl", "stl", sourceBytes);
    const importedMesh: NonNullable<WorkplaneShape["importedMesh"]> = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat: "stl",
      assetId: asset.id,
    };
    const instances = [
      shape("mesh", "instance-a", { importedMesh, x: 0 }),
      shape("mesh", "instance-b", { importedMesh, x: 30 }),
    ];
    const exported = await exportSkfProject(input(instances, { assets: [asset] }));
    const { document } = packageDocument(exported);
    let importCalls = 0;
    const restored = await importSkfProject(exported, {
      sourceImporter: async () => {
        importCalls += 1;
        return { ...importedMesh, assetId: undefined };
      },
    });

    expect(document.assets.filter((entry) => entry.kind === "source")).toHaveLength(1);
    expect(document.assets.filter((entry) => entry.kind === "derived-mesh")).toHaveLength(0);
    expect(restored.assets).toHaveLength(1);
    expect(restored.shapes[0].importedMesh?.assetId).toBe(restored.shapes[1].importedMesh?.assetId);
    expect(importCalls).toBe(1);
  });

  it("exports and imports source-backed projects without Web Crypto", async () => {
    const sourceBytes = strToU8("solid http source");
    const asset = await projectAssetFromBytes("http.stl", "stl", sourceBytes);
    const importedMesh: NonNullable<WorkplaneShape["importedMesh"]> = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat: "stl",
      assetId: asset.id,
    };
    vi.stubGlobal("crypto", {});

    const exported = await exportSkfProject(input([shape("mesh", "http-object", { importedMesh })], { assets: [asset] }));
    const restored = await importSkfProject(exported, {
      sourceImporter: async () => ({ ...importedMesh, assetId: undefined }),
    });

    expect(packageDocument(exported).document.assets[0].sha256).toBe(asset.sha256);
    expect(restored.assets[0].sha256).toBe(asset.sha256);
    expect(restored.shapes[0].importedMesh?.assetId).toBe(restored.assets[0].id);
  });

  it.each(["svg", "step"] as const)("stores and restores original %s sources", async (sourceFormat) => {
    const asset = await projectAssetFromBytes(`source.${sourceFormat}`, sourceFormat, strToU8(`${sourceFormat} source`));
    const importedMesh: NonNullable<WorkplaneShape["importedMesh"]> = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat,
      assetId: asset.id,
      ...(sourceFormat === "step" ? { brepStep: "exact STEP" } : {}),
    };
    const exported = await exportSkfProject(input([shape("mesh", `${sourceFormat}-object`, { importedMesh })], { assets: [asset] }));
    const { document } = packageDocument(exported);
    const restored = await importSkfProject(exported, { sourceImporter: async () => importedMesh });

    expect(document.assets.filter((entry) => entry.kind === "source")).toHaveLength(1);
    expect(document.assets.filter((entry) => entry.kind === "derived-mesh")).toHaveLength(0);
    expect(restored.assets[0].sourceFormat).toBe(sourceFormat);
    expect(restored.shapes[0].importedMesh?.sourceFormat).toBe(sourceFormat);
    if (sourceFormat === "step") expect(document.exactCad[0].importedStepAssetId).toBeTruthy();
  });

  it("deduplicates and restores reference images stored in sketches and image plates", async () => {
    const dataUrl = "data:image/png;base64,AAECAwQ=";
    const imageShape = shape("sketch", "sketch-images", {
      imagePlate: { dataUrl, mimeType: "image/png", pixelWidth: 2, pixelHeight: 2 },
      sketchProfile: {
        points: [
          { id: "p1", x: 0, z: 0 },
          { id: "p2", x: 10, z: 0 },
          { id: "p3", x: 0, z: 10 },
        ],
        segments: [
          { id: "s1", startId: "p1", endId: "p2" },
          { id: "s2", startId: "p2", endId: "p3" },
          { id: "s3", startId: "p3", endId: "p1" },
        ],
        images: [{
          id: "image-1",
          name: "Reference",
          dataUrl,
          mimeType: "image/png",
          pixelWidth: 2,
          pixelHeight: 2,
          x: 0,
          z: 0,
          width: 10,
          depth: 10,
        }],
      },
    });
    const exported = await exportSkfProject(input([imageShape]));
    const { document } = packageDocument(exported);
    const restored = await importSkfProject(exported);

    expect(document.assets.filter((entry) => entry.kind === "image")).toHaveLength(1);
    expect(restored.shapes[0].imagePlate?.dataUrl).toBe(dataUrl);
    expect(restored.shapes[0].sketchProfile?.images?.[0].dataUrl).toBe(dataUrl);
  });

  it("deduplicates derived geometry when legacy imported objects share one mesh", async () => {
    const mesh = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat: "json" as const,
    };
    const exported = await exportSkfProject(input([
      shape("mesh", "legacy-a", { importedMesh: mesh }),
      shape("mesh", "legacy-b", { importedMesh: mesh }),
    ]));
    const { document } = packageDocument(exported);
    const restored = await importSkfProject(exported);

    expect(document.assets.filter((entry) => entry.kind === "derived-mesh")).toHaveLength(1);
    expect(restored.shapes[0].importedMesh?.positions).toEqual(mesh.positions);
    expect(restored.shapes[1].importedMesh?.positions).toEqual(mesh.positions);
  });

  it("exports in a far-western timezone without underflowing the ZIP 1980 date floor", async () => {
    // ZIP stores entry mtimes as DOS dates, and fflate encodes them with local-time
    // getters, rejecting years outside 1980-2099 with "date not in range 1980-2099".
    // A UTC-pinned epoch rolls back to 1979 west of UTC, so exercise the fix under the
    // most extreme western offset. Node re-reads process.env.TZ per Date operation.
    const originalTz = process.env.TZ;
    process.env.TZ = "Etc/GMT+12";
    try {
      const exported = await exportSkfProject(input([shape("box")]));
      const restored = await importSkfProject(exported);
      expect(restored.shapes[0].kind).toBe("box");
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("migrates the documented v0 JSON project without changing IDs", async () => {
    const box = shape("box", "legacy-box");
    const legacy = strToU8(JSON.stringify({
      schema: SKF_SCHEMA_ID,
      formatVersion: 0,
      project: { id: "legacy-project", name: "Legacy", createdAt: 100, modifiedAt: 200 },
      shapes: [box],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: "0.5 mm",
    }));

    const restored = await importSkfProject(legacy);

    expect(restored.migratedFromVersion).toBe(0);
    expect(restored.sourceProjectId).toBe("legacy-project");
    expect(restored.shapes[0].id).toBe("legacy-box");
    expect(restored.snapGrid).toBe("0.5 mm");
  });

  it("rejects unsupported future versions before restoring any state", async () => {
    const exported = await exportSkfProject(input([shape("box")]));
    const future = mutateProject(exported, (document) => {
      (document as { formatVersion: number }).formatVersion = SKF_FORMAT_VERSION + 1;
    });

    await expect(importSkfProject(future)).rejects.toThrow("requires a newer SketchForge version");
  });

  it("rejects missing references, duplicate IDs, cyclic groups, unknown operations, and corrupt assets", async () => {
    const twoShapes = await exportSkfProject(input([shape("box", "one"), shape("box", "two")]));
    const missing = mutateProject(twoShapes, (document) => {
      document.states[0].rootNodeIds[0] = "missing-node";
    });
    await expect(importSkfProject(missing)).rejects.toThrow("missing node");

    const duplicate = mutateProject(twoShapes, (document) => {
      const [first, second] = document.states[0].nodes;
      second.objectId = first.objectId;
      second.definition.id = first.objectId;
    });
    await expect(importSkfProject(duplicate)).rejects.toThrow("duplicate object ID");

    const grouped = await exportSkfProject(input([shape("mesh", "group-cycle", {
      groupedShapes: [shape("box", "child-a"), shape("box", "child-b")],
    })]));
    const cyclic = mutateProject(grouped, (document) => {
      const root = document.states[0].nodes.find((node) => node.objectId === "group-cycle")!;
      root.groupedShapeNodeIds = [root.nodeId];
    });
    await expect(importSkfProject(cyclic)).rejects.toThrow("Cyclic group");

    const unknownOperation = mutateProject(grouped, (document) => {
      document.features[0].type = "unsupported-operation";
    });
    await expect(importSkfProject(unknownOperation)).rejects.toThrow("Unknown operation type");

    const legacyMesh = await exportSkfProject(input([shape("mesh", "mesh", {
      importedMesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        baseWidth: 1,
        baseDepth: 1,
        baseHeight: 1,
        triangleCount: 1,
        sourceFormat: "json",
      },
    })]));
    const { files, document } = packageDocument(legacyMesh);
    const asset = document.assets.find((entry) => entry.kind === "derived-mesh")!;
    files[asset.path][20] ^= 0xff;
    await expect(importSkfProject(zipSync(files))).rejects.toThrow("integrity check");
  });
});
