import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import { cleanNearZero } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

export type KeyboardMovementEvent = Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "shiftKey">;

export function isMovementKey(key: string) {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key);
}

export function moveShapesByKeyboard(
  shapes: WorkplaneShape[], selectedIds: string[], event: KeyboardMovementEvent, workplane: PlacementWorkplane,
) {
  if (!isMovementKey(event.key)) return shapes;
  const step = event.shiftKey ? 5 : 1;
  const vertical = (event.ctrlKey || event.metaKey) && (event.key === "ArrowUp" || event.key === "ArrowDown");
  const axis = vertical ? workplane.normal
    : event.key === "ArrowLeft" || event.key === "ArrowRight" ? workplane.xAxis : workplane.zAxis;
  const sign = vertical ? (event.key === "ArrowUp" ? 1 : -1)
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const delta = step * sign;
  const selected = new Set(selectedIds);
  let changed = false;
  const next = shapes.map((shape) => {
    if (!selected.has(shape.id) || shape.locked) return shape;
    const x = cleanNearZero(shape.x + axis.x * delta);
    const z = cleanNearZero(shape.z + axis.z * delta);
    const elevation = cleanNearZero((shape.elevation ?? 0) + axis.y * delta);
    if (x === shape.x && z === shape.z && elevation === (shape.elevation ?? 0)) return shape;
    changed = true;
    return { ...shape, x, z, elevation };
  });
  return changed ? next : shapes;
}

// Keep this controller independent of render closures: every repeat must move
// the latest scene, and rerenders must not end the press-to-release interaction.
export function createKeyboardMovementInteraction(callbacks: {
  begin: () => boolean;
  move: (event: KeyboardMovementEvent) => void;
  end: () => void;
}) {
  const pressed = new Set<string>();
  const finish = () => {
    if (pressed.size === 0) return;
    pressed.clear();
    callbacks.end();
  };
  return {
    keyDown(event: KeyboardMovementEvent) {
      if (!isMovementKey(event.key)) return false;
      // A repeat after focus loss or interruption cannot start a new gesture.
      if (pressed.size === 0 && (event.repeat || !callbacks.begin())) return false;
      pressed.add(event.key);
      callbacks.move(event);
      return true;
    },
    keyUp(key: string) {
      if (!pressed.has(key)) return;
      if (pressed.size === 1) finish();
      else pressed.delete(key);
    },
    finish,
  };
}
