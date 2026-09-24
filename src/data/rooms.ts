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
  ward:      { label: "Палата",      floor: "tile.floor.ward",      prop: "prop.bed",     propScale: 1.35 },
  procedure: { label: "Процедурная", floor: "tile.floor.procedure", prop: "prop.gurney",  propScale: 1.35 },
  canteen:   { label: "Столовая",    floor: "tile.floor.canteen",   prop: "prop.table",   propScale: 1.5 },
  isolation: { label: "Изолятор",    floor: "tile.floor.isolation", prop: "prop.bars",    propScale: 1.35 },
  storage:   { label: "Кладовая",    floor: "tile.floor.storage",   prop: "prop.cabinet", propScale: 1.35 },
  morgue:    { label: "Морг",        floor: "tile.floor.morgue",    prop: "prop.gurney",  propScale: 1.35 },
};

export const BED_SPRITES = {
  vertical: ["prop.bed_v1", "prop.bed_v2", "prop.bed_v3"],
  horizontal: ["prop.bed_h1"],
};
