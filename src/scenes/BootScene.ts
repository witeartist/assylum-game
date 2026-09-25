import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { audio } from "../core/audio";
import { finishImages, loadArt, queueIndex } from "../render/textures";
import { loadFonts } from "../ui/fonts";
import { label, uiCamera } from "../ui/components";
import { INK } from "../ui/theme";

export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload(): void {
    uiCamera(this);
    label(this, CANVAS_W / 2, CANVAS_H / 2, "ЗАГРУЗКА...", "h2", INK.title);
    queueIndex(this);
    void audio.load();
  }

  async create(): Promise<void> {
    await loadArt(this);
    finishImages(this);
    await loadFonts();
    await audio.load();
    this.scene.start("Menu");
  }
}
