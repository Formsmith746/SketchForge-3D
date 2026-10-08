# Brazilian Portuguese (pt) language guide

Binding for the `pt` catalogs. The catalogs are **Brazilian Portuguese** (pt-BR); the code is plain `pt` because the
desktop app only supports plain language codes. General rules and audience:
[../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the Brazilian Portuguese translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user as “você”, as Brazilian software does, or impersonally. Instructions use the imperative of the
  você form: “Selecione”, “Clique em “Agrupar””.
- Buttons and menu commands — infinitive: “Salvar”, “Agrupar”, “Exportar”.
- Toolbar section labels — infinitive, as Fusion pt-BR (“Criar”, “Modificar”, “Inspecionar”), or a noun where English
  has a noun (“Histórico”, “Formas”, “Visibilidade”, “Área de transferência”). Tools may be nouns: “Borracha”, “Régua”.
- Status messages — noun + past participle agreeing with it: “3 formas agrupadas”, “Projeto salvo”. When the gender of
  a `{name}` is unknown, put it after a colon: “Forma adicionada: {name}”.
- Quotes “…”. Names of projects, objects and UI elements in messages go in quotes: projeto “{name}”,
  clique em “Agrupar”.
- Non-breaking space between a number and its unit: `20 mm`, `22 MB`.
- Numbers: thousands separator dot (`180.000`); four-digit values without separator (`2000 mm`). A value the user must
  type or pick keeps the form the UI shows (`0.5 mm`, `1.00 mm`): the app displays these with a point.
- No full stop at the end of labels and tooltips.
- Brazilian spelling and vocabulary: arquivo, tela, salvar, excluir, baixar, compartilhado, interseção.
- Plurals: `one`, `many`, `other`. `one` also covers 0 (“0 forma”, CLDR); `many` is for exact millions and puts “de”
  before the noun: “1.000.000 de formas”.
- National standards for terms: ABNT NBR 10067 for view names (vista frontal, superior, lateral esquerda…).

## Glossary

| English | Português (Brasil) | Note |
|---|---|---|
| workplane | plano de trabalho | as Tinkercad pt-BR |
| grid / snap grid | grade / ajuste à grade | setting label “Ajuste à grade”, command “Ajustar à grade”; grid step — espaçamento da grade. Tinkercad's “Ajustar grade” also reads as “adjust the grid” |
| sketch | esboço | as Fusion |
| profile (closed sketch loop) | perfil | |
| path (sketch line) | linha | |
| extrude / extrusion | extrudar / extrusão | as Fusion |
| revolve | revolução; revolve axis — eixo de revolução | as Fusion; “sólido de revolução” is the school geometry term. Hint text: girar o perfil em torno de um eixo |
| fillet | arredondamento / arredondar | not “concordância” (Fusion) or “filete” (SolidWorks): unclear to the audience |
| chamfer, bevel | chanfro / chanfrar | |
| edge treatment / edge modifier | acabamento de arestas | |
| edge feature | arredondamento ou chanfro; plural — arredondamentos e chanfros | |
| CAD worker / kernel (edge tools) | módulo de arredondamentos e chanfros | other kernel messages — módulo CAD, módulo OpenCascade |
| sharp edge | aresta viva | sharp-edge threshold — ângulo limite de aresta viva |
| handle (on-canvas control) | alça; curve handle — alça da curva | as Illustrator, Office pt-BR “alça de dimensionamento” |
| align handles (dots) | pontos de alinhamento | the challenge texts call them dots |
| corner / smooth point | ponto de canto / ponto suave; buttons “Canto” / “Suave” / “Separar” | as Illustrator |
| SVG path | contorno | a sketch profile stays “perfil” |
| align left / center / right | à esquerda / no centro / à direita | as PowerPoint pt-BR |
| align front / middle / back | na frente / no meio / atrás | |
| align bottom / top | embaixo / em cima | |
| solid (vs hole) | sólido | as Tinkercad pt-BR |
| hole | orifício | as Tinkercad pt-BR; gear center hole — orifício central. Gaps in a mesh — aberturas |
| boolean cut / subtract | subtração / subtrair | |
| union | união | |
| intersect | interseção | Brazilian spelling |
| separate parts | separar partes | |
| group / ungroup | agrupar / desagrupar | as Tinkercad |
| align | alinhar | |
| mirror | espelhar | Tinkercad pt-BR “Virar” reads as rotating |
| duplicate | duplicar | |
| copy / cut / paste | copiar / recortar / colar | |
| delete / remove | excluir / remover | follows the English verb: Delete — excluir, Remove — remover |
| undo / redo | desfazer / refazer | |
| select / selection | selecionar / seleção; selected — selecionado(s) | chosen in a list, dialog or tool — escolher |
| cancel (button) / undo | Cancelar / Desfazer | never “Cancelar” for undo |
| action (history step, undo state) | ação | |
| history (toolbar section label) | histórico | |
| history (undo) | histórico; undo history — histórico de desfazer | |
| unlimited | ilimitado | |
| shape | forma | as Tinkercad pt-BR |
| object | objeto | |
| body | corpo | as Fusion |
| mesh | modelo; malha only where the mesh itself matters (errors about triangles) | |
| watertight / manifold mesh | modelo fechado, sem aberturas nem faces sobrando | non-manifold edge — aresta com faces sobrando |
| triangle (mesh) | triângulo | |
| edge / face / vertex | aresta / face / vértice | |
| dimension | medida | size — tamanho |
| width / depth / height | largura / profundidade / altura | |
| length (shape size along the depth axis) | comprimento | the English UI labels this axis Length |
| bricks / stud (units) | tijolinhos / pino | LEGO-type bricks; snap value — tijolinho |
| elevation | elevação | lift handle — elevar |
| rotation / rotate | rotação / girar | as Tinkercad |
| scale (object) / resize | redimensionar | never “escala” for objects |
| scale (drawing, 1:10) | escala | |
| zoom (view) | zoom; zoom in / out — aproximar / afastar | never “ampliar” / “reduzir”: read as resizing the object |
| orbit | girar a vista | “órbita” is unclear to the audience |
| pan | mover a vista | “pan” / “panorâmica” are unclear to the audience |
| fit / zoom to fit | enquadrar tudo | not “mostrar”: it means unhide here |
| rename | renomear | |
| home view (camera) | vista inicial | |
| views / view cube faces | vista superior / inferior / frontal / traseira / lateral direita / lateral esquerda; faces SUP. / INF. / FRONTAL / TRAS. / DIREITA / ESQ. | NBR 10067 says “posterior”; “traseira” because POSTERIOR does not fit on the cube face. Faces are shortened where the word does not fit the 54 px inside a face at 10 px; tooltips and screen readers get the full view names |
| wireframe | aramado | |
| units | unidades | |
| box | caixa | as Tinkercad pt-BR; not “cubo” |
| cylinder / sphere / cone / pyramid / torus | cilindro / esfera / cone / pirâmide / toro | |
| tube | tubo | |
| wedge | cunha | |
| gear | engrenagem; spur / helical / bevel — dentes retos / helicoidal / cônica | |
| teeth / tooth | dentes / dente | |
| helix angle | ângulo de inclinação dos dentes; section label — inclinação dos dentes | “hélice” reads as a propeller |
| scribble | rabisco | |
| import / export | importar / exportar; importação / exportação | export to a format — exportar em STL |
| project, design | projeto | not “design”: one word for the same thing |
| local project | projeto neste navegador | |
| dashboard / home page | início | |
| thumbnail / snapshot (project card) | miniatura | |
| asset / resource (project file) | recurso | |
| feature (project file) | operação | |
| settings | configurações | the dashboard menu item and the title of the panel it opens: “Ajustes” (the menu is about 75 px wide) |
| workspace | espaço de trabalho | not “área de trabalho”: that is the Windows desktop |
| shape panel (inspector) | painel da forma | |
| preview | pré-visualização | |
| clipboard | área de transferência | as Windows / Office pt-BR |
| lock / unlock | bloquear / desbloquear; padlock — cadeado | |
| hide / show | ocultar / mostrar | “mostrar” only for making things visible |
| drop to workplane | apoiar no plano de trabalho | |
| slicer | fatiador | as Cura pt-BR |
| update | atualização / atualizar | |
| you (addressing the user) | você or impersonal | |
| challenge | desafio | |
| tutorial | instruções do desafio / passo a passo | |
| sort: recent | modificados recentemente | not “recentes”: unclear which date |
| shape defaults | parâmetros das novas formas | not “formas padrão”: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | Modelo 3D | not “Geometria”: reads as the school subject; pairs with “Esboço” as 3D vs 2D |
| key tag / nameplate (challenges) | chaveiro / placa com nome | |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with “MCP: ” |
