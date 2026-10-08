# Czech (cs) language guide

Binding for the Czech catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the Czech translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user with vykání and a lowercase „vy/váš“, or impersonally, as Microsoft, Google and PrusaSlicer do in
  Czech. Instructions use the plural imperative: „Vyberte“, „Klikněte“, „Podržte Shift“.
- Buttons and menu commands are infinitives: „Uložit“, „Seskupit“, „Odstranit“, „Zrušit seskupení“.
- Toolbar section labels, CAD operations and drawing tools are nouns: „Úpravy“, „Kombinace“, „Zaoblení“, „Zkosení“,
  „Průnik“, „Čára“, „Guma“, „Měření“, „Výběr“.
- Status messages use a short participle: „Náčrt aktualizován“, „Zkopírovány 3 tvary“. Failures: „Nepodařilo se …“
  or „… se nepodařilo …“.
- Quotes „…“ (U+201E, U+201C). A name inserted with `{name}` follows a noun, so nothing has to agree with it:
  tvar „{name}“, projekt „{name}“, obrázek „{name}“. UI elements named in running text also go in quotes:
  klikněte na „Seskupit“.
- Dash: en dash with spaces ` – `, not `—` or `-`.
- Non-breaking space between a number and its unit, and before `%`: `20 mm`, `{value} {unit}`, `{size} kB`, `50 %`.
  Degrees attach without a space: `45°`. Thousands are separated by a non-breaking space: `180 000`.
  Dimensions use `×`: `{width} × {depth} mm`.
- Decimal comma is Czech, but numbers the user must find or type in the UI keep the point the UI shows (`0.5 mm` in the
  snap grid list, `1.00 mm` on the fillet slider) until the UI formats them for the locale.
- Plural forms: `one` (1), `few` (2–4), `many` (fractions, genitive singular: „1,5 tvaru“), `other` (0 and 5+, genitive
  plural). The participle agrees: „Odstraněn 1 tvar“, „Odstraněny 2 tvary“, „Odstraněno 5 tvarů“. Where a form would
  have to agree with a number that is not `count`, use „label: {n}“: „Importováno souborů: {imported} z {count}.“
- No full stop at the end of labels, tooltips and short status messages; sentences in dialogs and help end with one,
  as in English.
- Units: `mm`, `cm`, `m`, `in`, `ft` stay as symbols; the LEGO stud is „výst.“ (výstupek).

## Glossary

| English | Čeština | Note |
|---|---|---|
| workplane | pracovní rovina | Tinkercad CZ, Inventor CZ. Not „pracovní plocha“ |
| workspace (editor area, its settings) | pracovní prostor | „pracovní plocha“ reads as the Windows desktop |
| grid / snap grid | mřížka / přichycení k mřížce; snap to grid — přichytit k mřížce | as PowerPoint CZ |
| grid spacing / grid block size | rozteč mřížky | as PowerPoint CZ |
| sketch | náčrt | Fusion, Inventor CZ („Dokončit náčrt“). Not „skica“ (SolidWorks CZ) |
| profile (closed sketch loop) | profil | |
| line / segment / point (sketch) | čára / segment / bod | |
| extrude / extrusion | vysunout / vysunutí | Fusion, Inventor, SolidWorks CZ |
| revolve | rotace; revolve axis — osa rotace; result — rotační těleso | Fusion, Inventor CZ. „rotace“ only for revolve, never for rotate |
| fillet | zaoblení / zaoblit | Fusion, Inventor, SolidWorks CZ |
| chamfer, bevel | zkosení / zkosit | same sources |
| edge treatment / edge modifier | úprava hran | |
| edge feature | zaoblení nebo zkosení; plural — zaoblení a zkosení | |
| CAD worker / kernel (edge tools) | modul pro zaoblení a zkosení | the STEP/sketch kernel is „modul OpenCascade“ |
| handle (on-canvas control) | úchyt; curve handle — úchyt křivky | as Office CZ „úchyty pro změnu velikosti“ |
| corner / smooth point | rohový / hladký bod; buttons „Rohový“ / „Hladký“ / „Rozdělit“ | as Illustrator CZ |
| SVG path / stroke / contour, outline | cesta / tah / obrys | as Inkscape CZ; a sketch line stays „čára“ |
| align left / center / right | zarovnat doleva / na střed / doprava | as PowerPoint CZ |
| align front / middle / back, bottom / top | dopředu / doprostřed / dozadu, dolů / nahoru | „na střed“ is X only, „doprostřed“ Y and Z |
| solid (vs hole) | těleso | Tinkercad CZ |
| hole | díra | Tinkercad CZ, Inventor CZ. Not „otvor“. Gaps in a mesh are „mezery v povrchu“, never „díry“ |
| boolean cut / subtract | odečíst díru | |
| intersect / intersection | průnik | the set term; Fusion CZ |
| combine (toolbar section) | Kombinace | |
| separate parts | rozdělit na části | |
| group / ungroup | seskupit / zrušit seskupení | Tinkercad CZ, Inkscape CZ |
| align | zarovnat | Tinkercad CZ |
| mirror | zrcadlit; left-right — zleva doprava | Tinkercad CZ, PrusaSlicer |
| duplicate | duplikovat | Tinkercad CZ, PrusaSlicer |
| copy / cut / paste | kopírovat / vyjmout / vložit | Microsoft CZ |
| delete, remove | odstranit; in add/remove pairs — přidat / odebrat | Microsoft CZ. Not „smazat“ |
| undo / redo | zpět / znovu; notice — akce vrácena zpět / provedena znovu | Tinkercad CZ, Office CZ |
| select / selection | vybrat / výběr; vybrané objekty | |
| choose (an option, a tool, a point) | zvolit | keeps „vybrat“ for objects, so the Select tool reads „zvolte nástroj Výběr“ |
| cancel (button) | Zrušit | never „Zpět“: that is undo |
| previous / next (tutorial) | Předchozí / Další | not „Zpět“ |
| action (history step, undo state) | akce (1 akce, 2 akce, 5 akcí) | as Office CZ. A tutorial step is „krok“ |
| actions (menu of commands) | příkazy | not „akce“: that is a history step |
| history (toolbar section, settings tab) | Historie; in text — historie změn | |
| unlimited | bez omezení | |
| shape | tvar | Tinkercad CZ „Základní tvary“ |
| object | objekt | |
| body | těleso | |
| mesh | model; trojúhelníková síť where the mesh itself matters | |
| watertight / manifold mesh | uzavřený model bez mezer v povrchu a přebytečných stěn | not „manifoldní“ |
| triangle / normal | trojúhelník / normála | |
| edge / face / vertex | hrana / plocha / vrchol; a polygon of a mesh — stěna | school geometry, Inventor CZ |
| area | obsah (zero-area — s nulovým obsahem); region — oblast | school maths; „plocha“ is a face |
| dimension | rozměr (a size); kóta (dimension line on screen) | technical drawing, Czech Tinkercad guides |
| width / depth / height | šířka / hloubka / výška | |
| length (shape size along the depth axis) | délka | the English UI labels this axis Length |
| radius / base radius | poloměr / poloměr podstavy | school maths. Not „rádius“ |
| bricks / stud (units) | kostky / výstupek; unit label „výst.“ | LEGO bricks |
| elevation | výška nad pracovní rovinou; short — výška nad rovinou | |
| rotation / rotate | otočení / otočit | PrusaSlicer |
| resize (object) | změnit velikost | never „měřítko“ |
| scale (drawing, 1:10) | měřítko | |
| zoom (view) | přiblížit / oddálit; zoom speed — rychlost přibližování | PrusaSlicer. Never „měřítko“ |
| orbit / pan | otočit pohled / posunout pohled | |
| show / hide | zobrazit / skrýt; settings — zobrazovat | „zobrazit“ only for visibility. A display mode is „rozložení“ |
| lock / unlock | zamknout / odemknout; zamčený / odemčený; padlock — zámek | PrusaSlicer |
| rename | přejmenovat | |
| views | pohled shora / zdola / zepředu / zezadu / zprava / zleva | technical drawing (ČSN 01 3121) |
| view cube faces | SHORA / ZDOLA / ZEPŘEDU / ZEZADU / ZPRAVA / ZLEVA | same words as the views |
| home view (camera) | výchozí pohled | |
| preview | náhled | PrusaSlicer |
| thumbnail / snapshot (project card) | obrázek projektu | „náhled“ is preview |
| wireframe | drátěný model | PrusaSlicer |
| opacity | neprůhlednost | PrusaSlicer |
| units | jednotky; metric / imperial — metrické / imperiální | |
| box | kvádr | not „kostka“ or „krychle“: a cube has equal sides |
| cube | krychle | |
| cylinder / sphere / half sphere / cone | válec / koule / polokoule / kužel | school geometry |
| pyramid / torus | jehlan / anuloid | school geometry; „pyramida“ is the building |
| tube / ring / wedge | trubka / prstenec / klín | |
| roof / round roof | střecha / oblá střecha | |
| polygon / icosahedron | mnohoúhelník / dvacetistěn | |
| gear | ozubené kolo; spur — s přímými zuby; helical — se šikmými zuby; bevel — kuželové | ČSN gear terms |
| teeth / tooth | zuby / zub; count — počet zubů | |
| helix angle | úhel sklonu zubů | ČSN |
| text / font | text / písmo | |
| scribble | kresba od ruky | not „náčrt“ |
| image | obrázek | |
| import / export | import / export; importovat / exportovat | |
| project; design (EN) | projekt | the English „design“ is the project |
| local project | projekt v tomto prohlížeči | |
| shared project | sdílený projekt; Docker storage — úložiště Docker | |
| dashboard / home page | úvodní stránka; nav item and toolbar section Home — Domů | |
| asset / resource (project file) | datový soubor | not „zdroj“: clashes with „zdrojový soubor“ |
| source file (imported original) | původní importovaný soubor | |
| feature (project file) | operace | not „prvek“: that is an SVG or sketch element |
| settings / preferences | nastavení / předvolby | |
| update | aktualizace / aktualizovat | PrusaSlicer, Microsoft CZ |
| clipboard | schránka | Microsoft CZ |
| challenge | úloha | |
| tutorial | návod | |
| key tag / nameplate | klíčenka / jmenovka | |
| sort: recent | podle data úpravy | |
| shape defaults | parametry nových tvarů | not „výchozí tvary“: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | 3D model | pairs with „Náčrt“ as 3D vs 2D |
| theme / light / dark | motiv / světlý / tmavý | Microsoft CZ |
| click / drag / hold | kliknout (na) / přetáhnout, táhnout / podržet; keys — stisknout | |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with „MCP: “ |
