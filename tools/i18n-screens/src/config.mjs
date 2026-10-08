/** Text that is the same in every language on purpose; not reported as "same as English". */
export const SAME_TEXT_ALLOWED = [
  // Brand, formats, licences, key names
  /^SketchForge$/,
  /^(STL|OBJ|STEP|STP|SVG|SKF|PNG|JPEG|HEX|B-Rep|OpenCascade|AGPLv3|3D|2D|X|Y|Z)$/i,
  /^(Shift|Enter|Escape|Esc|Ctrl|Cmd|Alt|Option|Tab|Delete|Del|Space)(\s*[/+]\s*(Shift|Ctrl|Cmd|Alt|Option))*$/,
  /^CAD( \/ B-Rep)?$/,
  // Numbers, sizes, coordinates, versions, colours, percentages
  /^[\d\s.,:×x%°+\-/()#]*(mm|cm|m|in|ft)?$/i,
  /^v?\d+(\.\d+)+$/,
  /^#[0-9a-f]{3,8}$/i,
  // File names and paths
  /\.[a-z0-9]{2,4}$/i,
  /^\.\s*[a-z0-9]{2,4}$/i,
  /^[A-Z]:\\/,
  // Default project and object names are saved in English by design (docs/TRANSLATIONS.md)
  /^(Untitled design( \d+)?|Imported design.*|Key Tag|Personalized Nameplate|TEXT|ALEX)$/,
];

export const CATEGORY = {
  clipped: { label: "Clipped", severity: 3, meaning: "text is cut off by its box or field" },
  overflow: { label: "Sticks out", severity: 3, meaning: "text extends past the button or cell that holds it" },
  wrap: { label: "Extra wrap", severity: 2, meaning: "text wraps onto more lines than in the baseline language" },
  same: { label: "Same as baseline", severity: 1, meaning: "text is identical to the baseline language, possibly untranslated" },
  baseline: { label: "Also in baseline", severity: 0, meaning: "the baseline language has the same problem, so it is a layout issue rather than a translation issue" },
};
