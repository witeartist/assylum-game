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
  /** Must stand against the north wall (cabinets, sinks, fridges…). */
  againstWall?: boolean;
  places: Place[];
  /** Relative chance to be picked. */
  weight: number;
}

export const FURNITURE: FurnitureDef[] = [
  { key: "props/bedside_cabinet",   w: 1, h: 1, solid: true,  places: ["ward"], weight: 3 },
  { key: "props/iv_stand",          w: 1, h: 1, solid: true,  places: ["ward", "procedure"], weight: 2 },
  { key: "props/wheelchair",        w: 1, h: 1, solid: true,  places: ["ward", "corridor"], weight: 1 },
  { key: "props/chair_metal",       w: 1, h: 1, solid: true,  places: ["ward", "canteen"], weight: 2 },
  { key: "props/operating_table",   w: 1, h: 2, solid: true,  places: ["procedure"], weight: 3 },
  { key: "props/instrument_trolley", w: 1, h: 1, solid: true, places: ["procedure", "morgue"], weight: 3 },
  { key: "props/medicine_cabinet",  w: 1, h: 1, solid: true,  againstWall: true, places: ["procedure", "storage"], weight: 2 },
  { key: "props/sink",              w: 1, h: 1, solid: true,  againstWall: true, places: ["procedure", "morgue", "isolation"], weight: 2 },
  { key: "props/canteen_table",     w: 3, h: 1, solid: true,  places: ["canteen"], weight: 4 },
  { key: "props/canteen_bench",     w: 3, h: 1, solid: true,  places: ["canteen"], weight: 3 },
  { key: "props/serving_counter",   w: 3, h: 1, solid: true,  againstWall: true, places: ["canteen"], weight: 2 },
  { key: "props/restraint_bed",     w: 1, h: 2, solid: true,  places: ["isolation"], weight: 4 },
  { key: "props/straitjacket",      w: 1, h: 1, solid: false, places: ["isolation"], weight: 2 },
  { key: "props/metal_toilet",      w: 1, h: 1, solid: true,  againstWall: true, places: ["isolation"], weight: 2 },
  { key: "props/shelf_boxes",       w: 2, h: 1, solid: true,  againstWall: true, places: ["storage"], weight: 4 },
  { key: "props/boxes_stack",       w: 1, h: 1, solid: true,  places: ["storage"], weight: 3 },
  { key: "props/barrel",            w: 1, h: 1, solid: true,  places: ["storage"], weight: 2 },
  { key: "props/mop_bucket",        w: 1, h: 1, solid: true,  places: ["storage", "corridor"], weight: 1 },
  { key: "props/linen_cart",        w: 1, h: 1, solid: true,  places: ["storage", "ward"], weight: 1 },
  { key: "props/autopsy_table",     w: 1, h: 2, solid: true,  places: ["morgue"], weight: 3 },
  { key: "props/body_on_gurney",    w: 1, h: 2, solid: true,  places: ["morgue"], weight: 3 },
  { key: "props/morgue_fridge",     w: 2, h: 1, solid: true,  againstWall: true, places: ["morgue"], weight: 3 },
  { key: "props/body_bag",          w: 1, h: 2, solid: false, places: ["morgue"], weight: 2 },
  { key: "props/gurney",            w: 1, h: 2, solid: true,  places: ["corridor", "procedure"], weight: 2 },
  { key: "props/waiting_bench",     w: 2, h: 1, solid: true,  againstWall: true, places: ["corridor"], weight: 2 },
  { key: "props/nurse_desk",        w: 2, h: 1, solid: true,  places: ["corridor"], weight: 1 },
  { key: "props/radiator",          w: 1, h: 1, solid: true,  againstWall: true, places: ["corridor", "ward"], weight: 2 },
  { key: "props/trash_bin",         w: 1, h: 1, solid: true,  places: ["corridor", "canteen"], weight: 2 },
  { key: "props/fallen_chair",      w: 1, h: 1, solid: false, places: ["corridor", "canteen", "ward"], weight: 2 },
];

/** Pieces of furniture per room: roughly one per this many interior tiles. */
export const TILES_PER_PIECE = 7;
/** Corridor pieces per this many corridor tiles (only where the corridor is wide enough). */
export const CORRIDOR_TILES_PER_PIECE = 45;

/** Lamp fixture art by lamp kind. */
export const LAMP_ART = {
  normal: "props/lamp_fluorescent",
  emergency: "props/lamp_emergency",
  broken: "props/lamp_broken",
};
