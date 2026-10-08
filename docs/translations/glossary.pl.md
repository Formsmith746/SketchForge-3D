# Polish (pl) language guide

Binding for the Polish catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the Polish translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user with 2nd person singular verb forms, as Microsoft, Google and Tinkercad Polish UIs do: „Zaznacz kształt”,
  „dopóki nie zapiszesz projektu”. Never „Pan/Pani/Państwo”. Avoid the pronouns „ty/twój”: use „swój” or rephrase.
- Buttons and menu commands: imperative, in the form Polish UIs established for each verb: „Zapisz”, „Usuń”, „Kopiuj”,
  „Wklej”, „Grupuj”, „Wyrównaj”, „Importuj”, „Eksportuj”, „Zmień nazwę”.
- Toolbar section labels, CAD operations and drawing tools: nouns, as in Fusion and Inventor: „Zaokrąglenie”, „Fazka”,
  „Wyciągnięcie”, „Część wspólna”, „Linia”, „Gumka”, „Pomiar”, „Zaznaczanie”, „Schowek”, „Modyfikacja”.
- Status messages: impersonal past in -no/-to: „Usunięto 3 kształty”, „Zapisano projekt”. It needs no gender agreement,
  so only the noun changes with the number.
- Plurals: `one`, `few`, `many`, `other`; `other` is for fractions and takes the genitive singular: 1 kształt,
  2 kształty, 5 kształtów, 2,5 kształtu. Where a phrase cannot follow the number, use a colon: „Zaznaczone: {count}”.
- Quotes „…” (U+201E, U+201D). Names of projects, objects and UI controls go in quotes after a governing noun or a colon,
  so the inserted name never has to be declined: projekt „{name}”, kształt „{name}”, „Usunięto: {feature}”,
  kliknij „Grupuj”.
- Non-breaking space between a number and its unit (`20 mm`, `{value} {unit}`) and as the thousands separator (`180 000`).
  Degrees and percent with no space: `45°`, `{percent}%`.
- Numbers in tutorials are written as the app displays them, with a decimal point: `0.5 mm`, `1.00 mm`.
- Dash: en dash with spaces ` – `. Ellipsis: `…`.
- No full stop at the end of labels and tooltips.
- Click (mouse, on-screen button) — „kliknij”; press (keyboard key) — „naciśnij”; hold — „przytrzymaj”; drag — „przeciągnij”.
- National standards for terms: PN-ISO 1122-1 for gears, PN-EN ISO 128 for views.

## Glossary

| English | Polski | Note |
|---|---|---|
| workplane | płaszczyzna robocza | Tinkercad PL |
| grid / snap grid | siatka / przyciąganie do siatki | Tinkercad PL; Snap to grid (command) — Przyciągnij do siatki; grid step — odstęp siatki (AutoCAD PL) |
| sketch | szkic | |
| profile (closed sketch loop) | profil | |
| extrude / extrusion | wyciągnij / wyciągnięcie | Fusion, Tinkercad PL; do not use „wyciągnąć” for anything else |
| revolve | bryła obrotowa; revolve axis — oś obrotu; sweep angle — kąt obrotu | school geometry term; not Fusion „Obrót”: it clashes with rotate („Obróć”) |
| fillet | zaokrąglenie; verb zaokrąglić | Fusion, Inventor |
| chamfer, bevel | fazka; verb sfazować; the process — fazowanie | Fusion, Inventor, SolidWorks |
| edge treatment / edge modifier | obróbka krawędzi | |
| edge feature | zaokrąglenie lub fazka; plural — zaokrąglenia i fazki | |
| CAD worker / kernel (edge tools) | moduł zaokrągleń i fazek | elsewhere describe what failed: „Nie udało się utworzyć bryły ze szkicu” |
| handle (on-canvas control) | uchwyt; curve handle — uchwyt krzywej | as Office „uchwyty zmiany rozmiaru” |
| corner / smooth point | punkt narożny / gładki; buttons „Zaostrz” / „Wygładź” / „Rozdziel” | as Illustrator |
| SVG path / stroke | ścieżka / obrys | as Inkscape, Illustrator; „obrys” only for SVG strokes; contour — kontur; silhouette — sylwetka |
| align left / right / front / back / bottom / top | do lewej / do prawej / do przodu / do tyłu / do dołu / do góry | inserted after „Wyrównaj”, „Wyrównano 2 kształty …” |
| align center / middle | do środka (both) | as Excel „Wyrównaj do środka”; the dot clicked shows the axis |
| solid (vs hole) | bryła | Tinkercad PL |
| hole | otwór | Tinkercad PL |
| body | bryła | |
| boolean cut / subtract | wycięcie otworu; wyciąć otwór | |
| union; Combine (toolbar section) | połączenie; Łączenie | |
| intersect | część wspólna | school sets; Fusion „Przecięcie” also reads as “cut” |
| separate parts | rozdziel na części | |
| group / ungroup | grupuj / rozgrupuj | Tinkercad, Office PL |
| align | wyrównaj; noun wyrównywanie | Tinkercad PL |
| mirror | odbij lustrzanie; noun odbicie lustrzane | axes lewo–prawo / góra–dół / przód–tył |
| duplicate | duplikuj | |
| copy / cut / paste | kopiuj / wytnij / wklej | |
| undo / redo | cofnij / ponów | Office PL |
| select / selection | zaznacz / zaznaczenie; zaznaczone obiekty | Office, Tinkercad PL; the sketch tool — Zaznaczanie |
| selected (objects in the scene) | zaznaczone | chosen in a list, dialog or tool — wybrane; choose — wybierz |
| cancel (button) / undo | Anuluj / Cofnij | never „Anuluj” for undo |
| action (history step, undo state) | czynność | not „krok” (tutorial steps) or „akcja” |
| history (toolbar section label) | historia | short form of „historia zmian” |
| history (undo) | historia zmian | |
| unlimited | bez ograniczeń | |
| shape | kształt | not „figura”: the school word for flat figures |
| object | obiekt | |
| mesh | model; siatka trójkątów only where the mesh itself matters (errors about triangles, STL) | not „mesh”; bare „siatka” is the grid |
| watertight / manifold mesh | zamknięty model bez dziur i zbędnych ścian | |
| triangle (mesh) | trójkąt | |
| edge / face / vertex | krawędź / ściana / wierzchołek | school geometry, Inventor PL |
| dimension | wymiar | |
| width / depth / height | szerokość / głębokość / wysokość | |
| length (shape size along the depth axis) | długość | the English UI labels this axis Length |
| bricks / stud (units) | klocki / wypustka | LEGO-type bricks |
| elevation | wysokość nad płaszczyzną roboczą | |
| rotation / rotate | obrót / obróć | |
| scale (object) / resize | skaluj / zmień rozmiar | |
| scale (drawing, 1:10) | skala | |
| zoom (view) | przybliżanie; zoom in / out — przybliż / oddal | not „powiększ”: reads as enlarging the object; never bare „skala” |
| orbit | obracanie widoku / obróć widok | |
| pan | przesuwanie widoku / przesuń widok | |
| show / hide | pokaż / ukryj | „pokaż” only for unhiding |
| rename | zmień nazwę | |
| home view (camera) | widok początkowy | „widok główny” is the front view in technical drawing |
| view cube faces | GÓRA, DÓŁ, PRZÓD, TYŁ, LEWO, PRAWO | Inventor PL ViewCube |
| top / front / left view | widok z góry / z przodu / z lewej | |
| wireframe | szkielet | AutoCAD PL |
| units | jednostki | |
| box | prostopadłościan | not „sześcian” (cube) |
| cylinder / sphere / cone / pyramid / torus | walec / kula / stożek / ostrosłup / torus | school geometry; not „sfera” (the surface) or „piramida” |
| half sphere / round roof / tube / ring | półkula / dach półokrągły / rura / pierścień | |
| wedge / polygon / icosahedron | klin / wielokąt / dwudziestościan | |
| gear | koło zębate; spur / helical / bevel — prostozębne / skośnozębne / stożkowe | PN-ISO 1122-1; „zębatka” is a rack |
| teeth / tooth | zęby / ząb; number of teeth — liczba zębów | |
| helix angle | kąt pochylenia zęba | |
| scribble | rysunek odręczny | not „szkic” |
| import / export | importuj / eksportuj; noun import / eksport | |
| project, design | projekt | |
| local project | projekt w tej przeglądarce | |
| dashboard / home page | strona główna | editor toolbar section label and dashboard menu item: „Start” (narrow places) |
| thumbnail / snapshot (project card) | miniatura | Windows PL |
| asset / resource (project file) | zasób | |
| feature (project file) | operacja | as Inventor |
| storage (browser, Docker) | magazyn | Windows PL „Magazyn” |
| shared projects | wspólne projekty | |
| settings / workspace | ustawienia / obszar roboczy | the dashboard menu item and the title of the panel it opens: „Opcje” (the menu is about 75 px wide) |
| update | aktualizacja / aktualizuj | |
| loading / download | wczytywanie / pobieranie | |
| lock / unlock; padlock | zablokuj / odblokuj; kłódka | |
| image (in a sketch) | obraz | |
| opacity | krycie | Photoshop, GIMP PL |
| aspect ratio | proporcje | |
| font | czcionka | |
| sketch origin | początek układu współrzędnych | |
| segment (sketch) | odcinek; sphere or text subdivisions — liczba segmentów | |
| slicer | program przygotowujący wydruk (slicer) | |
| you (addressing the user) | 2nd person singular verb forms, no pronoun | |
| challenge | zadanie | |
| tutorial | instrukcja zadania | |
| sort: recent | ostatnio zmienione | |
| shape defaults | ustawienia nowych kształtów | not „domyślne kształty”: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | Model 3D | not „Geometria”: reads as the school subject; pairs with „Szkic” as 3D vs 2D |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with „MCP: ” |
