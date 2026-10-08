# French (fr) language guide

Binding for the French catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the French translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user as «vous». Instructions use the imperative: «Sélectionnez», «Cliquez sur…».
- Buttons and menu commands — infinitive: «Supprimer», «Exporter», «Grouper».
- Toolbar section labels — infinitive, as Fusion French («CRÉER», «MODIFIER», «INSPECTER»): «Combiner», «Modifier»,
  «Organiser», «Gérer», «Dessiner», «Inspecter», «Terminer», «Créer». Nouns where English has a noun or the label is
  also a tool name: «Presse-papiers», «Historique», «Formes», «Visibilité», «Sélection».
- Drawing tools — nouns: «Ligne», «Courbe de Bézier», «Gomme», «Sélection»; the measure tool is «Mesurer» (Fusion).
- Sentence case: «Formes de base», not «Formes De Base». Accents on capitals: «Étape», «ARRIÈRE».
- Quotes « … » with a no-break space inside: « {name} ». Names of projects, objects and UI labels in text go in
  quotes: le projet « {name} », cliquez sur « Grouper ».
- No-break space U+00A0 (used for all no-break spaces, including where print typography uses the narrow one):
  before `:` `;` `?` `!`, inside « », before `%`, between a number or `{placeholder}` and its unit (`20 mm`,
  `{value} {unit}`, `22 Mo`), and as the thousands separator (`180 000`). No space before `°`.
- Apostrophe ’ (U+2019), never '.
- Decimal comma in prose; a value the user must pick or type exactly as the UI shows it keeps the UI form
  (snap grid «0.5 mm», fillet «1.00 mm»); version numbers keep their dots («Safari 17.2+»).
- Units: `mm`, `cm`, `m`, `in`, `ft` stay as symbols (as in Fusion French); in words — pouces, pieds. File sizes:
  `o`, `Ko`, `Mo`, `Go`.
- Keys keep their names: Ctrl, Shift, Cmd, Esc, F2; Enter is «Entrée» (the name printed on French keyboards).
- No full stop at the end of labels and tooltips. No exclamation marks.
- Plurals: `one` (0 and 1 — French uses the singular for 0), `many` (1 000 000 and other exact millions: «de» before
  the noun — «{count} de formes»), `other`.
- National standards for terms: ISO 1122-1 for gears; French technical drawing for views and edges (vues, arête vive).

## Glossary

| English | Français | Note |
|---|---|---|
| workplane | plan de travail | Tinkercad |
| workspace | espace de travail | the editor area; not «plan de travail» |
| grid / snap grid | grille / grille d’accrochage | grid step — pas de la grille; Tinkercad |
| snap / snap to grid | accrochage / accrocher à la grille | never «aligner»: reserved for Align |
| sketch | esquisse | Fusion, SolidWorks |
| profile (closed sketch loop) | profil | the user account panel is «Profil utilisateur» |
| extrude / extrusion | extruder / extrusion | Fusion |
| revolve | révolution; revolve axis — axe de révolution | Fusion; the verb in hints: «faire tourner le profil» |
| fillet | arrondi / arrondir | not «congé» (Fusion, SolidWorks): its everyday meaning is "leave, holiday"; «arrondi» is the technical-drawing word for a rounded edge |
| chamfer, bevel | chanfrein / chanfreiner | Fusion, SolidWorks; also common in DIY |
| edge treatment / edge modifier | arrondi ou chanfrein (des arêtes) | |
| edge feature | arrondi ou chanfrein; plural — arrondis et chanfreins | |
| CAD worker / kernel (edge tools) | module des arrondis et chanfreins | sketches: «construction des esquisses»; OpenCascade keeps its name |
| CAD | CAO | |
| handle (on-canvas control) | poignée; curve handle — poignée de courbe | PowerPoint, Inkscape |
| corner / smooth point | point d’angle / point lisse; buttons «Angle» / «Lisse» / «Séparer» | Illustrator |
| SVG path | tracé | Illustrator; Inkscape’s «chemin» reads as "road"; a sketch profile stays «profil» |
| SVG stroke / fill | contour / rempli | Inkscape and Illustrator «Fond et contour»; «contour» is used only for strokes |
| align center / middle | au centre (X) / au milieu (Y, Z) | PowerPoint «Aligner au centre» / «Aligner au milieu» |
| align directions | à gauche, à droite, à l’avant, à l’arrière, en bas, en haut | «Aligner à gauche» |
| solid (vs hole) | solide | Tinkercad |
| hole (shape mode) | perçage | Tinkercad; also the center hole of a gear or tube — perçage central |
| hole (opening in a mesh or silhouette) | trou | |
| boolean cut / subtract | soustraction | |
| union | union | the UI action is «Grouper» |
| intersect | intersection | |
| separate parts | séparer en parties | |
| group / ungroup | grouper / dissocier; the action — groupement | Office; Tinkercad says «Regrouper» |
| align | aligner / alignement | Tinkercad, Office |
| mirror | mettre en miroir; the mode — miroir | Tinkercad; Fusion «Symétrie» is unclear to students |
| duplicate | dupliquer | |
| copy / cut / paste | copier / couper / coller | |
| undo / redo | annuler / rétablir | Office, Tinkercad; never «rétablir» for "reset" |
| cancel (button) | Annuler | same word as undo in every French UI; next to undo (sketch toolbar) — «Abandonner» |
| reset | réinitialiser; back to defaults — revenir aux valeurs par défaut | |
| action (history step, undo state) | action | |
| history | historique; undo history — historique des modifications | |
| unlimited | illimité | |
| select / selection | sélectionner / sélection | |
| selected | sélectionné(e)s | chosen in a list or dialog — choisi |
| shape | forme | Tinkercad «Formes de base» |
| object | objet | |
| body | solide | not «corps» (Fusion): same concept as solid, unclear to students |
| mesh | modèle; maillage only where the mesh itself matters (triangles, normals) | |
| watertight / manifold mesh | modèle fermé, sans trous ni faces en trop | not «variété», «manifold» |
| non-manifold edge | arête partagée par plus de deux faces | |
| triangle (mesh) | triangle | |
| edge / face / vertex | arête / face / sommet | school geometry |
| sharp edge | arête vive | technical drawing |
| dimension | dimension | |
| width / depth / height | largeur / profondeur / hauteur | |
| length (shape size along the depth axis) | longueur | the English UI labels this axis Length |
| bricks / stud (units) | briques / tenon | LEGO-type bricks |
| elevation | hauteur au-dessus du plan de travail | not «élévation»: a drawing view in French |
| lift (height handle) | soulever | |
| rotation / rotate | rotation / faire pivoter | Office |
| scale (object) / resize | redimensionner | |
| scale (drawing, 1:10) | échelle | |
| zoom (view) | zoom; zoom in / out — zoom avant / zoom arrière; zoomer | Tinkercad, Office; never «échelle» |
| orbit | faire tourner la vue | |
| pan | déplacer la vue | |
| fit / zoom to fit | ajuster la vue | not «afficher»: it means unhide |
| show / hide | afficher / masquer | Tinkercad; «afficher» only for making something visible |
| rename | renommer | |
| home view (camera) | vue initiale | «Accueil» is the dashboard |
| view cube | cube d’orientation; faces HAUT, BAS, AVANT, ARRIÈRE, DROITE, GAUCHE | Tinkercad, AutoCAD ViewCube |
| top / bottom / front / back / right / left view | vue de dessus / de dessous / de face / arrière / de droite / de gauche | technical drawing |
| wireframe | filaire | Fusion |
| units | unités | |
| box | boîte | Tinkercad; not «cube», not «pavé» |
| cylinder / sphere / cone / pyramid / torus | cylindre / sphère / cône / pyramide / tore | |
| tube / ring | tube / anneau | |
| roof / round roof / half sphere | toit / toit rond / demi-sphère | Tinkercad |
| wedge | coin | Tinkercad |
| gear | roue dentée | ISO 1122-1: «engrenage» is the pair of wheels, «pignon» the smaller one |
| spur / helical / bevel gear | denture droite / denture hélicoïdale / conique | under the label «Type de roue dentée» |
| teeth / tooth | dents / dent | |
| helix angle | angle d’hélice | ISO 1122-1 |
| scribble | dessin à main levée | not «esquisse» |
| font; sans / serif / script / monospace / stencil | police; sans empattement / avec empattements / manuscrite / chasse fixe / pochoir | |
| import / export | importer / exporter; importation / exportation | |
| project / design | projet | |
| local project | projet de ce navigateur | |
| shared space / storage | espace partagé / stockage | |
| dashboard / home page | accueil | |
| thumbnail / snapshot (project card) | miniature | not «aperçu»: that is the preview |
| preview | aperçu | |
| asset / resource (project file) | ressource | |
| feature (project file) | opération | |
| node (project file) | élément | not «nœud»: vulgar slang among students |
| settings | paramètres | not «réglages»; the dashboard menu item and the title of the panel it opens: «Options» (the menu is about 75 px wide) |
| shape panel (inspector) | panneau de la forme | |
| lock / unlock / padlock | verrouiller / déverrouiller / cadenas | Tinkercad |
| drop to workplane | poser sur le plan de travail | |
| ruler / measure | règle / mesurer; the result — mesure | Tinkercad «Règle», Fusion «Mesurer» |
| erase (sketch tool) | gomme | Paint |
| slicer | logiciel de tranchage | |
| update | mise à jour / mettre à jour | |
| you (addressing the user) | vous | |
| challenge | défi | |
| tutorial | instructions | |
| sort: recent | date de modification | not «récent»: unclear which date and order |
| shape defaults | paramètres des nouvelles formes | not «formes par défaut»: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | Modèle 3D | not «Géométrie»: reads as the school subject; pairs with «Esquisse» as 3D vs 2D |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with « MCP : » |
