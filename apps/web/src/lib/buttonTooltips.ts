export type TooltipButton = Pick<HTMLButtonElement, "title" | "textContent" | "getAttribute">;

export function buttonTooltipFromLabel(button: TooltipButton): string | null {
  const label = button.getAttribute("aria-label") ?? button.textContent?.trim();
  return label ? label.replace(/\s+/g, " ") : null;
}

export function createButtonTooltipSync() {
  const written = new WeakMap<TooltipButton, string>();

  return function syncButtonTooltips(buttons: Iterable<TooltipButton>) {
    for (const button of buttons) {
      const current = button.title;
      // A title authored in the markup wins: only tooltips this helper wrote are refreshed.
      if (current && written.get(button) !== current) continue;
      const next = buttonTooltipFromLabel(button);
      if (!next || next === current) continue;
      button.title = next;
      written.set(button, next);
    }
  };
}
