import { describe, expect, it } from "vitest";
import { CAMERA_FRAMING_PADDING, orthographicFramingZoom, perspectiveFramingDistance } from "@/lib/cameraFraming";

const FOV = 38;

// Half of the selection sphere as seen from the camera, in the vertical axis.
function verticalHalfAngle(radius: number, distance: number) {
  return Math.asin(radius / distance);
}

describe("perspective framing distance", () => {
  it("keeps the selection inside the vertical field of view on a wide viewport", () => {
    const radius = 30;
    const distance = perspectiveFramingDistance(radius, FOV, 16 / 9);

    // Wide viewports are limited by their height, so the sphere has to sit inside
    // half the vertical field of view, with the padding to spare.
    expect(verticalHalfAngle(radius, distance)).toBeLessThan((FOV / 2) * (Math.PI / 180));
    expect(distance).toBeCloseTo((radius / Math.sin((FOV / 2) * (Math.PI / 180))) * CAMERA_FRAMING_PADDING, 6);
  });

  it("backs further away on a tall viewport, where width is the limit", () => {
    const radius = 30;
    const wide = perspectiveFramingDistance(radius, FOV, 16 / 9);
    const tall = perspectiveFramingDistance(radius, FOV, 0.5);

    expect(tall).toBeGreaterThan(wide);
  });

  it("scales linearly with the size of the selection", () => {
    const small = perspectiveFramingDistance(10, FOV, 1.5);
    const large = perspectiveFramingDistance(40, FOV, 1.5);

    expect(large / small).toBeCloseTo(4, 10);
  });

  it("returns no distance for a selection without measurable size", () => {
    expect(perspectiveFramingDistance(0, FOV, 1.5)).toBe(0);
    expect(perspectiveFramingDistance(Number.NaN, FOV, 1.5)).toBe(0);
  });
});

describe("orthographic framing zoom", () => {
  it("fits the selection into the frustum with padding to spare", () => {
    const radius = 25;
    const halfHeight = 100;
    const zoom = orthographicFramingZoom(radius, halfHeight, 1.6) as number;

    // Visible half height shrinks with zoom; the sphere has to stay inside it.
    expect(halfHeight / zoom).toBeGreaterThan(radius);
    expect(zoom).toBeCloseTo(halfHeight / (radius * CAMERA_FRAMING_PADDING), 10);
  });

  it("uses the width when the viewport is taller than it is wide", () => {
    const radius = 25;
    const halfHeight = 100;
    const zoom = orthographicFramingZoom(radius, halfHeight, 0.5) as number;

    expect(zoom).toBeCloseTo((halfHeight * 0.5) / (radius * CAMERA_FRAMING_PADDING), 10);
  });

  it("refuses to zoom on unusable input instead of returning Infinity", () => {
    expect(orthographicFramingZoom(0, 100, 1.5)).toBeNull();
    expect(orthographicFramingZoom(25, 0, 1.5)).toBeNull();
    expect(orthographicFramingZoom(25, Number.NaN, 1.5)).toBeNull();
  });
});
