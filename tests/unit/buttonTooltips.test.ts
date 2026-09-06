import { describe, expect, it } from "vitest";
import { buttonTooltipFromLabel, createButtonTooltipSync, type TooltipButton } from "@/lib/buttonTooltips";

function fakeButton(options: { title?: string; ariaLabel?: string; text?: string } = {}) {
  const attributes = new Map<string, string>();
  if (options.ariaLabel !== undefined) attributes.set("aria-label", options.ariaLabel);
  return {
    title: options.title ?? "",
    textContent: options.text ?? null,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAriaLabel: (value: string) => attributes.set("aria-label", value),
  } satisfies TooltipButton & { setAriaLabel: (value: string) => void };
}

describe("button tooltips", () => {
  it("derives the tooltip from the accessible name and collapses whitespace", () => {
    expect(buttonTooltipFromLabel(fakeButton({ ariaLabel: "Lock shape" }))).toBe("Lock shape");
    expect(buttonTooltipFromLabel(fakeButton({ text: "  Add\n  shape  " }))).toBe("Add shape");
    expect(buttonTooltipFromLabel(fakeButton({ ariaLabel: "Top view", text: "TOP" }))).toBe("Top view");
    expect(buttonTooltipFromLabel(fakeButton())).toBeNull();
    expect(buttonTooltipFromLabel(fakeButton({ text: "   " }))).toBeNull();
  });

  it("refreshes a generated tooltip when the accessible name changes", () => {
    const sync = createButtonTooltipSync();
    const lock = fakeButton({ ariaLabel: "Lock shape" });

    sync([lock]);
    expect(lock.title).toBe("Lock shape");

    lock.setAriaLabel("Unlock shape");
    sync([lock]);
    expect(lock.title).toBe("Unlock shape");
  });

  it("never overwrites a tooltip that came from the markup", () => {
    const sync = createButtonTooltipSync();
    // Real examples: title="Top view (5)" with aria-label="Top view", title="Undo" with aria-label="Sketch undo".
    const view = fakeButton({ title: "Top view (5)", ariaLabel: "Top view", text: "TOP" });
    const image = fakeButton({ title: "Unlock image before deleting", ariaLabel: "Delete sketch image" });

    sync([view, image]);
    expect(view.title).toBe("Top view (5)");
    expect(image.title).toBe("Unlock image before deleting");

    image.setAriaLabel("Delete sketch image now");
    sync([view, image]);
    expect(image.title).toBe("Unlock image before deleting");
  });

  it("stops managing a tooltip once the markup claims it", () => {
    const sync = createButtonTooltipSync();
    const button = fakeButton({ ariaLabel: "Hide shape" });

    sync([button]);
    expect(button.title).toBe("Hide shape");

    button.title = "Hide shape (H)";
    button.setAriaLabel("Show shape");
    sync([button]);
    expect(button.title).toBe("Hide shape (H)");
  });

  it("leaves buttons without an accessible name alone", () => {
    const sync = createButtonTooltipSync();
    const blank = fakeButton();

    sync([blank]);
    expect(blank.title).toBe("");
  });
});
