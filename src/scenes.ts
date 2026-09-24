// ============================================================
//  ASSYLUM — scenes.ts — Phaser UI Scenes
// ============================================================
import Phaser from "phaser";
import {
  CANVAS_W, CANVAS_H, COLORS, SPRITE_DIMENSIONS,
  bgmVolume, setBgmVolume, bgmAudio,
  currentDifficulty, setDifficulty, getDiff,
  RUNNER_NAMES, HUNTER_NAME, BOSS_NAME,
} from "./config";
import { registerGeneratedTextures, loadPNGSprites } from "./sprites";
import { hideFogOverlay } from "./perf";
import {
  MP, hostRoom, joinRoom, mpSendReady, getUsedCharacters,
  allPlayersReady, broadcastPlayers, hostStartGame, cleanupMultiplayer,
} from "./multiplayer";
import { generateLevelData } from "./level";

// ── Shared helpers ───────────────────────────────────────────
function phaserBtn(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, cb: () => void, bgColor = 0x3c0000, textColor = "#c89696"
) {
  const btn = scene.add.rectangle(x, y, w, h, bgColor).setInteractive({ useHandCursor: true }).setScrollFactor(0);
  const txt = scene.add.text(x, y, label, { fontFamily: "monospace", fontSize: "14px", color: textColor }).setOrigin(0.5).setScrollFactor(0);
  const overBg =
    Math.min(255, ((bgColor >> 16) & 0xff) + 40) * 0x10000 +
    Math.min(255, ((bgColor >> 8) & 0xff) + 40) * 0x100 +
    Math.min(255, (bgColor & 0xff) + 40);
  btn.on("pointerover", () => { btn.setFillStyle(overBg); });
  btn.on("pointerout",  () => { btn.setFillStyle(bgColor); });
  btn.on("pointerdown", cb);
  return { btn, txt };
}

const DIFFICULTIES = [
  { id: "easy", label: "ЛЕГКО", clr: 0x3cb43c },
  { id: "normal", label: "НОРМА", clr: 0xc8a028 },
  { id: "hard", label: "СЛОЖНО", clr: 0xc82828 },
];

/** Row of three difficulty toggles centred on the canvas. */
function difficultyPicker(scene: Phaser.Scene, y: number, h: number, fontSize: string) {
  const btns: Phaser.GameObjects.Rectangle[] = [];
  DIFFICULTIES.forEach((d, i) => {
    const bx = CANVAS_W / 2 + (i - 1) * 130;
    const bg = scene.add.rectangle(bx, y, 110, h, d.id === currentDifficulty ? d.clr : 0x231414).setInteractive({ useHandCursor: true });
    scene.add.text(bx, y, d.label, { fontFamily: "monospace", fontSize, color: "#dcc8c8" }).setOrigin(0.5);
    bg.on("pointerdown", () => {
      setDifficulty(d.id);
      btns.forEach((b, j) => { b.setFillStyle(j === i ? DIFFICULTIES[j].clr : 0x231414); });
    });
    btns.push(bg);
  });
}

// ── BOOT SCENE ───────────────────────────────────────────────
export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }
  create() {
    console.log("[ASSYLUM] BootScene.create() START");
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x000000);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2, "ЗАГРУЗКА...", {
      fontFamily: "monospace", fontSize: "22px", color: "#a00000"
    }).setOrigin(0.5);
    registerGeneratedTextures(this);
    console.log("[ASSYLUM] Textures registered, loading PNGs...");
    loadPNGSprites(this, () => {
      console.log("[ASSYLUM] PNGs loaded, starting Menu");
      this.scene.start("Menu");
    });
  }
}

// ── MENU SCENE ───────────────────────────────────────────────
export class MenuScene extends Phaser.Scene {
  constructor() { super("Menu"); }
  create() {
    console.log("[ASSYLUM] MenuScene.create() START");
    hideFogOverlay();
    this.cameras.main.setBackgroundColor("#000000");
    const W = CANVAS_W, H = CANVAS_H, CX = W / 2;

    // Fullscreen centered art background
    if (this.textures.exists("menuArt")) {
      const art = this.add.image(CX, H / 2, "menuArt").setOrigin(0.5);
      const artDim = SPRITE_DIMENSIONS["menuArt"] || { width: 960, height: 600 };
      const scaleX = W / artDim.width, scaleY = H / artDim.height;
      art.setScale(Math.max(scaleX, scaleY));
    }
    // Dark overlay for readability
    this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.72);

    // Title
    const titleTxt = this.add.text(CX, 52, "A  S  Y  L  U  M", {
      fontFamily: "serif", fontSize: "62px", color: "#b40000"
    }).setOrigin(0.5).setAlpha(0);
    const subTxt = this.add.text(CX, 100, "психиатрическая больница №6", {
      fontFamily: "monospace", fontSize: "13px", color: "#967878"
    }).setOrigin(0.5).setAlpha(0);
    const quoteTxt = this.add.text(CX, 125, "Дверь в палату 13 никогда не закрывалась...", {
      fontFamily: "monospace", fontSize: "11px", color: "#645050", fontStyle: "italic"
    }).setOrigin(0.5).setAlpha(0);

    // Animate title
    this.tweens.add({ targets: titleTxt, alpha: 1, y: 52, duration: 800, ease: "Power2" });
    this.tweens.add({ targets: subTxt, alpha: 1, delay: 300, duration: 600, ease: "Power2" });
    this.tweens.add({ targets: quoteTxt, alpha: 1, delay: 500, duration: 600, ease: "Power2" });

    // Character preview row
    const runners = RUNNER_NAMES;
    const previewY = 185, spacing = 90;
    const rowStart = CX - (runners.length - 1) * spacing / 2;
    runners.forEach((name, i) => {
      const px = rowStart + i * spacing;
      const startX = px + (i < runners.length / 2 ? -60 : 60);
      if (this.textures.exists(name)) {
        const dim = SPRITE_DIMENSIONS[name] || { width: 16, height: 16 };
        const img = this.add.image(startX, previewY, name).setOrigin(0.5).setScale(34 / dim.height).setAlpha(0);
        this.tweens.add({ targets: img, x: px, alpha: 1, delay: 400 + i * 100, duration: 500, ease: "Back.easeOut" });
      }
      const nameTxt = this.add.text(px, previewY + 25, name, {
        fontFamily: "monospace", fontSize: "10px", color: COLORS[name] || "#ffffff"
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: nameTxt, alpha: 1, delay: 600 + i * 100, duration: 400 });
    });

    // VS label
    const vsLbl = this.add.text(CX, 240, "VS", {
      fontFamily: "monospace", fontSize: "18px", color: "#ff2222", fontStyle: "bold"
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: vsLbl, alpha: 1, delay: 900, duration: 400 });
    this.tweens.add({ targets: vsLbl, scaleX: 1.2, scaleY: 1.2, yoyo: true, repeat: -1, duration: 1200, ease: "Sine.easeInOut" });

    // Fox preview
    let foxImg: Phaser.GameObjects.Image | null = null;
    if (this.textures.exists("Foxmind")) {
      const foxDim = SPRITE_DIMENSIONS["Foxmind"] || { width: 16, height: 16 };
      foxImg = this.add.image(CX, 280, "Foxmind").setOrigin(0.5).setScale(42 / foxDim.height).setAlpha(0);
      this.tweens.add({ targets: foxImg, alpha: 1, delay: 1000, duration: 500 });
    }
    const foxLbl = this.add.text(CX, 308, "[ FOXMIND ]", {
      fontFamily: "monospace", fontSize: "14px", color: "#dc3232"
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: foxLbl, alpha: 1, delay: 1100, duration: 400 });

    // Button panel border
    const panelY = 415, panelH = 200, panelW = 280;
    const panelBorder = this.add.rectangle(CX, panelY, panelW, panelH, 0x000000, 0.0)
      .setStrokeStyle(1, 0x5a2020).setAlpha(0);
    this.tweens.add({ targets: panelBorder, alpha: 1, delay: 1200, duration: 400 });

    // Buttons
    const btnW = 240, btnH = 36, btnGap = 42;
    const btnStartY = panelY - panelH / 2 + 30;
    const buttons = [
      { label: "ИГРАТЬ ОДНОМУ", cb: () => { this.scene.start("Select"); } },
      { label: "МУЛЬТИПЛЕЕР",   cb: () => { this.scene.start("Lobby"); } },
      { label: "НАСТРОЙКИ",     cb: () => { /* TODO: settings scene */ } },
      { label: "ВЫХОД",         cb: () => { /* no-op in browser */ } },
    ];
    buttons.forEach((b, i) => {
      const by = btnStartY + i * btnGap;
      const bg = this.add.rectangle(CX, by, btnW, btnH, 0x3c0a0a).setInteractive({ useHandCursor: true }).setAlpha(0);
      const txt = this.add.text(CX, by, "[ " + b.label + " ]", {
        fontFamily: "monospace", fontSize: "15px", color: "#c89696"
      }).setOrigin(0.5).setAlpha(0);
      bg.on("pointerover", () => { bg.setFillStyle(0x641414); txt.setColor("#ffdddd"); });
      bg.on("pointerout",  () => { bg.setFillStyle(0x3c0a0a); txt.setColor("#c89696"); });
      bg.on("pointerdown", b.cb);
      const delay = 1300 + i * 120;
      this.tweens.add({ targets: bg, alpha: 1, delay, duration: 350, ease: "Power2" });
      this.tweens.add({ targets: txt, alpha: 1, delay: delay + 50, duration: 350, ease: "Power2" });
    });

    // Keyboard shortcuts
    this.input.keyboard!.on("keydown-ENTER", () => { this.scene.start("Select"); });
    this.input.keyboard!.on("keydown-SPACE", () => { this.scene.start("Select"); });

    // Volume slider at bottom center
    const sliderW = 140, sliderY = H - 22;
    const sliderX = CX - sliderW / 2;
    this.add.text(sliderX - 16, sliderY, "♫", {
      fontFamily: "monospace", fontSize: "13px", color: "#6e5555"
    }).setOrigin(0.5);
    this.add.rectangle(sliderX + sliderW / 2, sliderY, sliderW, 4, 0x3c1e1e);
    let localVol = bgmVolume;
    const sliderFill = this.add.rectangle(sliderX + sliderW * localVol / 2, sliderY, sliderW * localVol, 4, 0x960000);
    const knob = this.add.circle(sliderX + sliderW * localVol, sliderY, 7, 0xc83c3c)
      .setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(knob);
    knob.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number) => {
      const x = Phaser.Math.Clamp(dragX, sliderX, sliderX + sliderW);
      const ratio = (x - sliderX) / sliderW;
      setBgmVolume(ratio);
      localVol = ratio;
      knob.x = x;
      knob.y = sliderY;
      sliderFill.x = sliderX + sliderW * ratio / 2;
      sliderFill.width = sliderW * ratio;
      if (bgmAudio) bgmAudio.volume = ratio;
    });
  }
}

// ── SELECT SCENE ─────────────────────────────────────────────
export class SelectScene extends Phaser.Scene {
  constructor() { super("Select"); }
  create() {
    hideFogOverlay();
    this.cameras.main.setBackgroundColor("#000000");
    const W = CANVAS_W, H = CANVAS_H;
    this.add.text(W / 2, 60, "ВЫБЕРИ ПЕРСОНАЖА", { fontFamily: "monospace", fontSize: "28px", color: "#b40000" }).setOrigin(0.5);
    this.add.text(W / 2, 100, "Собери ключи, помоги всем сбежать и выйди!", { fontFamily: "monospace", fontSize: "13px", color: "#785a5a" }).setOrigin(0.5);

    difficultyPicker(this, 138, 30, "13px");

    // Characters (including Fox as villain)
    const runners = [
      { name: "Naumi", desc: "Быстрая. Осторожная." },
      { name: "Kuruna", desc: "Тихая. Невидимая в тени." },
      { name: "Wite", desc: "Слабая, но везучая." },
      { name: "Sumrak", desc: "Знает все тёмные углы." },
      { name: "Yoko", desc: "Дерзкая. Не сдаётся." },
      { name: "Foxmind", desc: "ЗЛОДЕЙ. Лови бегущих!" },
    ];
    const cardW = 115, cardH = 200;
    const totalW = runners.length * cardW + (runners.length - 1) * 14;
    const sx = (W - totalW) / 2 + cardW / 2;

    runners.forEach((r, i) => {
      const cx = sx + i * (cardW + 14), cy = 300;
      const isVillain = r.name === "Foxmind";
      const cardColor = isVillain ? 0x1a0a0a : 0x190f0f;
      const card = this.add.rectangle(cx, cy, cardW, cardH, cardColor).setInteractive({ useHandCursor: true });
      card.setStrokeStyle(isVillain ? 2 : 0, isVillain ? 0x882222 : 0x000000);
      if (this.textures.exists(r.name)) {
        const dim = SPRITE_DIMENSIONS[r.name] || { width: 16, height: 16 };
        this.add.image(cx, cy - 60, r.name).setOrigin(0.5).setScale(64 / dim.height);
      }
      this.add.text(cx, cy + 10, r.name, { fontFamily: "monospace", fontSize: "16px", color: COLORS[r.name] || "#ffffff" }).setOrigin(0.5);
      this.add.text(cx, cy + 40, r.desc, { fontFamily: "monospace", fontSize: "10px", color: "#826464", wordWrap: { width: 105 } }).setOrigin(0.5);

      const sb = this.add.rectangle(cx, cy + 82, 100, 36, isVillain ? 0x461e1e : 0x460000).setInteractive({ useHandCursor: true });
      const st = this.add.text(cx, cy + 82, isVillain ? "ИГРАТЬ ЗА" : "ВЫБРАТЬ", { fontFamily: "monospace", fontSize: "12px", color: "#c89696" }).setOrigin(0.5);
      sb.on("pointerover", () => { sb.setFillStyle(isVillain ? 0x6e2828 : 0x780000); st.setColor("#ffc8c8"); });
      sb.on("pointerout",  () => { sb.setFillStyle(isVillain ? 0x461e1e : 0x460000); st.setColor("#c89696"); });
      sb.on("pointerdown", () => { this.scene.start("Game", { playerName: r.name, difficulty: currentDifficulty }); });
      card.on("pointerover", () => { card.setFillStyle(0x281414); });
      card.on("pointerout",  () => { card.setFillStyle(cardColor); });
    });

    this.add.text(20, H - 20, "← НАЗАД (ESC)", { fontFamily: "monospace", fontSize: "11px", color: "#503232" }).setOrigin(0, 1);
    this.input.keyboard!.on("keydown-ESC", () => { this.scene.start("Menu"); });
  }
}

// ── LOBBY SCENE ──────────────────────────────────────────────
export class LobbyScene extends Phaser.Scene {
  constructor() { super("Lobby"); }
  create() {
    hideFogOverlay();
    this.cameras.main.setBackgroundColor("#000000");
    const W = CANVAS_W, H = CANVAS_H;
    this.add.text(W / 2, 40, "МУЛЬТИПЛЕЕР", { fontFamily: "monospace", fontSize: "32px", color: "#64c864" }).setOrigin(0.5);

    let mode = "choose";
    let selectedChar = "Naumi";
    let inputCode = "";
    let isReady = false;

    // ── Difficulty picker ─────────────────────────────────
    this.add.text(W / 2, 68, "Сложность:", { fontFamily: "monospace", fontSize: "12px", color: "#786464" }).setOrigin(0.5);
    difficultyPicker(this, 92, 28, "12px");

    const statusTxt = this.add.text(W / 2, 270, "", { fontFamily: "monospace", fontSize: "16px", color: "#b4a0a0" }).setOrigin(0.5);
    const roomCodeTxt = this.add.text(W / 2, 320, "", { fontFamily: "monospace", fontSize: "14px", color: "#ffc864", wordWrap: { width: W * 0.85 } }).setOrigin(0.5);
    const playerListTxt = this.add.text(W / 2, 400, "", { fontFamily: "monospace", fontSize: "14px", color: "#96c896" }).setOrigin(0.5);
    const inputTxt = this.add.text(W / 2, 330, "_", { fontFamily: "monospace", fontSize: "28px", color: "#ffffc8" }).setOrigin(0.5).setVisible(false);

    // Character picker
    const charNames = [...RUNNER_NAMES, HUNTER_NAME];
    const charY = 460;
    const charBtns: (Phaser.GameObjects.Rectangle & { _charName?: string })[] = [];
    this.add.text(W / 2, charY - 20, "Персонаж:", { fontFamily: "monospace", fontSize: "12px", color: "#786464" }).setOrigin(0.5);
    charNames.forEach((name, i) => {
      const bx = W / 2 + (i - 2.5) * 80;
      const isVillain = name === HUNTER_NAME;
      const btn = this.add.rectangle(bx, charY, 65, 30, name === selectedChar ? 0x3c1414 : 0x1e0f0f).setInteractive({ useHandCursor: true }) as Phaser.GameObjects.Rectangle & { _charName?: string };
      if (isVillain) btn.setStrokeStyle(1, 0x882222);
      this.add.text(bx, charY, name, { fontFamily: "monospace", fontSize: "9px", color: COLORS[name] || "#ffffff" }).setOrigin(0.5);
      btn._charName = name;
      btn.on("pointerdown", () => {
        selectedChar = name;
        if (mode === "inlobby" && !MP.isHost && MP.hostConn) {
          MP.hostConn.send({ type: "changeChar", character: name });
        }
        if (mode === "inlobby" && MP.isHost && MP.localPeerId) {
          MP.players[MP.localPeerId].character = name;
          MP.players[MP.localPeerId].name = name;
          broadcastPlayers();
        }
        updateCharBtns();
      });
      charBtns.push(btn);
    });

    const updateCharBtns = () => {
      const used = mode === "inlobby" ? getUsedCharacters() : new Set<string>();
      charBtns.forEach((btn) => {
        const n = btn._charName!;
        const isMine = n === selectedChar;
        const taken = used.has(n) && !isMine;
        btn.setFillStyle(isMine ? 0x3c1414 : taken ? 0x0f0f0f : 0x1e0f0f);
        btn.setAlpha(taken ? 0.4 : 1);
      });
    };

    // Create room button
    const createBtn = this.add.rectangle(W / 2, 140, 200, 44, 0x3c0000).setInteractive({ useHandCursor: true });
    const createTxt = this.add.text(W / 2, 140, "СОЗДАТЬ КОМНАТУ", { fontFamily: "monospace", fontSize: "14px", color: "#c89696" }).setOrigin(0.5);
    createBtn.on("pointerover", () => { createBtn.setFillStyle(0x640000); });
    createBtn.on("pointerout",  () => { createBtn.setFillStyle(0x3c0000); });

    // Join button
    const joinBtn = this.add.rectangle(W / 2, 200, 200, 44, 0x3c0000).setInteractive({ useHandCursor: true });
    const joinTxt = this.add.text(W / 2, 200, "ПРИСОЕДИНИТЬСЯ", { fontFamily: "monospace", fontSize: "14px", color: "#c89696" }).setOrigin(0.5);
    joinBtn.on("pointerover", () => { joinBtn.setFillStyle(0x640000); });
    joinBtn.on("pointerout",  () => { joinBtn.setFillStyle(0x3c0000); });

    // Start button (host)
    const startBtn = this.add.rectangle(W / 2, 540, 220, 44, 0x1e501e).setInteractive({ useHandCursor: true }).setVisible(false);
    const startBtnTxt = this.add.text(W / 2, 540, "▶ НАЧАТЬ ИГРУ", { fontFamily: "monospace", fontSize: "16px", color: "#64ff64" }).setOrigin(0.5).setVisible(false);
    startBtn.on("pointerover", () => { if (allPlayersReady()) startBtn.setFillStyle(0x328232); });
    startBtn.on("pointerout",  () => { startBtn.setFillStyle(allPlayersReady() ? 0x1e501e : 0x191919); });

    // Ready button (client)
    const readyBtn = this.add.rectangle(W / 2, 530, 180, 40, 0x3c1e1e).setInteractive({ useHandCursor: true }).setVisible(false);
    const readyBtnTxt = this.add.text(W / 2, 530, "ГОТОВ", { fontFamily: "monospace", fontSize: "16px", color: "#c89696" }).setOrigin(0.5).setVisible(false);

    const setupPlayersList = () => {
      MP.onPlayersUpdate = (players) => {
        const entries = Object.values(players);
        const names = entries.map((p) => (p.character || "???") + (p.ready ? " ✓" : " ✗"));
        playerListTxt.setText("Игроки (" + entries.length + "): " + names.join(", "));
        updateCharBtns();
        if (MP.isHost) {
          const allReady = allPlayersReady();
          startBtn.setFillStyle(allReady ? 0x1e501e : 0x191919);
          startBtnTxt.setColor(allReady ? "#64ff64" : "#464646");
        }
      };
    };

    createBtn.on("pointerdown", async () => {
      if (mode !== "choose") return;
      mode = "hosting";
      createBtn.setVisible(false); createTxt.setVisible(false);
      joinBtn.setVisible(false); joinTxt.setVisible(false);
      statusTxt.setText("Создание комнаты...");
      try {
        const code = await hostRoom(selectedChar);
        mode = "inlobby"; isReady = true;
        statusTxt.setText("Комната создана! Ожидание игроков...");
        const link = location.origin + location.pathname + "?room=" + code;
        roomCodeTxt.setText("КОД: " + code + "\n\nСсылка для друзей:\n" + link);
        phaserBtn(this, W / 2, 360, 160, 30, "📋 КОПИРОВАТЬ КОД", () => {
          navigator.clipboard.writeText(code).then(() => {
            statusTxt.setText("Код скопирован!");
            this.time.delayedCall(1500, () => { statusTxt.setText("Комната создана! Ожидание игроков..."); });
          }).catch(() => {});
        }, 0x1e3c1e, "#96c896");
        startBtn.setVisible(true); startBtnTxt.setVisible(true);
        updateCharBtns();
        setupPlayersList();
      } catch (e: any) {
        statusTxt.setText("Ошибка: " + e.message);
        mode = "choose";
        createBtn.setVisible(true); createTxt.setVisible(true);
        joinBtn.setVisible(true); joinTxt.setVisible(true);
      }
    });

    joinBtn.on("pointerdown", () => {
      if (mode !== "choose") return;
      mode = "joining";
      createBtn.setVisible(false); createTxt.setVisible(false);
      joinBtn.setVisible(false); joinTxt.setVisible(false);
      statusTxt.setText("Введите 5-символьный код:");
      inputTxt.setVisible(true);
    });

    startBtn.on("pointerdown", () => {
      if (mode === "inlobby" && MP.isHost && allPlayersReady()) {
        const hostLevel = generateLevelData(getDiff().keyCount);
        hostStartGame(currentDifficulty, hostLevel);
        MP.levelData = hostLevel;
        this.scene.start("Game", { playerName: selectedChar, difficulty: currentDifficulty });
      }
    });

    readyBtn.on("pointerdown", () => {
      isReady = !isReady;
      mpSendReady(isReady);
      readyBtn.setFillStyle(isReady ? 0x1e501e : 0x3c1e1e);
      readyBtnTxt.setText(isReady ? "✓ ГОТОВ" : "ГОТОВ");
      readyBtnTxt.setColor(isReady ? "#64ff64" : "#c89696");
    });

    const doJoin = async () => {
      statusTxt.setText("Подключение...");
      inputTxt.setVisible(false);
      try {
        await joinRoom(inputCode, selectedChar);
        mode = "inlobby";
        statusTxt.setText("Подключено! Ожидание хоста...");
        roomCodeTxt.setText("Комната: " + inputCode);
        readyBtn.setVisible(true); readyBtnTxt.setVisible(true);
        updateCharBtns();
        setupPlayersList();
        MP.onCharAssigned = (ch) => { selectedChar = ch; updateCharBtns(); };
        MP.onHostLost = () => {
          statusTxt.setText("Хост закрыл комнату");
          readyBtn.setVisible(false); readyBtnTxt.setVisible(false);
          cleanupMultiplayer();
        };
        MP.onGameStart = (data: any) => {
          this.scene.start("Game", { playerName: selectedChar, difficulty: data.difficulty || "normal" });
        };
      } catch (e: any) {
        statusTxt.setText("Ошибка: " + e.message);
        inputTxt.setVisible(true);
      }
    };

    // Text input for join code
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      if (mode !== "joining") return;
      if (event.key === "Backspace") {
        inputCode = inputCode.slice(0, -1);
        inputTxt.setText((inputCode || "") + "_");
      } else if (event.key === "Enter" && inputCode.length === 5) {
        doJoin();
      } else if (event.key.length === 1 && inputCode.length < 5) {
        inputCode += event.key.toUpperCase();
        inputTxt.setText(inputCode + "_");
      }
    });

    // Auto-join from URL
    const urlParams = new URLSearchParams(location.search);
    const autoRoom = urlParams.get("room");
    if (autoRoom) {
      // One-shot: drop ?room= so returning to the lobby later doesn't rejoin a finished room.
      history.replaceState(null, "", location.pathname);
      mode = "joining";
      inputCode = autoRoom.toUpperCase();
      createBtn.setVisible(false); createTxt.setVisible(false);
      joinBtn.setVisible(false); joinTxt.setVisible(false);
      statusTxt.setText("Подключение к " + inputCode + "...");
      doJoin();
    }

    this.add.text(20, H - 20, "← НАЗАД (ESC)", { fontFamily: "monospace", fontSize: "11px", color: "#503232" }).setOrigin(0, 1);
    this.input.keyboard!.on("keydown-ESC", () => { cleanupMultiplayer(); this.scene.start("Menu"); });
  }
}

// ── RESULT SCENE (end of every round, runner or hunter) ──────
type Outcome = "escaped" | "caught" | "hunt-won" | "hunt-lost";

const OUTCOME_VIEW: Record<Outcome, { title: string; color: string; good: boolean }> = {
  "escaped":   { title: "ВЫ СБЕЖАЛИ!",   color: "#32dc32", good: true },
  "caught":    { title: "ВАС ПОЙМАЛИ",   color: "#b40000", good: false },
  "hunt-won":  { title: "ОХОТА УДАЛАСЬ", color: "#dc3232", good: true },
  "hunt-lost": { title: "ДОБЫЧА УШЛА",   color: "#8c7878", good: false },
};

export class ResultScene extends Phaser.Scene {
  _data: any;
  constructor() { super("Result"); }
  init(data: any) { this._data = data; }
  create() {
    hideFogOverlay();
    this.cameras.main.setBackgroundColor("#000000");
    const W = CANVAS_W, d = this._data;
    const outcome: Outcome = d.outcome in OUTCOME_VIEW ? d.outcome : "caught";
    const view = OUTCOME_VIEW[outcome];
    const isHunter = outcome === "hunt-won" || outcome === "hunt-lost";

    this.add.text(W / 2, 130, view.title, { fontFamily: "monospace", fontSize: "54px", color: view.color }).setOrigin(0.5);
    if (this.textures.exists(d.playerName)) {
      const dim = SPRITE_DIMENSIONS[d.playerName] || { width: 16, height: 16 };
      const portrait = this.add.image(W / 2, 222, d.playerName).setOrigin(0.5).setScale(72 / dim.height);
      if (!view.good) portrait.setTint(0x505050);
    }
    this.add.text(W / 2, 272, d.playerName || "", { fontFamily: "monospace", fontSize: "20px", color: COLORS[d.playerName] || "#ffffff" }).setOrigin(0.5);

    const mins = Math.floor((d.elapsed || 0) / 60), secs = (d.elapsed || 0) % 60;
    const lines: string[] = [];
    if (outcome === "caught") lines.push("Поймал: " + (d.catcherName || "???"));
    if (!isHunter) lines.push("Ключи: " + (d.keysCollected || 0) + "/" + (d.keysTotal || 0));
    lines.push(isHunter
      ? "Поймано: " + (d.caught || 0) + "/" + (d.total || 0) + "  ·  Сбежали: " + (d.escaped || 0)
      : "Спасены: " + (d.escaped || 0) + "/" + (d.total || 0));
    lines.push("Время: " + mins + "м " + secs + "с");
    if (outcome === "escaped" && d.bossSpawned) lines.push("✓ " + BOSS_NAME + " проснулась — и не догнала");
    this.add.text(W / 2, 345, lines.join("\n"), {
      fontFamily: "monospace", fontSize: "16px", align: "center",
      color: outcome === "caught" && d.catcherName === BOSS_NAME ? "#50c850" : view.good ? "#96c896" : "#b49696",
    }).setOrigin(0.5);

    // After a multiplayer round the session is closed; "again" means a fresh lobby.
    const again = d.multiplayer
      ? { label: "В ЛОББИ", cb: () => this.scene.start("Lobby") }
      : { label: "СНОВА", cb: () => this.scene.start("Game", { playerName: d.playerName }) };
    phaserBtn(this, W / 2 - 110, 450, 200, 44, again.label, again.cb, view.good ? 0x003c00 : 0x3c0000, view.good ? "#96c896" : "#c89696");
    phaserBtn(this, W / 2 + 110, 450, 200, 44, "В МЕНЮ", () => { this.scene.start("Menu"); });
    phaserBtn(this, W / 2, 520, 200, 44, "СМЕНА ПЕРСОНАЖА", () => { this.scene.start("Select"); });
    this.input.keyboard!.on("keydown-ESC", () => { this.scene.start("Menu"); });
  }
}
