// Items lying around the hospital. Art keys match docs/ASSETS.md (public/assets/items/…).
export type ItemKind = "battery" | "adrenaline" | "bottle" | "sedative" | "glowstick" | "note" | "map";

export interface ItemDef {
  name: string;
  /** Texture key of the pickup and the inventory icon. */
  icon: string;
  /** Relative chance to be generated. */
  weight: number;
  /** Takes an inventory slot (notes and map pieces are used on pickup). */
  stored: boolean;
  /** What happens when you use it, for the toast on pickup. */
  hint: string;
}

export const ITEMS_DEF: Record<ItemKind, ItemDef> = {
  battery:    { name: "Батарейка",   icon: "items/battery",    weight: 30, stored: true,  hint: "заряд фонарика" },
  adrenaline: { name: "Адреналин",   icon: "items/adrenaline", weight: 9,  stored: true,  hint: "бег без усталости" },
  bottle:     { name: "Бутылка",     icon: "items/bottle",     weight: 18, stored: true,  hint: "бросить — отвлечь шумом" },
  sedative:   { name: "Седативное",  icon: "items/sedative",   weight: 8,  stored: true,  hint: "сработает, если схватят" },
  glowstick:  { name: "Химсвет",     icon: "items/glowstick",  weight: 12, stored: true,  hint: "бросить — свет на 90 с" },
  note:       { name: "Записка",     icon: "items/note",       weight: 14, stored: false, hint: "" },
  map:        { name: "Обрывок карты", icon: "items/map_piece", weight: 9, stored: false, hint: "" },
};

export const ITEM_KINDS = Object.keys(ITEMS_DEF) as ItemKind[];

/** A fuse for the fuse box: carried in the hands, not in a slot. */
export const FUSE_ICON = "items/fuse";
export const FUSE_BOX = "interactive/fuse_box";
