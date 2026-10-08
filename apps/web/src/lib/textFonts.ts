import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import helvetikerBoldFontJson from "three/examples/fonts/helvetiker_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";

export const DEFAULT_TEXT_FONT = "Multilanguage";

const fallbackFont = droidSansBoldFontJson as FontData;

/**
 * Adds the glyphs a font lacks from Droid Sans Bold (Cyrillic, Greek, extended Latin), so text in
 * those scripts is not drawn as "?". The font's own glyphs win, so text that rendered before keeps
 * exactly the same outlines. All bundled fonts share a 1000-unit em, so glyphs need no scaling.
 */
export function withFallbackGlyphs(font: FontData): FontData {
  return { ...font, glyphs: { ...fallbackFont.glyphs, ...font.glyphs } };
}

const loader = new FontLoader();

/** Text shape fonts by the name saved in projects. */
export const TEXT_FONTS: Readonly<Record<string, Font>> = {
  Multilanguage: loader.parse(withFallbackGlyphs(helvetikerBoldFontJson as FontData)),
  Sans: loader.parse(fallbackFont),
  Serif: loader.parse(withFallbackGlyphs(droidSerifBoldFontJson as FontData)),
  Script: loader.parse(withFallbackGlyphs(gentilisBoldFontJson as FontData)),
  Monospace: loader.parse(withFallbackGlyphs(droidMonoFontJson as FontData)),
  Rounded: loader.parse(withFallbackGlyphs(optimerBoldFontJson as FontData)),
  Stencil: loader.parse(withFallbackGlyphs(helvetikerBoldFontJson as FontData)),
};

export function textFont(name: string | undefined): Font {
  return TEXT_FONTS[name ?? DEFAULT_TEXT_FONT] ?? TEXT_FONTS[DEFAULT_TEXT_FONT];
}
