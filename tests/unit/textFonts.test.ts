import { describe, expect, it } from "vitest";
import type { FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import helvetikerBoldFontJson from "three/examples/fonts/helvetiker_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";
import { DEFAULT_TEXT_FONT, TEXT_FONTS, textFont } from "@/lib/textFonts";

const RUSSIAN = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const SOURCES: Record<string, FontData> = {
  Multilanguage: helvetikerBoldFontJson as FontData,
  Sans: droidSansBoldFontJson as FontData,
  Serif: droidSerifBoldFontJson as FontData,
  Script: gentilisBoldFontJson as FontData,
  Monospace: droidMonoFontJson as FontData,
  Rounded: optimerBoldFontJson as FontData,
  Stencil: helvetikerBoldFontJson as FontData,
};
const outlinePoints = (name: string, text: string) =>
  textFont(name).generateShapes(text, 10).reduce((total, shape) => total + shape.getPoints().length, 0);

describe("text fonts", () => {
  it.each(Object.keys(SOURCES))("%s has every Russian letter", (name) => {
    const glyphs = TEXT_FONTS[name].data.glyphs;
    expect([...RUSSIAN].filter((char) => !(char in glyphs))).toEqual([]);
  });

  it.each(Object.keys(SOURCES))("%s keeps its own glyphs, so existing text keeps its shape", (name) => {
    const source = SOURCES[name];
    const glyphs = TEXT_FONTS[name].data.glyphs;
    for (const [char, glyph] of Object.entries(source.glyphs)) expect(glyphs[char]).toEqual(glyph);
  });

  it("borrows glyphs only between fonts with the same em size", () => {
    for (const source of Object.values(SOURCES)) expect(source.resolution).toBe((droidSansBoldFontJson as FontData).resolution);
  });

  it("draws Cyrillic letters instead of question marks", () => {
    expect(outlinePoints(DEFAULT_TEXT_FONT, "Ж")).not.toBe(outlinePoints(DEFAULT_TEXT_FONT, "?"));
    expect(outlinePoints("Script", "Привет")).toBeGreaterThan(0);
  });

  it("falls back to the default font for an unknown name", () => {
    expect(textFont("Comic")).toBe(TEXT_FONTS[DEFAULT_TEXT_FONT]);
    expect(textFont(undefined)).toBe(TEXT_FONTS[DEFAULT_TEXT_FONT]);
  });
});
