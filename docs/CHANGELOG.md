# Changelog

## 1.0.9

- Corrected Top and Bottom camera views so they align exactly with the vertical axis in both perspective and orthographic projection.
- Added Ctrl/Cmd + right-button panning in Sketch mode while preserving middle-button panning.

## 1.0.8

- Duplicated objects now stay in the exact position of their source instead of receiving an automatic offset.
- Added geometry shortcuts: `R` rotates selected objects by 45 degrees and `Shift+R` rotates them by 22.5 degrees around the active workplane normal.
- Corrected rotation controls so objects turn in the direction indicated by the pointer on every rotation plane.
- Kept selection outlines, resize anchors, and height controls stable during close zoom while naturally hiding controls that leave the viewport.
- Kept object faces visible from inside the object and hid rotation controls while the camera is inside the selection.

## 1.0.7

- Raised the supported `project.json` size in `.skf` packages from 32 MiB to 64 MiB and compacted new project exports without removing editable data.
- Reused decoded derived-mesh data across restored history states to reduce memory pressure when opening large `.skf` projects.
- Prevented workspace-only changes from advancing the persisted shape revision and replacing newer live objects with an older snapshot.

## 1.0.6

- Fixed dense STL imports failing with `Invalid string length` while creating their initial undo-history fingerprint.
- Streamed large numeric mesh arrays into deterministic hashes instead of converting millions of coordinates to one oversized JSON string.

## 1.0.5

- Made the rotation handles larger and aligned their arrow glyphs with the model faces as the camera moves, including stable behavior on long objects.
- Positioned the lower rotation handle consistently at the model base and corrected its visual and drag directions.
- Added an optional **Select before moving** workspace setting so the first click selects an object without immediately dragging it.

## 1.0.4

- Fixed imported STL objects briefly appearing and then vanishing when a stale IndexedDB project read completed after the import.
- Prevented older persisted project data from overwriting newer live editor state during asynchronous project hydration.

## 0.1.0

- Initial open-source alpha.
- Browser-based 3D workspace with primitive shape editing.
- STL import and STL/OBJ export.
- Grouping and hole subtraction workflows.
- Local project dashboard with generated thumbnails.
