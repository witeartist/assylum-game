// Asset manifest: every image and sound the game loads. Keys are what the code uses; if a
// file is missing, the procedural placeholder with the same key (render/placeholders.ts) or a
// coloured square is used, so art can be added gradually.

export interface ImageAsset {
  key: string;
  url: string;
  /** Crop transparent margins after loading (generated art has padding). */
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
  { key: "ui.menuArt",   url: "Sprite/arts/main menu.jpg" },
  { key: "prop.bed_v1",  url: "Sprite/interior/bed_vertical.png",          trim: true, fallback: "#5f6878" },
  { key: "prop.bed_v2",  url: "Sprite/interior/bed_vertical_type_2.png",   trim: true, fallback: "#5f6878" },
  { key: "prop.bed_v3",  url: "Sprite/interior/bed_vertical_type_3.png",   trim: true, fallback: "#5f6878" },
  { key: "prop.bed_h1",  url: "Sprite/interior/bed_horizontal_type_1.png", trim: true, fallback: "#5f6878" },
];

export const MUSIC = {
  main: "sound/Asylum%20Echoes.mp3",
};
