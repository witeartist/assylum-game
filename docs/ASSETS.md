# ASSYLUM — список ассетов для генерации

Документ для GPT-агента, который рисует картинки (gpt-image). Каждая строка — одна картинка.
Промпт = **общий блок** своего раздела + **описание** из таблицы. Промпты на английском:
модель так понимает их точнее.

Готовые файлы клади в `public/assets/<папка>/<имя>.png` (или просто отдай мне). Дальше я сам
обрежу, уменьшу, подгоню бесшовность, сделаю нормал-мапы и подключу через манифест.

**Приоритеты**
- **P1** — нужно для этапа 2 (графика 2.5D), делать первым.
- **P2** — следующий шаг.
- **P3** — потом.

---

## Общие правила (важно для всех картинок)

1. **Свет — ровный, без теней.** Никаких нарисованных теней, бликов, виньетки и направленного света.
   Свет, тени и фонарик рисует движок. Если свет уже «запечён» в картинку, фонарик будет выглядеть
   фальшиво.
2. **Один ракурс на всё.**
   - Объекты — вид сверху под углом 3/4, как на референсе: видна верхняя плоскость и немного
     передняя грань.
   - Пол и декали — строго сверху.
3. **Прозрачный фон** у объектов и декалей (`background: transparent`, PNG). Текстуры пола и стен —
   непрозрачные, на весь квадрат.
4. **Один объект на картинку**, по центру, целиком в кадре, с небольшими полями. Без текста,
   рамок и водяных знаков.
5. **Размеры генерации:** 1024×1024, 1536×1024 (горизонтальные объекты) или 1024×1536 (вертикальные).
6. **Масштаб в игре:** 1 клетка = 64 px. В таблицах указано, сколько клеток занимает объект.
7. **Единый стиль:** сначала сгенерируй 2–3 текстуры пола и кровать, выбери удачные и прикладывай
   их как референс стиля к следующим запросам.
8. **Варианты:** делай 2–3 варианта, выбирай лучший. Если картинка с тенью или фоном — перегенерируй.

---

## A. Поверхности — бесшовные текстуры (P1)

Папка `public/assets/surfaces/`, 1024×1024, непрозрачные.

**Общий блок:**
> Seamless tileable texture for a top-down horror game, strictly top-down orthographic view, no perspective. Realistic painted style, abandoned Soviet-era psychiatric hospital, desaturated cold teal-gray palette, grime and wear. Flat neutral even lighting, no shadows, no highlights, no vignette. Fills the whole square edge to edge, tiles seamlessly on all sides. No text, no border.

| Файл | P | Описание (добавить к блоку) |
|---|---|---|
| `floor_corridor.png` | P1 | worn gray-green linoleum floor with scuff marks, small cracks, dirt along seams, faded wheel tracks |
| `floor_ward.png` | P1 | small pale ceramic floor tiles (about 8 tiles across), dirty grout, a few cracked and chipped tiles, faint old stains |
| `floor_procedure.png` | P1 | pale blue-green ceramic floor tiles, clinical, dried rusty-brown stains, chipped corners |
| `floor_canteen.png` | P1 | old beige and brown checkered linoleum, worn through in places, dried spills |
| `floor_isolation.png` | P1 | bare dirty concrete floor with scratches, dark water stains, hairline cracks |
| `floor_storage.png` | P1 | rough gray concrete floor with oil stains, dust and small debris |
| `floor_morgue.png` | P1 | cold blue-white ceramic tiles, wet-looking dark stains, cracked grout |
| `wall_top.png` | P1 | top surface of thick hospital walls seen from above: dark weathered concrete with dust and cracks, very dark overall |
| `wall_face.png` | P1 | front view of a hospital wall, seamless horizontally: lower 60% dull teal oil paint, upper part dirty whitewashed plaster, peeling paint, rust streaks, cracks, dark baseboard strip at the bottom |
| `wall_face_tiled.png` | P2 | front view of a hospital wall, seamless horizontally: lower half cracked white ceramic tiles with dirty grout, upper half stained plaster |

---

## B. Декали — пятна на полу (P1)

Именно декали прячут сетку клеток. Папка `public/assets/decals/`, прозрачный фон, строго сверху.

**Общий блок:**
> Decal for a top-down horror game floor, strictly top-down orthographic view, isolated on a transparent background with soft irregular edges. Realistic, dark and grimy, desaturated colors. Flat lighting, no shadows. No text.

| Файл | P | Размер | Описание |
|---|---|---|---|
| `blood_pool_1.png`, `blood_pool_2.png` | P1 | 1024² | dark dried blood pool, irregular shape, darker center |
| `blood_splatter_1.png` … `_3.png` | P1 | 1024² | blood splatter with droplets, dark red, partially dried |
| `blood_drag.png` | P1 | 1536×1024 | long blood smear drag trail across the floor |
| `bloody_footprints.png` | P2 | 1536×1024 | trail of bloody bare footprints walking across |
| `dirt_1.png`, `dirt_2.png` | P1 | 1024² | patch of grime, dust and dark dirt |
| `puddle_1.png`, `puddle_2.png` | P1 | 1024² | dark dirty water puddle with slightly glossy surface |
| `cracks_1.png`, `cracks_2.png` | P1 | 1024² | floor cracks spreading from a point, thin dark lines |
| `papers.png` | P1 | 1024² | scattered old medical records and papers, yellowed, some stained |
| `glass_shards.png` | P2 | 1024² | broken glass shards scattered on the floor |
| `pills.png` | P2 | 1024² | scattered white pills around a small tipped-over medicine bottle |
| `rubble.png` | P2 | 1024² | fallen plaster chunks and dust |
| `rust_stain.png` | P2 | 1024² | rusty brown water stain |

---

## C. Мебель и объекты интерьера

Папка `public/assets/props/`, прозрачный фон, вид 3/4.

**Общий блок:**
> Game asset for a 2.5D top-down horror game: <OBJECT>, seen from a top-down 3/4 camera (looking down at about 60 degrees, top surface clearly visible, front side slightly visible). Realistic painted style, abandoned Soviet-era psychiatric hospital, desaturated cold teal-gray palette, grime, rust, peeling paint, subtle dried blood. Flat neutral diffuse lighting, no cast shadow, no drop shadow, no strong highlights. Single isolated object, centered, fully in frame with small margins, transparent background. No text, no watermark.

Вместо `<OBJECT>` подставь описание из таблицы.

**Палата (ward)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `bed_v_1.png` | P1 | 1×2 | 1024×1536 | old metal hospital bed with a thin stained mattress and crumpled sheet, headboard at the top, bed oriented vertically |
| `bed_v_2.png` | P1 | 1×2 | 1024×1536 | rusty metal hospital bed with torn blood-stained sheets, headboard at the top, oriented vertically |
| `bed_h_1.png` | P1 | 2×1 | 1536×1024 | old metal hospital bed with a stained mattress, headboard on the left, oriented horizontally |
| `bedside_cabinet.png` | P1 | 1×1 | 1024² | small metal bedside cabinet with a drawer, chipped white paint |
| `iv_stand.png` | P1 | 1×1 | 1024² | IV drip stand on wheels with an empty hanging bag |
| `wheelchair.png` | P2 | 1×1 | 1024² | old rusty wheelchair |
| `chair_metal.png` | P2 | 1×1 | 1024² | simple metal hospital chair |

**Процедурная (procedure)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `operating_table.png` | P1 | 1×2 | 1024×1536 | old surgical operating table with leather straps, oriented vertically |
| `instrument_trolley.png` | P1 | 1×1 | 1024² | steel medical trolley with scattered surgical instruments on a tray |
| `medicine_cabinet.png` | P2 | 1×1 | 1024² | glass-front medicine cabinet with bottles, standing against a wall |
| `sink.png` | P2 | 1×1 | 1024² | old cracked ceramic hospital sink with rusty tap, against a wall |

**Столовая (canteen)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `canteen_table.png` | P1 | 3×1 | 1536×1024 | long worn canteen table with a few dirty metal trays and cups, oriented horizontally |
| `canteen_bench.png` | P1 | 3×1 | 1536×1024 | long wooden bench, oriented horizontally |
| `serving_counter.png` | P2 | 3×1 | 1536×1024 | steel serving counter with big dented pots, oriented horizontally |

**Изолятор (isolation)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `restraint_bed.png` | P1 | 1×2 | 1024×1536 | metal bed with leather restraint straps, bolted to the floor, oriented vertically |
| `straitjacket.png` | P2 | 1×1 | 1024² | dirty straitjacket lying crumpled on the floor |
| `metal_toilet.png` | P2 | 1×1 | 1024² | stainless steel prison-style toilet |

**Кладовая (storage)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `shelf_boxes.png` | P1 | 2×1 | 1536×1024 | metal storage shelf with cardboard boxes and linen, oriented horizontally |
| `boxes_stack.png` | P1 | 1×1 | 1024² | stack of old cardboard boxes, one torn open |
| `barrel.png` | P2 | 1×1 | 1024² | rusty metal barrel |
| `mop_bucket.png` | P2 | 1×1 | 1024² | mop in a dented bucket with dirty water |
| `linen_cart.png` | P2 | 1×1 | 1024² | hospital laundry cart with stained sheets |

**Морг (morgue)**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `autopsy_table.png` | P1 | 1×2 | 1024×1536 | stainless steel autopsy table with drain, oriented vertically |
| `body_on_gurney.png` | P1 | 1×2 | 1024×1536 | body covered with a stained white sheet on a metal gurney, oriented vertically |
| `morgue_fridge.png` | P2 | 2×1 | 1536×1024 | wall of steel morgue refrigerator doors, one door ajar, against a wall |
| `body_bag.png` | P2 | 1×2 | 1024×1536 | black body bag lying on the floor, oriented vertically |

**Коридоры**

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `gurney.png` | P1 | 1×2 | 1024×1536 | empty old hospital gurney on wheels, oriented vertically |
| `waiting_bench.png` | P1 | 2×1 | 1536×1024 | row of connected metal waiting-room chairs, oriented horizontally |
| `nurse_desk.png` | P2 | 2×1 | 1536×1024 | abandoned nurse station desk with papers and an old phone |
| `radiator.png` | P2 | 1×1 | 1024² | old cast-iron radiator against a wall |
| `trash_bin.png` | P2 | 1×1 | 1024² | dented metal trash bin, overflowing |
| `fallen_chair.png` | P2 | 1×1 | 1024² | metal chair knocked over on its side |

**Светильники.** Это только картинка корпуса, свечение делает движок.

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `lamp_fluorescent.png` | P1 | 2×1 | 1536×1024 | wall-mounted fluorescent tube lamp fixture, tube turned off, dusty |
| `lamp_emergency.png` | P1 | 1×1 | 1024² | small wall-mounted red emergency lamp, turned off |
| `lamp_broken.png` | P2 | 2×1 | 1536×1024 | broken wall-mounted fluorescent lamp with a cracked tube hanging on wires |

---

## D. Интерактивные объекты (P1)

Папка `public/assets/interactive/`, общий блок из раздела C.

| Файл | P | Клетки | Размер | `<OBJECT>` |
|---|---|---|---|---|
| `locker_closed.png` | P1 | 1×1 | 1024×1536 | tall narrow metal staff locker, doors closed, dented, chipped paint |
| `locker_open.png` | P1 | 1×1 | 1024×1536 | the same tall metal staff locker with the door half open, empty inside |
| `terminal.png` | P1 | 1×1 | 1024² | wall-mounted security keypad terminal with a small dark screen and numeric buttons, Soviet-era industrial design |
| `door_metal_h.png` | P1 | 1×1 | 1024² | heavy locked metal door with rivets and a keypad lock, closed, in a horizontal wall |
| `door_metal_v.png` | P1 | 1×1 | 1024×1536 | the same heavy locked metal door, in a vertical wall (seen edge-on from the side) |
| `exit_door_closed.png` | P1 | 2×1 | 1536×1024 | heavy double exit doors chained shut, green running-man emergency exit sign above (pictogram only, no letters) |
| `exit_door_open.png` | P1 | 2×1 | 1536×1024 | the same double exit doors wide open, broken chain on the floor, faint daylight beyond |
| `key.png` | P1 | ⅓×⅓ | 1024² | old brass key with a paper tag on a string |
| `corpse.png` | P1 | 1×1 | 1024² | body of a patient in a hospital gown lying face down in a pool of blood |

---

## E. Предметы для новой механики (P2)

Папка `public/assets/items/`, 1024×1024. Один и тот же файл используется в мире (маленьким) и в
интерфейсе.

**Общий блок:**
> Game item for a 2.5D top-down horror game: <ITEM>, seen from a top-down 3/4 angle, realistic painted style, slightly worn, desaturated palette with one clear readable color accent. Flat neutral lighting, no shadow. Single isolated object, centered, transparent background, no text.

| Файл | `<ITEM>` |
|---|---|
| `battery.png` | old D-size flashlight battery |
| `adrenaline.png` | medical syringe with bright yellow liquid |
| `bottle.png` | empty green glass bottle |
| `sedative.png` | syringe with blue liquid and a cap |
| `glowstick.png` | green chemical glowstick |
| `note.png` | folded handwritten note on yellowed paper |
| `map_piece.png` | torn piece of a hospital floor plan |
| `fuse.png` | old ceramic electrical fuse |

---

## F. Персонажи (P2)

Оставляем твой чиби-пиксель-арт, как на референсе. Для «живости» нужны ракурсы.
**К каждому запросу прикладывай текущую картинку персонажа** из `public/Sprite/` как референс:
иначе модель нарисует другого человека.

Папка `public/assets/characters/`, 1024×1024, по 3 файла на персонажа:
`<имя>_down.png` (лицом к камере), `<имя>_up.png` (спиной), `<имя>_side.png` (вправо; влево
отзеркалю сам).

Персонажи: `naumi`, `kuruna`, `wite`, `sumrak`, `yoko`, `foxmind`, `jeloch` — всего 21 картинка.

**Промпт:**
> Chibi pixel-art game sprite. Use the attached image as the exact character reference: same hair, face, outfit, colors and proportions. The character is seen from a top-down 3/4 game camera, <DIRECTION>, standing, full body, clean dark outline. Flat lighting, no shadow on the ground. Single character, centered, transparent background, no text.

Вместо `<DIRECTION>` подставь:
- для `_down` — `facing toward the camera`;
- для `_up` — `facing away from the camera, back view`;
- для `_side` — `facing right, side view`.

По желанию (P3) добавь `<имя>_caught.png` — персонаж лежит на полу.

---

## G. Интерфейс (P3)

Папка `public/assets/ui/`.

| Файл | Размер | Описание |
|---|---|---|
| `panel.png` | 1536×1024 | dark scratched metal plate panel with rivets in the corners, empty center, for UI background, front view, flat lighting |
| `button.png` | 1536×1024 | wide rectangular button made of dark worn metal with a thin red rim, empty, front view |
| `icon_key.png`, `icon_runner.png`, `icon_skull.png`, `icon_boss.png`, `icon_battery.png`, `icon_stamina.png`, `icon_flashlight.png`, `icon_hide.png` | 1024² | simple bold game UI icon of <key / running person / skull / monster face / battery / lungs / flashlight / closed locker>, off-white with dark outline, flat, transparent background |

---

## Что генерировать НЕ нужно (сделаю кодом)

- Свет, тени, лучи фонарика, туман, свечение ламп и терминалов.
- Нормал-мапы: получу из текстур автоматически.
- Частицы (пыль, искры, брызги крови) и эффекты экрана (виньетка, зерно, искажения).
- Анимация ходьбы (покачивание, наклон) и тени под персонажами.

---

## Звук (P2, отдельно — не gpt-image)

Нужен другой инструмент: ElevenLabs Sound Effects или бесплатные CC0 с freesound.org.
Формат `.ogg`, моно, 44,1 кГц. Папка `public/assets/sfx/`.

- **Шаги:** `step_tile_walk_1..4`, `step_tile_run_1..4`.
- **Укрытия и двери:** `locker_open`, `locker_close`, `door_unlock`, `door_creak`.
- **Терминал и фонарик:** `terminal_beep`, `terminal_error`, `terminal_success`, `flashlight_click`.
- **Состояния:** `key_pickup`, `heartbeat_loop`, `breath_heavy`, `caught_scream`.
- **Монстры:** `fox_laugh`, `fox_growl`, `boss_roar`.
- **Атмосфера:** `lamp_buzz_loop`, `ambient_drone_loop`, `distant_scream_1..3`.
