import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "../core/constants";
import { finishImages, loadGenerated, queueImages } from "../render/textures";
import { loadFonts } from "../ui/fonts";
import { label, uiCamera } from "../ui/components";
import { INK } from "../ui/theme";

export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload(): void {
    uiCamera(this);
    label(this, CANVAS_W / 2, CANVAS_H / 2, "ЗАГРУЗКА...", "h2", INK.title);
    queueImages(this);
  }

  async create(): Promise<void> {
    await loadGenerated(this);
    finishImages(this);
    await loadFonts();
    this.scene.start("Menu");
  }
}
