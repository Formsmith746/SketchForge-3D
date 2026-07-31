import { describe, expect, it } from "vitest";
import { toSvgProjection } from "@/lib/svgExport";

describe("SVG projection export", () => {
  it("writes an SVG 1.1 document with millimeter dimensions and even-odd contours", () => {
    const svg = toSvgProjection([
      {
        name: "Plate & ring",
        color: "#d41721",
        polygons: [
          [[-5, -3], [5, -3], [5, 3], [-5, 3]],
          [[-2, -1], [-2, 1], [2, 1], [2, -1]],
        ],
      },
    ], "Fixture <top>");

    expect(svg).toContain('version="1.1"');
    expect(svg).toContain('width="10mm" height="6mm" viewBox="-5 -3 10 6"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('data-name="Plate &amp; ring"');
    expect(svg).toContain("<title>Fixture &lt;top&gt;</title>");
    expect(svg.match(/M/g)).toHaveLength(2);
  });

  it("rejects empty and zero-area projections", () => {
    expect(() => toSvgProjection([])).toThrow(/no readable contours/i);
    expect(() => toSvgProjection([{ name: "Line", color: "bad", polygons: [[[0, 0], [1, 0], [2, 0]]] }])).toThrow(/visible area/i);
  });
});
