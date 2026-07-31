# Contributing

Thanks for helping improve SketchForge.

## Local Setup

```bash
npm install
npm run dev
```

The app runs at `http://127.0.0.1:3000/` by default.

## Before Opening a Pull Request

- Keep changes focused.
- Avoid unrelated refactors.
- Run `npm run typecheck`.
- Manually test the editor workflow you changed.
- Include screenshots or short recordings for UI changes when possible.
- Call out changes to storage, import, export, grouping, or undo/redo behavior.

## Areas That Need Care

- STL import/export
- Imported mesh transforms
- Grouping, hole subtraction, and ungrouping
- Undo/redo history
- Project persistence and dashboard thumbnails
- Shape gizmos, snapping, and rotated-object dimensions

## Style

- Prefer existing project patterns before adding new abstractions.
- Keep UI behavior local to the relevant component unless the behavior is shared.
- Use TypeScript types instead of loose object shapes where practical.
- Keep comments short and useful.

## Contribution Licensing

Unless explicitly agreed otherwise in writing, by submitting a contribution you license it under the MIT License. See [LICENSE](../LICENSE).
