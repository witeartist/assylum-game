export type RoomType = "ward" | "procedure" | "canteen" | "isolation" | "storage" | "morgue";

export interface RoomDef {
  label: string;
  /** Floor texture key. */
  floor: string;
  /** Furniture texture key (wards get beds instead, see levelgen). */
  prop: string;
  propScale: number;
}

export const ROOM_TYPES: RoomType[] = ["ward", "procedure", "canteen", "isolation", "storage", "morgue"];

export const ROOMS: Record<RoomType, RoomDef> = {
  ward:      { label: "Палата",      floor: "surfaces/floor_ward",      prop: "props/bed",     propScale: 1.35 },
  procedure: { label: "Процедурная", floor: "surfaces/floor_procedure", prop: "props/gurney",  propScale: 1.35 },
  canteen:   { label: "Столовая",    floor: "surfaces/floor_canteen",   prop: "props/table",   propScale: 1.5 },
  isolation: { label: "Изолятор",    floor: "surfaces/floor_isolation", prop: "props/bars",    propScale: 1.35 },
  storage:   { label: "Кладовая",    floor: "surfaces/floor_storage",   prop: "props/cabinet", propScale: 1.35 },
  morgue:    { label: "Морг",        floor: "surfaces/floor_morgue",    prop: "props/gurney",  propScale: 1.35 },
};

export const CORRIDOR_FLOOR = "surfaces/floor_corridor";
export const WALL_TOP = "surfaces/wall_top";
export const WALL_FACE = "surfaces/wall_face";

export const BED_SPRITES = {
  vertical: ["props/bed_v_1", "props/bed_v_2", "props/bed_v_3"],
  horizontal: ["props/bed_h_1"],
};

export type DecalKind = "blood" | "dirt" | "cracks" | "puddle" | "papers";

export const DECAL_KEYS: Record<DecalKind, string[]> = {
  blood: ["decals/blood_pool_1", "decals/blood_pool_2", "decals/blood_splatter_1", "decals/blood_splatter_2"],
  dirt: ["decals/dirt_1", "decals/dirt_2"],
  cracks: ["decals/cracks_1"],
  puddle: ["decals/puddle_1"],
  papers: ["decals/papers"],
};

/** Chance per floor tile of each decal kind, by room type ("corridor" for corridors). */
export const DECAL_DENSITY: Record<RoomType | "corridor", Partial<Record<DecalKind, number>>> = {
  corridor:  { dirt: 0.04, cracks: 0.03, papers: 0.02, puddle: 0.015, blood: 0.01 },
  ward:      { dirt: 0.05, papers: 0.03, blood: 0.02, puddle: 0.02 },
  procedure: { blood: 0.05, dirt: 0.04, puddle: 0.02, papers: 0.02 },
  canteen:   { dirt: 0.07, puddle: 0.04, papers: 0.02 },
  isolation: { blood: 0.05, dirt: 0.06, cracks: 0.04 },
  storage:   { dirt: 0.09, cracks: 0.04, puddle: 0.02 },
  morgue:    { blood: 0.06, puddle: 0.04, dirt: 0.03 },
};
