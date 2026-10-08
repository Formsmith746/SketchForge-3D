# German (de) language guide

Binding for the German catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the German translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user as „Sie“, as Autodesk Tinkercad and Fusion do in German: „Wählen Sie …“, „Klicken Sie auf …“.
  Tutorial step titles are infinitive phrases: „Bohrung erstellen“.
- Buttons and menu commands — infinitive: „Speichern“, „Gruppieren“, „Gruppierung aufheben“.
- Toolbar section labels — infinitive or noun, as in Fusion („ERSTELLEN“, „ÄNDERN“, „PRÜFEN“): „Ändern“, „Anordnen“,
  „Prüfen“, „Fertigstellen“. CAD operations and drawing tools — nouns: „Abrundung“, „Fase“, „Schnittmenge“, „Linie“,
  „Radierer“; „Messen“ and „Auswählen“ as in Fusion.
- Quotes „…“ (U+201E, U+201C). Names of projects and objects in messages go in quotes: Projekt „{name}“. Names of UI
  controls in instructions too: Klicken Sie auf „Gruppieren“.
- Non-breaking space between a number and its unit: `20 mm`, `22 MB`, `50 %`. Angles without a space: `45°`.
- Decimal separator — a point, because the UI shows values with a point (snap grid menu „0.5 mm“, fillet radius „1.00“):
  write „0.5 mm“ in instructions so the text matches the screen. Group thousands with a non-breaking space, never a
  point: `180 000` (a point would read as a decimal point next to „0.5“).
- Dash with spaces – (en dash), not —.
- No full stop at the end of labels and tooltips.
- Key names stay as printed in the source: Shift, Ctrl, Enter (German keyboards print Strg/Umschalt; see open questions
  in the pull request).
- National standards for terms: DIN (e.g. DIN 3960 for gears: Zähnezahl, Schrägungswinkel, Stirnrad, Kegelrad).

## Glossary

| English | Deutsch | Note |
|---|---|---|
| workplane | Arbeitsebene | Tinkercad, Fusion |
| grid / visible grid | Raster | grid step — Rasterweite |
| snap grid (step setting) | Fangraster | Tinkercad; value „Aus“ for off |
| snap to grid (command) / snapping | am Raster einrasten / Einrasten | not „ausrichten“: that is align |
| sketch | Skizze | |
| profile (closed sketch loop) | Profil | the account panel is „Benutzer“, not „Profil“ |
| extrude / extrusion | extrudieren / Extrusion | Fusion |
| revolve | Rotation; revolved solid — Rotationskörper; revolve axis — Rotationsachse | not „Drehung“: reserved for rotate. „Rotationskörper“ is school maths |
| rotation / rotate (object) | Drehung / drehen | Tinkercad |
| fillet | Abrundung / abrunden | Fusion |
| chamfer, bevel | Fase / fasen (gefast) | Fusion; text bevel is „Fase“ too |
| edge treatment / edge modifier | Kantenbearbeitung | |
| edge feature | Abrundung oder Fase; plural — Abrundungen und Fasen | |
| CAD worker / kernel (edge tools) | Modul für Abrundungen und Fasen | for sketches: describe the result („Form aus der Skizze“), not the kernel |
| handle (curve control) | Ziehpunkt; curve handle — Ziehpunkt der Kurve | as Office „Ziehpunkte“ |
| align / mirror handles | Punkte zum Ausrichten / Pfeile zum Spiegeln | what the user sees on the canvas |
| corner / smooth point | eckiger / glatter Punkt; buttons „Eckig“ / „Glatt“ / „Trennen“ | „Eckpunkt“ is reserved for mesh vertex |
| SVG path | Pfad | as Inkscape; a sketch profile stays „Profil“ |
| SVG stroke / contour | Kontur / Umriss | Inkscape and Illustrator call a stroke „Kontur“; a filled outline is „Umriss“ |
| align | ausrichten | Tinkercad |
| align left / center (X) / middle (Y, Z) … | am linken Rand / an der Mitte / an der Mitte / am vorderen Rand … | inserted into „{count} Formen {direction} ausgerichtet“; „Rand“, not „Kante“: that is a model edge |
| alignment anchor / reference | Bezug für das Ausrichten | |
| solid (vs hole) | Volumenkörper | Tinkercad |
| hole | Bohrung | Tinkercad; gaps in a mesh are „Lücken“, openings in an SVG outline „Öffnungen“ |
| boolean cut / subtract | abziehen (eine Bohrung abziehen) | not „ausschneiden“: that is the clipboard cut |
| union | Vereinigung | school maths |
| intersect | Schnittmenge | school maths, Inventor |
| separate parts | in Teile zerlegen | not „trennen“: reserved for splitting curve handles |
| group / ungroup | gruppieren / Gruppierung aufheben | Tinkercad, Office |
| mirror | spiegeln; axis — von links nach rechts / von oben nach unten / von vorne nach hinten | |
| duplicate | duplizieren | Tinkercad |
| copy / cut / paste | kopieren / ausschneiden / einfügen | |
| undo / redo | rückgängig machen / wiederholen; buttons „Rückgängig“ / „Wiederholen“ | |
| select / selection / selected | auswählen / Auswahl / ausgewählt | one verb for scene, lists and dialogs; tool name „Auswählen“ |
| cancel (button) / undo | Abbrechen / Rückgängig | never „Abbrechen“ for undo |
| action (history step) | Aktion | not „Schritt“: reserved for tutorial steps |
| menu of an item („actions for …“) | Menü für „{name}“; Befehle (point, ruler menus) | keeps „Aktion“ for history |
| history (toolbar section, settings nav) | Verlauf | short form of „Änderungsverlauf“ |
| history (undo) | Änderungsverlauf | |
| unlimited | unbegrenzt | |
| custom (value, colour, limit) | eigener Wert / eigene Farbe / eigene Größengrenze | not „benutzerdefiniert“: too long for the controls |
| default | Standard; app default — Standard: {value} | |
| shape | Form | Tinkercad „Formen“, „Grundformen“ |
| basic shapes | Grundformen | Tinkercad |
| object | Objekt | |
| body (STEP) | Körper | |
| mesh | Modell; Polygonnetz only where the mesh itself matters (errors about triangles) | not „Mesh“ |
| watertight / manifold mesh | geschlossenes Modell ohne Lücken; non-manifold edge — Kante mit mehr als zwei Flächen | not „mannigfaltig“ |
| triangle (mesh) | Dreieck | |
| zero-area (degenerate) | ohne Flächeninhalt | school maths |
| edge / face / vertex | Kante / Fläche / Eckpunkt | Blender German „Eckpunkt“ |
| normal | Normale | |
| dimension | Maß; dimensions — Maße | |
| width / depth / height | Breite / Tiefe / Höhe | |
| length (shape size along the depth axis) | Länge | the English UI labels this axis Length |
| top / base radius, top / bottom length | Radius oben / unten, Länge oben / unten | |
| thickness | Dicke | |
| sides / steps / segments | Seiten / Schritte / Segmente | Tinkercad inspector |
| taper | Verjüngung | |
| bricks / stud (units) | Bausteine / Noppen | LEGO-type bricks; snap value „Baustein“ |
| inch / foot; imperial units | Zoll / Fuß; Zoll und Fuß | not „imperial“ |
| elevation | Höhe über der Arbeitsebene | |
| lift (handle) | anheben | |
| drop to workplane | auf Arbeitsebene ablegen | Tinkercad „Ablegen“ |
| resize | Größe ändern | |
| scale (object) | skalieren | |
| scale (drawing, 1:10) | Maßstab | |
| zoom (view) | zoomen; zoom in / out — hineinzoomen / herauszoomen | never „vergrößern / verkleinern“: reads as resizing the object |
| orbit | Ansicht drehen | Autodesk „Orbit“ is unclear to the audience |
| pan | Ansicht verschieben | Autodesk „Schwenken“ is unclear to the audience |
| fit / zoom to fit | alles zeigen | |
| show / hide (objects, panels) | einblenden / ausblenden | Tinkercad; „anzeigen“ only for display options („Schatten anzeigen“) |
| lock / unlock | sperren / entsperren; padlock — Schloss | Tinkercad |
| shape panel / shape settings (inspector) | Formeinstellungen | the panel's header shows the shape name |
| rename | umbenennen | |
| home view (camera) | Startansicht | Tinkercad |
| view cube; faces | Ansichtswürfel; OBEN / UNTEN / VORNE / HINTEN / RECHTS / LINKS | Autodesk German ViewCube |
| top / front … view | Ansicht von oben / von vorne … | not „Draufsicht“, „Vorderansicht“: drawing terms |
| wireframe | Drahtmodell | |
| units | Maßeinheiten; settings section „Einheiten“ | |
| box | Quader | Tinkercad; not „Würfel“ |
| cube (default name) | Würfel | only for an equal-sided box |
| cylinder / sphere / half sphere / cone / pyramid / torus | Zylinder / Kugel / Halbkugel / Kegel / Pyramide / Torus | |
| roof / round roof | Dach / Rundes Dach | |
| tube | Rohr | |
| wedge | Keil | |
| polygon | Polygon | |
| gear; spur / helical / bevel gear | Zahnrad; Stirnrad / Schrägstirnrad / Kegelrad | DIN 3960 |
| teeth (count) / tooth | Zähnezahl / Zahn; section — Zähne | DIN 3960 |
| helix angle; helix (section) | Schrägungswinkel; Schrägung | DIN 3960 |
| center hole | Mittelbohrung | |
| scribble | Freihandzeichnung | |
| sketch shapes: line, Bézier curve, smooth curve, rectangle, circle, triangle, hexagon | Linie, Bézierkurve, glatte Kurve, Rechteck, Kreis, Dreieck, Sechseck | |
| erase (tool) | Radierer | |
| measure / ruler | Messen / Lineal | Fusion, Tinkercad |
| reference image (sketch) | Bild als Vorlage; default name „Bild“ | |
| import / export | Import / Export; importieren / exportieren | |
| project | Projekt | also for „design“ |
| local project | Projekt in diesem Browser | |
| shared project / shared storage | geteiltes Projekt / geteilte Projekte | save to shared — als geteiltes Projekt speichern |
| dashboard / home page | Startseite; nav and section label — Start | |
| thumbnail / snapshot (project card) | Vorschaubild | |
| asset / resource (project file) | Ressource | |
| source file (imported) | Originaldatei | |
| feature (project file) | Operation | |
| state (project file) | Zustand | |
| corrupted project file (error prefix) | Projektdatei beschädigt: | |
| settings | Einstellungen | the dashboard menu item and the title of the panel it opens: „Optionen“ (the menu is about 75 px wide) |
| workspace | Arbeitsbereich | Fusion |
| toolbar | Werkzeugleiste | |
| appearance / theme | Darstellung / Farbschema | |
| system (language, theme) | Wie im System | |
| update | Update / aktualisieren; check for updates — nach Updates suchen | Windows German |
| refresh (list) | neu laden | keeps „aktualisieren“ for updates |
| you (addressing the user) | Sie | |
| challenge | Aufgabe | |
| tutorial | Anleitung | |
| key tag / nameplate | Schlüsselanhänger / Namensschild | |
| sort: recent | Zuletzt geändert | |
| shape defaults | Startwerte für Formen | not „Standardformen“: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | 3D-Modell | not „Geometrie“: reads as the school subject; pairs with „Skizze“ as 3D vs 2D |
| slicer | Slicer (Programm zur Druckvorbereitung) | the established 3D-printing term; explain on first use |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with „MCP: “ |
