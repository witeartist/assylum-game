// ============================================================
//  ASSYLUM — main.ts — Entry point
// ============================================================
import Phaser from "phaser";
import { CANVAS_W, CANVAS_H } from "./config";
import { BootScene, MenuScene, SelectScene, LobbyScene, ResultScene } from "./scenes";
import { GameScene } from "./game";

console.log("[ASSYLUM] main.ts loading, creating Phaser.Game...");

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "gameContainer",
  width:  CANVAS_W,
  height: CANVAS_H,
  backgroundColor: "#000000",
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, MenuScene, SelectScene, LobbyScene, GameScene, ResultScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// Dev-only handle for debugging and automated browser checks (stripped from production builds).
if (import.meta.env.DEV) (window as any).__assylum = game;
