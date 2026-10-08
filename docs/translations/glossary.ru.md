# Russian (ru) language guide

Binding for the Russian catalogs. General rules and audience: [../TRANSLATIONS.md](../TRANSLATIONS.md#translation-requirements).

> **Not proofread by a native speaker.** This guide and the Russian translation were written with AI models,
> so some wording may be inaccurate.

## Typography and address

- Address the user as «вы» with a lowercase letter, or impersonally.
- Buttons and menu commands — infinitive: «Удалить», «Экспортировать».
- Toolbar section labels, CAD operations and drawing tools — nouns, as in Fusion: «Скругление», «Фаска», «Пересечение»,
  «Линия», «Ластик», «Измерение», «Выбор».
- Quotes «ёлочки»; write «ё». Names of projects and objects in messages go in quotes: проект «{name}».
- Non-breaking space between a number and its unit: `20 мм`.
- No full stop at the end of labels and tooltips.
- National standards for terms: GOST (e.g. GOST 16530 for gears).

## Glossary

| English | Русский | Note |
|---|---|---|
| workplane | рабочая плоскость | |
| grid / snap grid | сетка / привязка к сетке | grid step — шаг сетки |
| sketch | эскиз | |
| profile (closed sketch loop) | профиль | |
| extrude / extrusion | выдавить / выдавливание | |
| revolve | вращение; revolve axis — ось вращения | as in Fusion, KOMPAS |
| fillet | скругление | |
| chamfer, bevel | фаска | |
| edge treatment / edge modifier | обработка рёбер | |
| edge feature | скругление или фаска; plural — скругления и фаски | |
| CAD worker / kernel (edge tools) | модуль скруглений и фасок | |
| handle (on-canvas control) | маркер; curve handle — маркер кривой | as Office «маркеры изменения размера» |
| corner / smooth point | угловая / гладкая точка; buttons «Заострить» / «Сгладить» / «Разделить» | as Illustrator |
| SVG path | контур | as Inkscape; a sketch profile stays «профиль» |
| align center / middle | по центру (X) / по середине (Y, Z) | as PowerPoint |
| solid (vs hole) | тело | |
| hole | отверстие | |
| boolean cut / subtract | вычитание | |
| union | объединение | |
| intersect | пересечение | |
| separate parts | разделить на части | |
| group / ungroup | сгруппировать / разгруппировать | |
| align | выровнять | |
| mirror | отразить зеркально | |
| duplicate | дублировать | |
| copy / cut / paste | копировать / вырезать / вставить | |
| undo / redo | отменить / повторить | |
| select / selection | выбрать / выбор; выделенные объекты | |
| selected (objects in the scene) | выделенные | chosen in a list, dialog or tool — выбранные; the verb is always «выбрать» |
| cancel (button) / undo | Отмена / Отменить | never «Отмена» for undo |
| action (history step, undo state) | действие | |
| history (toolbar section label) | история | short form of «история изменений» |
| unlimited | без ограничений | |
| shape | фигура | |
| object | объект | |
| body | тело | |
| mesh | модель; полигональная сетка only where the mesh itself matters (errors about triangles) | not «меш» |
| watertight / manifold mesh | замкнутая модель без дыр и лишних граней | not «многообразная» |
| triangle (mesh) | треугольник | |
| edge / face / vertex | ребро / грань / вершина | |
| dimension | размер | |
| width / depth / height | ширина / глубина / высота | |
| length (shape size along the depth axis) | длина | the English UI labels this axis Length |
| bricks / stud (units) | кирпичики / шип | LEGO-type bricks |
| elevation | высота над рабочей плоскостью | |
| rotation / rotate | поворот / повернуть | |
| scale (object) | масштаб объекта / масштабировать | |
| scale (drawing, 1:10) | масштаб | |
| zoom (view) | масштаб вида; zoom in / out — приблизить / отдалить | never bare «масштаб» |
| orbit | вращение вида / повернуть вид | Autodesk «орбита» is unclear to the audience |
| pan | сдвиг вида / сдвинуть вид | Autodesk «панорамирование» is unclear to the audience |
| fit / zoom to fit | показать всё | |
| home view (camera) | исходный вид | «главный вид» is the front view in GOST 2.305 |
| wireframe | каркас | |
| units | единицы измерения | |
| box | параллелепипед | not «куб» |
| cylinder / sphere / cone / pyramid / torus | цилиндр / сфера / конус / пирамида / тор | |
| tube | труба | |
| wedge | клин | |
| gear | зубчатое колесо | GOST 16530: «шестерня» is only the smaller gear of a pair |
| teeth / tooth | зубья / зуб | |
| helix angle | угол наклона зуба | |
| scribble | рисунок от руки | not «набросок»: reads as «эскиз» |
| import / export | импорт / экспорт; импортировать / экспортировать | |
| project | проект | |
| local project | проект в этом браузере | |
| dashboard / home page | главная | |
| thumbnail / snapshot (project card) | изображение проекта | |
| asset / resource (project file) | ресурс | |
| feature (project file) | операция | as KOMPAS |
| settings | настройки | |
| history (undo) | история изменений | |
| update | обновление / обновить | |
| you (addressing the user) | вы (lowercase) or impersonal | |
| challenge | задание | |
| tutorial | обучение / пошаговая инструкция | |
| sort: recent | по дате изменения | not «по дате»: unclear which date and order |
| shape defaults | параметры новых фигур | not «фигуры по умолчанию»: reads as a default set of shapes |
| Geometry (editor tab, next to Sketch) | 3D-модель | not «Геометрия»: reads as the school subject; pairs with «Эскиз» as 3D vs 2D |
| MCP (connection an AI agent uses to drive the editor) | MCP | name kept; notices about the agent's actions start with «MCP: » |
