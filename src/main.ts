// ============================================================
//  ASSYLUM — entry point
// ============================================================
import Phaser from "phaser";
import { audio } from "./core/audio";
import { CANVAS_W, CANVAS_H } from "./core/constants";
import { RES } from "./render/display";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { SelectScene } from "./scenes/SelectScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { GameScene } from "./scenes/GameScene";
import { HudScene } from "./scenes/HudScene";
import { ResultScene } from "./scenes/ResultScene";

const game = new Phaser.Game({
  // WebGL is required: lighting is a shader.
  type: Phaser.WEBGL,
  parent: "gameContainer",
  width: CANVAS_W * RES,
  height: CANVAS_H * RES,
  backgroundColor: "#000000",
  // Sound has its own engine (core/audio.ts).
  audio: { noAudio: true },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  // Order = draw order: the HUD renders above the game.
  scene: [BootScene, MenuScene, SelectScene, LobbyScene, SettingsScene, GameScene, HudScene, ResultScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// Dev-only handle for debugging and automated browser checks (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __assylum: game, __audio: audio });
