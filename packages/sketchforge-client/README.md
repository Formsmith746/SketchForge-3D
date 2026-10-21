# @constructorfleet/sketchforge3d

A typed client for the [SketchForge REST API](../../docs/REST_API.md), and a runner for **macros**: short parameterised scripts that build a part.

```bash
npm install @constructorfleet/sketchforge3d
```

The API is headless -- it reads and writes projects in server-side storage with no browser open -- so a macro is a build script for a design, the way a Makefile is for a binary.

## The MCP bridge

This package also carries the SketchForge MCP server. It works against local
project files by default; an LLM can pass a `url` on an individual tool call to
target a running SketchForge server instead:

```json
{
  "mcpServers": {
    "sketchforge": {
      "command": "npx",
      "args": ["-y", "-p", "@constructorfleet/sketchforge3d", "sketchforge-mcp"],
      "env": { "SKETCHFORGE_PROJECTS_DIR": "/path/to/SketchForgeProjects" }
    }
  }
}
```

It speaks stdio JSON-RPC. Without `url`, project and geometry tools use the
local engine and `SKETCHFORGE_PROJECTS_DIR`, with no browser, HTTP server, or
API token. Pass `url: "http://127.0.0.1:3000"` to a tool call to use a running
server; editor tools then require an open editor tab (`/?editor=1`). Remote
REST operations also require `SKETCHFORGE_API_TOKEN` in the MCP process
environment.

Two of its tools run *macros* -- the scripts this package's runner executes --
and only files already sitting in `SKETCHFORGE_MACRO_DIR`. There is deliberately
no tool that accepts code to run. A Python macro needs `sketchforge3d` installed
from PyPI, since only a checkout carries the Python source.

## Connecting

```ts
import { SketchForgeClient } from "@constructorfleet/sketchforge3d";

const client = new SketchForgeClient({
  baseUrl: "http://localhost:3000",       // with or without /api/v1
  token: process.env.SKETCHFORGE_API_TOKEN!,
});

const health = await client.check();
if (!health.ok) throw new Error(health.reason);
```

`clientFromEnvironment()` does the same from `SKETCHFORGE_API_TOKEN` and `SKETCHFORGE_URL` (default `http://127.0.0.1:3000`). Prefer it: the token is a password for every project on the server and does not belong in a script or in shell history.

The server needs both `SKETCHFORGE_API_TOKEN` and `SKETCHFORGE_PROJECTS_DIR` set, or the API answers 404 and 503 respectively. `check()` tells you which.

## The client

```ts
new SketchForgeClient({ baseUrl, token, fetch?, timeoutMs?, retryOnBusy?, headers? })

client.apiRoot: string
client.check(): Promise<{ ok: true; projects: number } | { ok: false; reason: string }>
client.project(projectId): ProjectHandle

client.projects.list(): Promise<ProjectSummary[]>
client.projects.get(projectId): Promise<ProjectDetail>
client.projects.create(name): Promise<ProjectSummary>
client.projects.delete(projectId): Promise<DeleteResult>
client.projects.findByName(name): Promise<ProjectSummary | null>

client.shapes.list(projectId): Promise<ShapeSummary[]>
client.shapes.create(projectId, shape): Promise<ShapeSummary>
client.shapes.createMany(projectId, shapes): Promise<ShapeWriteResult>
client.shapes.update(projectId, shapeId, changes): Promise<ShapePatchResult>
client.shapes.delete(projectId, shapeId): Promise<DeleteResult>
client.shapes.deleteAll(projectId): Promise<number>

client.edges.list(projectId, shapeId): Promise<EdgeSummary[]>
client.edges.filletableIndexes(projectId, shapeId): Promise<number[]>

client.treatments.apply(projectId, shapeId, { kind, amount, angle?, edges? }): Promise<TreatmentResult>
client.treatments.fillet(projectId, shapeId, radius, edges?): Promise<TreatmentResult>
client.treatments.chamfer(projectId, shapeId, distance, { angle?, edges? }): Promise<TreatmentResult>

client.faces.list(projectId, shapeId): Promise<FaceSummary[]>
client.faces.facing(projectId, shapeId, direction): Promise<number[]>

client.measurements.list(projectId, shapeId): Promise<MeasurementSummary[]>
client.measurements.withRadius(projectId, shapeId): Promise<MeasurementSummary[]>
client.measurements.between(projectId, from, to): Promise<MeasurementPair>
client.properties.get(projectId, shapeId): Promise<ShapeProperties>
client.interference.check(projectId, { ids?, clearance? }): Promise<InterferenceReport>
client.mirrors.bake(projectId, ids, axis): Promise<BakedMirrorResult>
client.explosions.explode(projectId, shapeId): Promise<ShapeWriteResult>
client.thickness.estimate(projectId, shapeId): Promise<WallThicknessEstimate>
client.drawings.dxf(projectId, { plane, offset, shapeIds?, name? }): Promise<SectionDxfArtifact>

client.shell.apply(projectId, shapeId, { thickness, openFaces? }): Promise<ShellResult>
client.shell.hollow(projectId, shapeId, thickness): Promise<ShellResult>
client.shell.tray(projectId, shapeId, thickness, openFaces?): Promise<ShellResult>

client.align.apply(projectId, { ids, axis, target, anchorId? }): Promise<AlignResult>
client.align.tops(projectId, ids, anchorId?) | bottoms(...) | centers(projectId, ids, axis, anchorId?)

client.distribute.apply(projectId, { ids, axis?, spacing? }): Promise<DistributeResult>
client.distribute.gaps(projectId, ids, axis?) | pitch(projectId, ids, axis?)

client.patterns.apply(projectId, { ids, kind?, count?, stepX?, stepZ?, centerX?, centerZ?, sweepAngle?, rotateCopies? }): Promise<PatternResult>
client.patterns.row(projectId, ids, count, stepX, stepZ?): Promise<PatternResult>
client.patterns.ring(projectId, ids, count, { x, z }, { sweepAngle?, rotateCopies? }?): Promise<PatternResult>

client.imports.apply(projectId, { fileName, bytes, mediaType? }): Promise<MeshImportResult>
client.imports.readable(fileName): boolean
```

A `ProjectHandle` is the same surface with the project id bound, which is what a macro works through:

```ts
project.get() | delete() | listShapes() | add(shape) | addMany(shapes) | update(id, changes)
project.remove(id) | clear() | edges(id) | filletableEdges(id)
project.treat(id, treatment) | fillet(id, radius, edges?) | chamfer(id, distance, options?)
project.faces(id) | facesFacing(id, direction)
project.measurements(id) | measurementsWithRadius(id) | measureBetween(from, to) | propertiesOf(id) | interferenceReport({ ids?, clearance? })
project.sectionDrawing({ plane: "xy", offset: 3, shapeIds? })
project.sectionDxf({ plane: "xy", offset: 3, shapeIds? }) | estimateWallThickness(id) | explodeStepAssembly(id)
project.mirrorBaked(ids, axis)
project.shell(id, { thickness, openFaces? }) | hollow(id, thickness) | tray(id, thickness, openFaces?)
project.align({ ids, axis, target }) | alignTops(ids, anchorId?) | distribute({ ids, axis?, spacing? })
project.pattern(request) | row(ids, count, stepX, stepZ?) | ring(ids, count, { x, z }, options?)
project.importMesh({ fileName, bytes })
```

Shapes are described as parameters, with a union per kind so a field that belongs to another kind is a compile error:

```ts
await project.addMany([
  { kind: "box", name: "Plate", width: 120, depth: 40, height: 6 },
  { kind: "cylinder", width: 8, height: 12, sides: 6, x: -40, elevation: -1, hole: true },
  { kind: "thread", size: "M8", length: 10, hole: true, x: 40 },
  { kind: "revolve", profile: [[8, 0], [10, 0], [10, 2], [8, 2]], pitch: 6, turns: 6 },
]);
```

`addMany` is one write of the project package per request and splits lists longer than the server's 200-shape limit -- which also means a longer list is no longer atomic.

Failures are `SketchForgeApiError` (`status`, `detail`, plus `looksDisabled`, `needsStorage`, `isProjectBusy`) or `SketchForgeTransportError`. A write that lost the project's lock is retried; a *locked shape*, which answers 409 for an unrelated reason, is not.

## Macros

A macro is a file that exports a definition and builds something when it is handed a connected project:

```js
// macros/bolt-plate.macro.mjs
export default {
  name: "Bolt plate",
  project: { mode: "replace", name: "Bolt plate" },
  params: { holes: 5, spacing: 25, size: "M8", thickness: 8 },

  async run({ project, params, layout, log }) {
    log(`${params.holes} ${params.size} holes`);
    await project.addMany([
      { kind: "box", name: "Plate", width: 200, depth: 40, height: params.thickness },
      ...layout.row(params.holes, params.spacing).map((at, index) => ({
        kind: "thread",
        name: `hole ${index + 1}`,
        size: params.size,
        length: params.thickness + 2,
        hole: true,
        x: at.x,
        z: at.z,
        elevation: -1,
      })),
    ]);
  },
};
```

```bash
SKETCHFORGE_API_TOKEN=... npx sketchforge-macro macros/bolt-plate.macro.mjs --holes=7 --spacing=30
```

The context carries everything the macro needs -- `client`, `project`, `params`, `layout`, `log` -- so a macro file imports nothing and can live in any folder.

### Project modes, and why there is no default

The second run is what makes a macro useful or dangerous. A script that appends to a project it found doubles the part every time, and nobody notices until they open the project. So the mode is declared and the runner, not the macro body, acts on it:

| `project` | What the runner does first | Use it for |
| --- | --- | --- |
| `"fresh"` | Creates a new project, name stamped with the time | Something you generate several of to compare |
| `{ mode: "replace", name }` | Finds that project and **empties** it, or creates it | A part you iterate on; re-running is idempotent |
| `{ mode: "reuse", name }` | Finds or creates it, and leaves the contents alone | Adding a feature to whatever is there |
| `"target"` | Requires `SKETCHFORGE_PROJECT_ID` or `--project`, touches nothing else | Operating on a project someone else named |

A module that exports a bare function instead of a definition runs in a `fresh` project, because that is the only mode that is safe to assume.

### Parameters

`params` is both the defaults and the schema. A command-line override is coerced to the type of its default, and a name the macro does not declare is refused -- so `--hoels=7` is an error rather than a silently ignored typo. Parameters are resolved before the project is created, so a bad one costs nothing.

## Examples

`examples/` holds the three worked macros, which double as the integration tests:

| Macro | Builds |
| --- | --- |
| `bolt-plate.macro.mjs` | A plate sized around a computed row of tapped holes |
| `bolt-circle.macro.mjs` | A flange with N tapped holes on a ring of radius R |
| `filleted-box.macro.mjs` | A box from three numbers, with every roundable edge filleted on the server |

Tapped holes are `kind: "thread"` with `hole: true`: the form is cut wider by a clearance and the shape is marked as a hole, so grouping it with the plate in the editor taps the plate. The API has no grouping endpoint yet, so the macros stop at marked holes.

## Development

```bash
npm run client:build       # compile to dist/, from the repository root
npm run client:typecheck   # including the tests
npm test                   # unit tests, in the repository's vitest run
npm run test:integration   # the examples, against a live server
```

The integration tests need a real server and are not part of `npm test`:

```bash
SKETCHFORGE_PROJECTS_DIR=$(mktemp -d) SKETCHFORGE_API_TOKEN=test-token \
  npx next dev apps/web -p 3100 &
SKETCHFORGE_API_TOKEN=test-token SKETCHFORGE_URL=http://127.0.0.1:3100 npm run test:integration
```

## Publishing

See [docs/PUBLISHING_CLIENTS.md](../../docs/PUBLISHING_CLIENTS.md) for what has to be configured on npm before the release workflow can publish this package.

### Local MCP mode

The MCP uses the extracted engine package directly against project files, with no browser, HTTP server, or API token. Set `SKETCHFORGE_PROJECTS_DIR` to the directory containing `<projectId>.json` and `<projectId>.skf` files:

```bash
SKETCHFORGE_PROJECTS_DIR="$HOME/SketchForgeProjects" npm run mcp:sketchforge
```

The directory uses the same `<projectId>.json` and `<projectId>.skf` files as server-side project storage. In local mode, use `sketchforge_list_projects` to discover projects, `sketchforge_create_project` to start an empty one, or `sketchforge_import_project` with a local `.skf` `filePath` to add an existing package. These tools return the new `projectId` for other project tools. The configured directory is created when needed. `sketchforge_read_scene` accepts `shapeIds`, `excludeShapeIds`, `includeRawShapes`, and `includeRawShapeIds`; raw mesh geometry is omitted by default and can be requested for selected shapes. Mutation tools return compact shape metadata, while `sketchforge_list_objects` always returns object summaries. STL, OBJ, 3MF, ZIP-kit, SKF, STEP, and SVG exports can write to `outputPath`; the project name supplies the default filename. `sketchforge_project_view` returns the SVG drawing itself -- the kernel's hidden-line projection of the stored geometry, as the four-view grid or any one named view -- which is the readable picture of a part for an agent without vision. `sketchforge_section_view` returns exact section contours as SVG for a named `xy`, `xz`, or `yz` plane and an offset; the plane must cross the selected geometry.

Local mode covers project reads and edits, shape creation/import, arranging, mirroring, grouping, booleans, edge and face operations, measurements and per-shape mass properties, hollowing, mesh and STEP exports, scene topology, clearance and intersection checks, and JavaScript macros. Image capture rasterises that same drawing to a PNG (a named face is one view; `home` and `current` are the grid); it does not capture editor chrome or the live viewport camera. The npm MCP client and `@constructorfleet/sketchforge-engine` are published together by the release workflow. Editor discovery and editor error inspection require a URL and open editor. Python macros require a URL and the HTTP adapter.
