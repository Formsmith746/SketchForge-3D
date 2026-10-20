export type SketchPointerModifiers = {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
};

export function isSketchPanGesture(event: SketchPointerModifiers) {
  return event.button === 1 || (event.button === 2 && (event.ctrlKey || event.metaKey));
}
