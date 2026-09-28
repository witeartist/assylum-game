// Furniture catalogue: which objects stand in which rooms, their footprint in tiles and
// whether they block movement. Art keys match docs/ASSETS.md (public/assets/props/…).
import type { RoomType } from "./rooms";

export type Place = RoomType | "corridor";

export interface FurnitureDef {
  key: string;
  /** Footprint in tiles (w × h). */
  w: number;
  h: number;
  /** Blocks movement (flat things like a body bag don't). */
  solid: boolean;
  /**
   * Where it stands: "north" against the north wall (cabinets, sinks, fridges…), "wall" along any
   * wall, "center" in the middle of the room with space around it (tables, operating tables),
   * "side" against the west or east wall — side-view art, drawn for a wall on its left and
   * mirrored against the east wall.
   */
  spot: "north" | "wall" | "center" | "side";
  places: Place[];
  /** Placed right below this piece when there is room (a bench at a table, a trolley by the operating table). */
  with?: string;
  /** Relative chance to be picked. */
  weight: number;
  /**
   * On-screen height of the picture, world px (a runner is 30). Without it the picture spans
   * its footprint's width — right for beds and tables, too big for small things.
   */
  height?: number;
}

export const FURNITURE: FurnitureDef[] = [
  { key: "props/bedside_cabinet",    w: 1, h: 1, solid: true,  spot: "wall",   places: ["ward"], weight: 3, height: 20 },
  { key: "props/iv_stand",           w: 1, h: 1, solid: true,  spot: "wall",   places: ["ward", "procedure"], weight: 2, height: 34 },
  { key: "props/wheelchair",         w: 1, h: 1, solid: true,  spot: "wall",   places: ["ward", "corridor"], weight: 1, height: 26 },
  { key: "props/chair_metal",        w: 1, h: 1, solid: true,  spot: "wall",   places: ["ward", "canteen", "office"], weight: 2, height: 22 },
  { key: "props/operating_table",    w: 1, h: 2, solid: true,  spot: "center", places: ["procedure"], weight: 3, with: "props/instrument_trolley" },
  { key: "props/instrument_trolley", w: 1, h: 1, solid: true,  spot: "wall",   places: ["procedure", "morgue"], weight: 2, height: 22 },
  { key: "props/medicine_cabinet",   w: 1, h: 1, solid: true,  spot: "north",  places: ["procedure", "storage"], weight: 2, height: 34 },
  { key: "props/sink",               w: 1, h: 1, solid: true,  spot: "north",  places: ["procedure", "morgue", "isolation", "hydro"], weight: 2, height: 22 },
  { key: "props/canteen_table",      w: 3, h: 1, solid: true,  spot: "center", places: ["canteen"], weight: 5, with: "props/canteen_bench" },
  { key: "props/canteen_bench",      w: 3, h: 1, solid: true,  spot: "wall",   places: ["canteen"], weight: 1 },
  { key: "props/serving_counter",    w: 3, h: 1, solid: true,  spot: "north",  places: ["canteen"], weight: 2, height: 40 },
  { key: "props/restraint_bed",      w: 1, h: 2, solid: true,  spot: "center", places: ["isolation"], weight: 4 },
  { key: "props/straitjacket",       w: 1, h: 1, solid: false, spot: "wall",   places: ["isolation"], weight: 2, height: 16 },
  { key: "props/metal_toilet",       w: 1, h: 1, solid: true,  spot: "north",  places: ["isolation"], weight: 2, height: 18 },
  { key: "props/shelf_boxes",        w: 2, h: 1, solid: true,  spot: "north",  places: ["storage"], weight: 4, height: 40 },
  { key: "props/boxes_stack",        w: 1, h: 1, solid: true,  spot: "wall",   places: ["storage"], weight: 3, height: 24 },
  { key: "props/barrel",             w: 1, h: 1, solid: true,  spot: "wall",   places: ["storage"], weight: 2, height: 22 },
  { key: "props/mop_bucket",         w: 1, h: 1, solid: true,  spot: "wall",   places: ["storage", "corridor", "hydro"], weight: 1, height: 26 },
  { key: "props/linen_cart",         w: 1, h: 1, solid: true,  spot: "wall",   places: ["storage", "ward"], weight: 1, height: 24 },
  { key: "props/autopsy_table",      w: 1, h: 2, solid: true,  spot: "center", places: ["morgue"], weight: 3 },
  { key: "props/body_on_gurney",     w: 1, h: 2, solid: true,  spot: "center", places: ["morgue"], weight: 3 },
  { key: "props/morgue_fridge",      w: 2, h: 1, solid: true,  spot: "north",  places: ["morgue"], weight: 3, height: 40 },
  { key: "props/body_bag",           w: 1, h: 2, solid: false, spot: "center", places: ["morgue"], weight: 2 },
  { key: "props/gurney",             w: 1, h: 2, solid: true,  spot: "wall",   places: ["corridor", "procedure"], weight: 2 },
  { key: "props/waiting_bench",      w: 2, h: 1, solid: true,  spot: "north",  places: ["corridor"], weight: 2 },
  { key: "props/nurse_desk",         w: 2, h: 1, solid: true,  spot: "north",  places: ["corridor"], weight: 1 },
  { key: "props/radiator",           w: 1, h: 1, solid: true,  spot: "north",  places: ["corridor", "ward"], weight: 2, height: 18 },
  { key: "props/trash_bin",          w: 1, h: 1, solid: true,  spot: "wall",   places: ["corridor", "canteen", "office"], weight: 2, height: 17 },
  { key: "props/fallen_chair",       w: 1, h: 1, solid: false, spot: "wall",   places: ["corridor", "canteen", "ward", "office"], weight: 2, height: 16 },
  // Side views of the things above, for the west and east walls.
  { key: "props/shelf_boxes_side",      w: 1, h: 2, solid: true, spot: "side", places: ["storage"], weight: 3, height: 52 },
  { key: "props/morgue_fridge_side",    w: 1, h: 2, solid: true, spot: "side", places: ["morgue"], weight: 2, height: 58 },
  { key: "props/medicine_cabinet_side", w: 1, h: 1, solid: true, spot: "side", places: ["procedure", "storage"], weight: 2, height: 38 },
  { key: "props/sink_side",             w: 1, h: 1, solid: true, spot: "side", places: ["procedure", "morgue", "isolation", "hydro"], weight: 2, height: 26 },
  { key: "props/radiator_side",         w: 1, h: 1, solid: true, spot: "side", places: ["ward", "office"], weight: 2, height: 26 },
  // The doctor's office.
  { key: "props/desk",                  w: 2, h: 1, solid: true, spot: "center", places: ["office"], weight: 4, with: "props/chair_metal" },
  { key: "props/bookshelf",             w: 2, h: 1, solid: true, spot: "north",  places: ["office"], weight: 3 },
  { key: "props/filing_cabinet",        w: 1, h: 1, solid: true, spot: "wall",   places: ["office", "storage"], weight: 3, height: 40 },
  // Hydrotherapy.
  { key: "props/hydro_tub",             w: 1, h: 2, solid: true, spot: "center", places: ["hydro"], weight: 4 },
  { key: "props/shower_stall",          w: 1, h: 1, solid: true, spot: "north",  places: ["hydro"], weight: 3, height: 46 },
  { key: "props/mattress_floor",        w: 1, h: 2, solid: false, spot: "wall",  places: ["isolation", "hydro"], weight: 2 },
];

export const FURNITURE_BY_KEY: ReadonlyMap<string, FurnitureDef> = new Map(FURNITURE.map(f => [f.key, f]));

/** Pieces of furniture per room: roughly one per this many interior tiles. */
export const TILES_PER_PIECE = 7;
/** Corridor pieces per this many corridor tiles (only where the corridor is wide enough). */
export const CORRIDOR_TILES_PER_PIECE = 45;

/** Things hung on the front of north walls (drawn only once their art exists). */
export const WALL_DECOR = [
  "props/decor_window_barred", "props/decor_board", "props/decor_clock",
  "props/decor_pipes", "props/decor_extinguisher", "props/decor_marks",
];
/** Share of rooms and corridor stretches that get a piece of wall decor. */
export const WALL_DECOR_SHARE = 0.35;

/** Lamp fixture art by lamp kind. */
export const LAMP_ART = {
  normal: "props/lamp_fluorescent",
  emergency: "props/lamp_emergency",
  broken: "props/lamp_broken",
};
