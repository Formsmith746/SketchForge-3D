# SketchForge project files (`.skf`)

`.skf` is SketchForge's native, editable project format. It is an additional backup, transfer, and sharing mechanism; IndexedDB autosave remains the normal local persistence system, and STL, OBJ, STEP, and SVG remain geometry exports.

## Architecture decision

SketchForge uses a packaged container (format option B). A `.skf` file is a ZIP archive containing `project.json` and deduplicated files below `assets/`.

This was selected over pure JSON because imported STL/STEP data and exact B-Rep can be large, Base64 would add size and parsing overhead, and an archive lets SketchForge validate and hash each asset independently. The editable model is still JSON and can be inspected by opening `project.json` from the package.

## Version 1 layout

```text
project.skf
├── project.json
└── assets/
    ├── source/          Original imported STL, SVG, or STEP files
    ├── derived-mesh/    Exact caches for baked operations or legacy imports
    ├── brep/            Exact STEP/B-Rep payloads
    └── image/           Deduplicated sketch/reference images
```

`project.json` contains these top-level sections:

- `schema`, `formatVersion`, `minimumReaderVersion`, and `createdWithVersion`
- `metadata`: project name, source project ID, units, and timestamps
- `assets`: path, type, byte length, SHA-256, source format, and media type
- `states`: explicit root node IDs and editable object graphs for the active scene and undo/redo states
- `history`: ordered state references, selection per state, and current undo/redo index
- `sketches`: sketch/extrusion indexes
- `features`: supported group, subtraction, intersection, mirror, sketch-extrusion, fillet, and chamfer operations used by the active project
- `groups`: explicit parent/member references and operation type
- `workplanes`: base and selected offset workplanes
- `exactCad`: objects with exact B-Rep or imported STEP sources
- `editor`: workspace dimensions, units, snap grid, and selected workplane elevation

Object nodes keep stable SketchForge object IDs. Groups refer to child node IDs instead of array positions. Fillet/chamfer history refers to explicit “before” nodes. Feature dependencies are explicit and checked for cycles.

## What is preserved

- All current native shape kinds and their editable parameters
- Position, rotation, dimensions, mirrors, colour, solid/hole role, visibility, and lock state
- Nested groups, boolean operands, subtraction results, and intersection metadata
- Sketch points, lines, Bezier/smooth handles, disjoint profiles, reference images, and extrusion depth
- Imported STL, SVG, and STEP sources, stored once and reused by instances
- Exact imported STEP data, current exact CAD B-Rep, display edges, chamfer/fillet settings, and reversible edge-treatment history
- Undo and redo states according to the export choice: Unlimited, 100, 50, or 30 recent actions. Unlimited means every state still retained by the editor, including available redo states.
- Workspace units, grid/snap settings, dimensions, and active offset workplane

Native primitives are regenerated from definitions and do not receive mesh assets. Source-backed STL, SVG, and STEP objects are regenerated from their original asset. Derived mesh assets are written only when the current editor has genuinely baked geometry (for example a boolean or edge treatment), or when an older local project no longer has its original imported source.

## Opening safely

SketchForge inspects ZIP metadata before expansion and validates the entire project before changing local state. It rejects unsafe paths, encrypted or unsupported compression, excessive expansion, malformed shapes/sketches, duplicate IDs, missing assets, hash mismatches, invalid transforms, unknown shape or operation types, cyclic groups/features, and unsupported versions.

Opening a valid `.skf` creates a new local project. It does not overwrite the project that is currently open. The imported project is then saved through the existing dashboard, thumbnail, IndexedDB, history, and editor lifecycle.

Current safety limits are 512 MB compressed, 1 GB expanded, 256 MB per asset, 32 MB for `project.json`, 4,096 archive entries, 100,000 object nodes per state, and 5,001 distinct states. The live editor retains at most 5,000 history entries and 64 MB of serialized history, so Unlimited means all history currently available inside those safety limits.

## Compatibility and migrations

The current format is version 1. Readers refuse a higher `formatVersion` or `minimumReaderVersion` instead of partially loading it. The importer also contains an explicit migration for the documented version 0 pure-JSON prototype and preserves its object IDs and valid history.

Future schema changes should add a version-to-version migration, run validation after every migration, and never mutate the user's original file.

## Current limitations

- Projects created before source-asset tracking cannot recover the exact original STL/SVG file. Their existing normalized editable mesh is preserved as a deduplicated legacy cache and is identified by the absence of a source asset.
- SketchForge currently bakes the displayed result of booleans and edge treatments. `.skf` preserves the operands, group hierarchy, feature metadata, reversible history, exact B-Rep where available, and a derived-result cache; it does not add a new live parametric feature editor that the application does not yet have.
- The current workplane system stores a base plane plus numeric offset. It does not expose persistent associative face-workplane references, so `.skf` cannot preserve an association that the editor itself does not model.
- Geometric sketch constraints and dimensions are not yet part of SketchForge's sketch data model. Existing points, segments, curve handles, profiles, and extrusion depth are preserved exactly.
- Camera position is intentionally omitted because the current project persistence system does not own it. It can be added as optional editor state in a compatible future version.
- OBJ is currently an export format, not an import format. An OBJ source-asset record is reserved in the schema for future import support.
