# Spanish (es) language guide

Binding for the Spanish catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the Spanish translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- One Spanish for Spain and Latin America: neutral vocabulary, no words that differ by region.
  «agregar» (not «añadir»), «equipo» (not «ordenador» / «computadora»), «archivo» (not «fichero»),
  «hacer clic en» for buttons, «presionar» for keys, «intentar» (not «probar a»).
- Address the user as «tú», as Microsoft and Google Spanish UIs do: «Selecciona una forma». No «usted», no «vosotros».
- Buttons and menu commands — infinitive: «Guardar», «Agrupar», «Cambiar nombre».
- Toolbar section labels — infinitive, as in Fusion: «Crear», «Modificar», «Combinar», «Inspeccionar».
  CAD operations — nouns, as in SolidWorks / Fusion: «Redondeo», «Chaflán», «Intersección», «Extrusión», «Revolución».
  Drawing tools as in Paint / Fusion: «Línea», «Borrador», «Seleccionar», «Medir».
- Messages about a finished action: «Se + pretérito» («Se eliminaron 3 formas») or noun + participle («Boceto actualizado»).
- Sentence case everywhere, no Title Case: «Formas básicas», «Curva de Bézier».
- Quotes « » (RAE); inside them “ ”. Names of projects and objects in messages go in quotes: el proyecto «{name}».
  File names and paths without quotes. Names of interface elements in instructions go in quotes: haz clic en «Agrupar».
- Opening ¿ and ¡ always: «¿Eliminar el proyecto?».
- Non-breaking space between a number and its unit or %: `20 mm`, `{size} MB`, `{percent} %`. Degrees attach: `45°`.
- Decimal point as the interface shows it (`0.5 mm`, allowed by the RAE); thousands from five digits grouped with a
  non-breaking space: `180 000`; four digits stay together: `2000 mm`.
- No full stop at the end of labels and tooltips.
- Plurals: `one`, `many`, `other`. `many` is for round millions (1 000 000): a noun right after the number takes «de»
  («{count} de formas»); without a noun `many` repeats `other`.

## Glossary

| English | Español | Note |
|---|---|---|
| workplane | plano de trabajo | as Tinkercad |
| grid / snap grid | rejilla / ajuste a la rejilla; command — ajustar a la rejilla | as Tinkercad («Ajustar rejilla» there reads as "adjust the grid"); grid cell size — tamaño de celda |
| sketch | boceto | as Fusion; not «croquis» (SolidWorks), unknown to students |
| profile (closed sketch loop) | perfil | |
| extrude / extrusion | extruir / extrusión | |
| revolve | revolución; the shape — sólido de revolución; revolve axis — eje de revolución | as Fusion, SolidWorks; the verb is described: girar el perfil alrededor de un eje |
| fillet | redondeo / redondear | as SolidWorks; not «empalme» (Fusion), unclear to students |
| chamfer | chaflán / achaflanar | as Fusion, SolidWorks |
| bevel (text shape setting) | bisel | as Tinkercad; the edge tool is «chaflán» |
| edge treatment / edge modifier | redondeo o chaflán | |
| edge feature | redondeo o chaflán; plural — redondeos y chaflanes | both masculine: «el {feature}» |
| CAD worker / kernel (edge tools) | módulo de redondeos y chaflanes | for sketches: «crear el sólido a partir del boceto» |
| sharp edge | arista viva | sharp-edge threshold — ángulo mínimo de arista viva |
| handle (on-canvas control) | controlador; curve handle — controlador de curva | as Office «controladores de tamaño» |
| corner / smooth point | punto de esquina / punto suave; buttons «Esquina» / «Suave» / «Separar» | as Inkscape |
| SVG path / stroke | trazado / trazo | as Adobe; a sketch profile stays «perfil» |
| align center / middle | por el centro (X) / por el medio (Y, Z) | other directions: por el borde izquierdo, delantero, inferior… |
| solid (vs hole) | sólido | as Tinkercad |
| hole | agujero | as Tinkercad; gaps in a mesh are «aberturas» |
| body (STEP) | sólido | one word with solid |
| boolean cut / subtract | resta / restar | |
| union | unión | |
| intersect | intersección | |
| separate parts | separar en partes | |
| group / ungroup | agrupar / desagrupar | as Tinkercad |
| align | alinear | |
| mirror | reflejar; the operation — reflejo | as Tinkercad; not «simetría» (Fusion) |
| duplicate | duplicar | |
| copy / cut / paste | copiar / cortar / pegar | |
| undo / redo | deshacer / rehacer | |
| select / selection | seleccionar / selección; objetos seleccionados | English "choose" — elegir |
| cancel (button) / undo | Cancelar / Deshacer | never «Cancelar» for undo |
| delete / remove | eliminar (objects, images, projects, files) / quitar (sketch points and segments, measurements, fillets, chamfers, selection) | erase tool — «Borrador» |
| action (history step, undo state) | acción | |
| history (toolbar section label, settings) | historial | short form of «historial de deshacer» |
| unlimited | sin límite | |
| shape | forma | as Tinkercad «Formas básicas» |
| object | objeto | |
| mesh | modelo; malla only where triangles matter (mesh errors) | |
| watertight / manifold mesh | modelo cerrado, sin aberturas ni caras sobrantes | open edge — arista abierta; non-manifold edge — arista con caras sobrantes |
| triangle (mesh) | triángulo | |
| edge / face / vertex | arista / cara / vértice | |
| dimension | medida | not «cota» (technical drawing) |
| width / depth / height | ancho / profundidad / alto | |
| length (shape size along the depth axis) | largo | the English UI labels this axis Length |
| bricks / stud (units) | ladrillos / espiga | as LEGO Spanish |
| elevation | altura sobre el plano de trabajo; the arrow tool — Elevar | |
| rotation / rotate | giro / girar | |
| scale (object) | escala / escalar | |
| scale (drawing, 1:10) | escala | |
| zoom (view) | zoom; zoom in / out — acercar / alejar | never bare «escala» |
| orbit | girar la vista | Autodesk «órbita» is unclear to the audience |
| pan | desplazar la vista | Autodesk «encuadre» is unclear to the audience |
| fit / zoom to fit | ver todo | |
| show / hide | mostrar / ocultar | for unhiding and display options; never for camera moves |
| rename | cambiar nombre | as Microsoft / Google |
| home view (camera) | vista inicial | |
| view cube faces | SUP. / INF. / FRONTAL / TRASERA / DERECHA / IZQ. | as the Autodesk ViewCube, shortened where the word does not fit the 54 px inside a face at 10 px («SUPERIOR», «INFERIOR», «IZQUIERDA», «POSTERIOR»); tooltips and screen readers get the full view names — vista superior, …, vista lateral izquierda |
| wireframe | estructura alámbrica | as Fusion |
| units | unidades | in / ft keep their symbols; in words — pulgadas / pies |
| box | caja | as Tinkercad; not «cubo» |
| cylinder / sphere / cone / pyramid / torus | cilindro / esfera / cono / pirámide / toroide | torus as Tinkercad; not «toro» |
| half sphere | media esfera | as Tinkercad |
| roof / round roof | techo / techo redondo | as Tinkercad |
| tube / ring | tubo / anillo | |
| wedge | cuña | |
| gear | engranaje; spur / helical / bevel — recto / helicoidal / cónico | |
| teeth / tooth | dientes / diente | |
| helix angle | ángulo de hélice | standard gear term |
| scribble | dibujo a mano | not «boceto»: that is sketch; not «garabato»: sounds careless |
| import / export | importar / exportar | |
| project / design | proyecto | the English "3D design" is the same thing |
| local project | proyecto de este navegador | |
| shared space / shared storage | proyectos compartidos | Docker named only where the English names it |
| dashboard / home page | inicio | |
| thumbnail / snapshot (project card) | miniatura | |
| grid view / list view (projects) | mosaico / lista | not «cuadrícula» or «rejilla»: that is the workplane grid |
| asset / resource (project file) | recurso | |
| feature (project file) | operación | |
| settings | configuración | as Microsoft / Google; the dashboard menu item and the title of the panel it opens: «Ajustes» (the menu is about 75 px wide) |
| default | predeterminado | not «por defecto» |
| refresh / reload | recargar / volver a cargar | «actualizar» is reserved for software updates |
| update | actualización / actualizar | |
| computer | equipo | neutral |
| slicer | laminador (slicer) | |
| you (addressing the user) | tú | |
| challenge | reto | |
| tutorial | tutorial / instrucciones | |
| sort: recent | fecha de modificación | not «reciente»: unclear which date and order |
| shape defaults | valores de las formas nuevas | not «formas predeterminadas»: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | modelo 3D | not «geometría»: reads as the school subject; pairs with «Boceto» as 3D vs 2D |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with «MCP: » |
