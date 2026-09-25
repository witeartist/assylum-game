// Asset manifest. Texture keys are file paths without extension ("props/bed_v_1"), the same as
// in docs/ASSETS.md. Three sources, later ones win:
//   1. procedural placeholders (render/placeholders.ts, surfaces.ts, props.ts);
//   2. hand-made art already in the repo, listed below;
//   3. generated art processed by `npm run assets` into public/assets/ (see assets/manifest.json).

export interface ImageAsset {
  key: string;
  url: string;
  /** Crop transparent margins after loading. */
  trim?: boolean;
  /** Colour of the fallback square if the file fails and no placeholder exists. */
  fallback?: string;
}

export const IMAGES: ImageAsset[] = [
  { key: "char.Naumi",   url: "Sprite/naumi.png",   trim: true, fallback: "#e879a0" },
  { key: "char.Kuruna",  url: "Sprite/Kuruna.png",  trim: true, fallback: "#5baef7" },
  { key: "char.Wite",    url: "Sprite/Wite.png",    trim: true, fallback: "#e8e8e8" },
  { key: "char.Sumrak",  url: "Sprite/Sumrak.png",  trim: true, fallback: "#7a7a9a" },
  { key: "char.Yoko",    url: "Sprite/yoko.png",    trim: true, fallback: "#f1a127" },
  { key: "char.Foxmind", url: "Sprite/Foxmind.png", trim: true, fallback: "#e84040" },
  { key: "char.Jeloch",  url: "Sprite/jeloch.png",  trim: true, fallback: "#5ec45e" },
  { key: "ui/menu_art",  url: "Sprite/arts/main menu.jpg" },
  // Older hand-drawn beds, used only if generated ones are missing.
  { key: "props/bed_v_1", url: "Sprite/interior/bed_vertical.png",          trim: true, fallback: "#5f6878" },
  { key: "props/bed_v_2", url: "Sprite/interior/bed_vertical_type_2.png",   trim: true, fallback: "#5f6878" },
  { key: "props/bed_h_1", url: "Sprite/interior/bed_horizontal_type_1.png", trim: true, fallback: "#5f6878" },
];

/** Index written by `npm run assets`: generated art that exists in public/assets/. */
export const GENERATED_INDEX = "assets/manifest.json";

/** One repetition of a generated surface texture spans this many tiles (so its pattern never lines up with the grid). */
export const GENERATED_SURFACE_TILES = 6;
/** Per-surface exceptions (the wall front is a short strip, so it repeats more often). */
export const GENERATED_SURFACE_TILES_BY_KEY: Record<string, number> = {
  "surfaces/wall_face": 3,
};

