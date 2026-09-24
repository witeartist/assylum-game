export type RoomType = "ward" | "procedure" | "canteen" | "isolation" | "storage" | "morgue";

export interface RoomDef {
  label: string;
  /** Floor texture key. */
  floor: string;
}

export const ROOM_TYPES: RoomType[] = ["ward", "procedure", "canteen", "isolation", "storage", "morgue"];

export const ROOMS: Record<RoomType, RoomDef> = {
  ward:      { label: "Палата",      floor: "surfaces/floor_ward" },
  procedure: { label: "Процедурная", floor: "surfaces/floor_procedure" },
  canteen:   { label: "Столовая",    floor: "surfaces/floor_canteen" },
  isolation: { label: "Изолятор",    floor: "surfaces/floor_isolation" },
  storage:   { label: "Кладовая",    floor: "surfaces/floor_storage" },
  morgue:    { label: "Морг",        floor: "surfaces/floor_morgue" },
};

export const CORRIDOR_FLOOR = "surfaces/floor_corridor";
export const WALL_TOP = "surfaces/wall_top";
export const WALL_FACE = "surfaces/wall_face";

export const BED_SPRITES = {
  vertical: ["props/bed_v_1", "props/bed_v_2"],
  horizontal: ["props/bed_h_1"],
};

export type DecalKind = "blood" | "trail" | "dirt" | "cracks" | "puddle" | "papers" | "debris" | "rust";

export const DECAL_KEYS: Record<DecalKind, string[]> = {
  blood: ["decals/blood_pool_1", "decals/blood_pool_2", "decals/blood_splatter_1", "decals/blood_splatter_2", "decals/blood_splatter_3"],
  trail: ["decals/blood_drag", "decals/bloody_footprints"],
  dirt: ["decals/dirt_1", "decals/dirt_2"],
  cracks: ["decals/cracks_1", "decals/cracks_2"],
  puddle: ["decals/puddle_1", "decals/puddle_2"],
  papers: ["decals/papers", "decals/pills"],
  debris: ["decals/glass_shards", "decals/rubble"],
  rust: ["decals/rust_stain"],
};

/** Size of each decal in tiles (its longer side). */
export const DECAL_TILES: Record<string, number> = {
  "decals/blood_pool_1": 1.7, "decals/blood_pool_2": 1.5, "decals/blood_splatter_1": 1.5, "decals/blood_splatter_2": 1.4,
  "decals/blood_splatter_3": 1.4, "decals/blood_drag": 3, "decals/bloody_footprints": 3.2, "decals/dirt_1": 2.2,
  "decals/dirt_2": 2, "decals/cracks_1": 1.8, "decals/cracks_2": 1.8, "decals/puddle_1": 1.8, "decals/puddle_2": 1.8,
  "decals/papers": 1.1, "decals/pills": 0.8, "decals/glass_shards": 1.1, "decals/rubble": 1.5, "decals/rust_stain": 1.6,
};

/** Chance per floor tile of each decal kind, by room type ("corridor" for corridors). */
export const DECAL_DENSITY: Record<RoomType | "corridor", Partial<Record<DecalKind, number>>> = {
  corridor:  { dirt: 0.035, cracks: 0.03, papers: 0.015, puddle: 0.015, debris: 0.01, trail: 0.006, blood: 0.008, rust: 0.01 },
  ward:      { dirt: 0.04, papers: 0.03, blood: 0.02, puddle: 0.015, debris: 0.01 },
  procedure: { blood: 0.05, papers: 0.03, dirt: 0.03, debris: 0.02, puddle: 0.015 },
  canteen:   { dirt: 0.06, puddle: 0.04, debris: 0.02, papers: 0.015 },
  isolation: { blood: 0.05, trail: 0.015, dirt: 0.05, cracks: 0.04 },
  storage:   { dirt: 0.07, cracks: 0.04, rust: 0.03, puddle: 0.02, debris: 0.02 },
  morgue:    { blood: 0.06, trail: 0.02, puddle: 0.04, dirt: 0.02 },
};
