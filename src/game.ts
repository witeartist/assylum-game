// ============================================================
//  ASSYLUM — game.ts — GameScene (Phaser)
// ============================================================
import Phaser from "phaser";
import {
  TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, CANVAS_W, CANVAS_H,
  COLORS, ROOM_LABELS, SPRITE_DIMENSIONS,
  currentDifficulty, setDifficulty, getDiff, RUNNER_SPD, SPRINT_MULT, SNEAK_MULT,
  bgmVolume, bgmAudio, setBgmAudio,
  tileKey, tileCenter, worldToTile, tileDist, randInt, spriteScaleForHeight,
  type Tile,
} from "./config";
import { generateLevelData, type LevelData, type Room, type BedSpot } from "./level";
import {
  computeVisibility, findPath, hasLineOfSight,
  moveAlongPath, choosePatrolTile, chooseEscapeTile,
  chooseSearchTile, chooseObjectiveTile,
} from "./ai";
import {
  initWorker, workerUpdateRow, workerVisibility,
  createFogOverlay, hideFogOverlay, showFogOverlay, renderFogGPU,
  getFogCanvas, setFogImage,
  destroyWorker, updateFPS,
  type FlashlightState, type FoxFlashState,
} from "./perf";
import {
  MP, isMultiplayer, cleanupMultiplayer,
  mpSendPosition, mpSendFoxPos, mpSendBossPos,
  mpSendKeyCollected, mpSendDoorOpened, mpSendCaught,
  mpSendBossSpawned, mpSendEscaped, mpSendNpcCaught,
  mpSendNpcPositions, mpSendHidingState, mpSendHostCatch,
  getHostPlayerStates,
} from "./multiplayer";

function roomCenter(r: Room): Tile {
  return { col: Math.floor(r.x + r.w / 2), row: Math.floor(r.y + r.h / 2) };
}

export class GameScene extends Phaser.Scene {
  _playerName!: string;
  _isFoxPlayer!: boolean;
  _state!: any;
  _level!: LevelData;
  _diff!: any;
  _roomTileType!: Map<string, string>;
  _wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  _player!: Phaser.Physics.Arcade.Sprite;
  _playerTag!: Phaser.GameObjects.Text;
  _npcs!: any[];
  _fox!: any;
  _keyObjects!: any[];
  _exitObj!: any;
  _bossObj!: any;
  _lockerObjects!: any[];
  _bedObjects!: any[];
  _lockedDoorObjects!: any[];
  _terminalObjects!: any[];
  _minigame!: any;
  _hud!: any;
  _keys!: any;
  _cursors!: any;
  _allRunnerNames!: string[];
  _remotePlayers!: Map<string, any>;
  _playerVisible!: Set<string>;
  _lastVisTileKey!: string;
  _pendingVisibility!: boolean;
  _physKeys!: Record<string, boolean>;
  _facingAngle!: number;
  _footsteps!: any[];
  _fogTex!: any;
  _fogImg!: any;
  _flashlight!: FlashlightState;
  _foxFlash!: FoxFlashState;
  _foxFlashTimer!: number;

  constructor() { super("Game"); }

  init(data: any) {
    this._playerName = data.playerName || "Naumi";
    if (data.difficulty) setDifficulty(data.difficulty);
  }

  create() {
    try {
      this._createInner();
    } catch (err) {
      console.error("[ASSYLUM] GameScene.create() CRASHED:", err);
    }
  }

  _createInner() {
    console.log("[ASSYLUM] GameScene.create() START, player:", this._playerName);
    const diff = getDiff();
    const playerName = this._playerName;
    const isFoxPlayer = (playerName === "Foxmind");

    // In multiplayer use the shared level data (host set it in lobby, clients receive it)
    const level = (isMultiplayer() && MP.levelData)
      ? MP.levelData
      : generateLevelData(diff.keyCount);

    // ── Background music ──────────────────────────────────
    if (!bgmAudio) {
      const a = new Audio("sound/Asylum%20Echoes.mp3");
      a.loop = true;
      setBgmAudio(a);
    }
    bgmAudio!.volume = bgmVolume;
    bgmAudio!.play().catch(() => {});

    // ── State ─────────────────────────────────────────────
    const state: any = {
      keysCollected: 0,
      keysTotal: diff.keyCount,
      bossSpawned: false,
      bossTimer: 0,
      flickerTimer: 0,
      flickerIntensity: 0.18,
      gameOver: false,
      won: false,
      catcherName: "Foxmind",
      survivingNPCs: [] as any[],
      escapedNPCs: 0,
      playerHiding: false,
      startTime: 0,
      spectating: false,
      spectateIdx: 0,
    };
    this._state = state;
    this._level = level;
    this._diff = diff;
    this._playerName = playerName;
    this._isFoxPlayer = isFoxPlayer;

    // ── Room tile lookup ──────────────────────────────────
    const roomTileType = new Map<string, string>();
    level.rooms.forEach((room) => {
      for (let r = room.y; r < room.y + room.h; r++)
        for (let c = room.x; c < room.x + room.w; c++)
          roomTileType.set(tileKey(c, r), room.type);
    });
    this._roomTileType = roomTileType;

    // ── World bounds ──────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.OVERLAP_BIAS = 16;

    // ── Floor tiles ───────────────────────────────────────
    for (let row = 0; row < MAP_H; row++) {
      for (let col = 0; col < MAP_W; col++) {
        const ch = level.rows[row][col];
        if (ch === "B") {
          this.add.image(col * TILE, row * TILE, "bloodfloor").setOrigin(0).setDepth(-2);
        } else if (ch !== "#") {
          const rType = roomTileType.get(tileKey(col, row));
          const floorSpr = rType ? ("floor-" + rType) : "floor";
          this.add.image(col * TILE, row * TILE, floorSpr).setOrigin(0).setDepth(-2);
        }
      }
    }

    // ── Walls ─────────────────────────────────────────────
    const wallGroup = this.physics.add.staticGroup();
    function nextToFloor(r: number, c: number): boolean {
      return [[-1,0],[1,0],[0,-1],[0,1]].some((d) => {
        const nr = r+d[0], nc = c+d[1];
        return nr>=0 && nr<MAP_H && nc>=0 && nc<MAP_W && level.rows[nr][nc] !== "#";
      });
    }
    for (let row = 0; row < MAP_H; row++) {
      for (let col = 0; col < MAP_W; col++) {
        if (level.rows[row][col] === "#") {
          const wallSpr = (row + col) % 3 === 0 ? "wall2" : "wall";
          if (nextToFloor(row, col)) {
            const w = wallGroup.create(col * TILE + TILE/2, row * TILE + TILE/2, wallSpr).setDepth(-1);
            (w.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE, TILE);
          } else {
            this.add.image(col * TILE, row * TILE, wallSpr).setOrigin(0).setDepth(-1);
          }
        }
      }
    }
    this._wallGroup = wallGroup;

    // ── Door floor markers ────────────────────────────────
    if (level.doors) {
      level.doors.forEach((d) => {
        this.add.image(d.col * TILE, d.row * TILE, "doorfloor").setOrigin(0).setDepth(-1.5);
      });
    }

    // ── Decorations ───────────────────────────────────────
    level.decorations.forEach((dec) => {
      const tc = tileCenter(dec.tile.col, dec.tile.row);
      this.add.image(tc.x, tc.y, dec.sprite).setDepth(0).setScale(dec.type === "canteen" ? 1.5 : 1.35);
    });

    // ── Hiding spots ──────────────────────────────────────
    const lockerObjects = (level.hidingSpots || []).map((t) => {
      const tc = tileCenter(t.col, t.row);
      const loc = this.physics.add.image(tc.x, tc.y, "locker").setDepth(0).setScale(1.6) as any;
      loc.body.setSize(14, 14);
      loc._col = t.col;
      loc._row = t.row;
      return loc;
    });
    this._lockerObjects = lockerObjects;

    // ── Bed hiding spots (wards) ──────────────────────────
    const bedObjects = (level.bedSpots || []).map((bs: BedSpot) => {
      const cx = (bs.tile.col + bs.tile2.col) / 2 * TILE + TILE / 2;
      const cy = (bs.tile.row + bs.tile2.row) / 2 * TILE + TILE / 2;
      const bed = this.physics.add.image(cx, cy, bs.sprite).setDepth(0) as any;
      // Scale bed to cover 2 tiles
      if (bs.orientation === "vertical") {
        const desiredH = TILE * 2;
        const dim = SPRITE_DIMENSIONS[bs.sprite] || { width: 32, height: 64 };
        bed.setScale(desiredH / dim.height);
      } else {
        const desiredW = TILE * 2;
        const dim = SPRITE_DIMENSIONS[bs.sprite] || { width: 64, height: 32 };
        bed.setScale(desiredW / dim.width);
      }
      bed.body.setSize(14, 14);
      bed._col = bs.tile.col;
      bed._row = bs.tile.row;
      bed._isBed = true;
      return bed;
    });
    this._bedObjects = bedObjects;

    // ── Locked doors & terminals ──────────────────────────
    const lockedDoorObjects: any[] = [];
    const terminalObjects: any[] = [];

    if (level.lockedDoors) {
      level.lockedDoors.forEach((ld, idx) => {
        const barriers = ld.doorTiles.map((d) => {
          const b: any = wallGroup.create(d.col * TILE + TILE/2, d.row * TILE + TILE/2, "wall").setDepth(-1);
          (b.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE, TILE);
          b._doorIdx = idx;
          return b;
        });
        lockedDoorObjects.push({ barriers, data: ld });
        ld.doorTiles.forEach((d) => {
          const chars = level.rows[d.row].split('');
          chars[d.col] = '#';
          level.rows[d.row] = chars.join('');
        });
        const ttc = tileCenter(ld.terminalTile.col, ld.terminalTile.row);
        const term: any = this.physics.add.image(ttc.x, ttc.y, "terminal").setDepth(1).setScale(1.8);
        term.body.setSize(14, 14);
        term._doorIdx = idx;
        term._solved = false;
        terminalObjects.push(term);
        this.add.text(ttc.x, ttc.y - 14, "ТЕРМИНАЛ", {
          fontFamily: "monospace", fontSize: "7px", color: "#00c864"
        }).setOrigin(0.5).setDepth(10);
      });
    }
    this._lockedDoorObjects = lockedDoorObjects;
    this._terminalObjects = terminalObjects;

    // ── Minigame state ────────────────────────────────────
    const minigame: any = {
      active: false, termIdx: -1,
      code: [] as number[], input: [] as number[], elements: [] as Phaser.GameObjects.GameObject[],
      inputDisplay: null as Phaser.GameObjects.Text | null,
    };
    this._minigame = minigame;

    // ── Runner names ──────────────────────────────────────
    const allRunnerNames = ["Naumi", "Kuruna", "Wite", "Sumrak", "Yoko"];
    const npcNames = allRunnerNames.filter((n) => n !== playerName);
    this._allRunnerNames = allRunnerNames;

    // ── PLAYER ────────────────────────────────────────────
    const spawnTile = isFoxPlayer ? level.foxSpawn : level.playerSpawn;
    const spawnPos = tileCenter(spawnTile.col, spawnTile.row);
    const player = this.physics.add.sprite(spawnPos.x, spawnPos.y, playerName).setDepth(5);
    const playerScale = spriteScaleForHeight(playerName, isFoxPlayer ? 36 : 30);
    player.setScale(playerScale);
    // Phaser 3.80 Body.preUpdate multiplies sourceWidth by scaleX → compensate
    player.body!.setSize(22 / playerScale, 22 / playerScale);
    player.setCollideWorldBounds(true);
    (player as any)._name = playerName;
    (player as any)._alive = true;
    (player as any)._speed = isFoxPlayer ? diff.foxSpd : RUNNER_SPD;
    this._player = player;

    const playerTag = this.add.text(player.x, player.y - 14, playerName, {
      fontFamily: "monospace", fontSize: "9px", color: COLORS[playerName] || "#ffffff"
    }).setOrigin(0.5).setDepth(10);
    this._playerTag = playerTag;

    this.physics.add.collider(player, wallGroup);

    // ── NPC RUNNERS ───────────────────────────────────────
    let npcs: any[] = [];
    if (isMultiplayer() && !isFoxPlayer) {
      // MP: no NPC runners
    } else if (!isFoxPlayer) {
      npcs = npcNames.map((name, i) => {
        const sp = level.npcSpawns[i % level.npcSpawns.length];
        const tc = tileCenter(sp.col, sp.row);
        const npc = this.physics.add.sprite(tc.x, tc.y, name).setDepth(5) as any;
        const npcScale = spriteScaleForHeight(name, 30);
        npc.setScale(npcScale);
        npc.body.setSize(22 / npcScale, 22 / npcScale);
        npc.setCollideWorldBounds(true);
        npc._name = name;
        npc._alive = true;
        npc._speed = RUNNER_SPD * (0.85 + Math.random() * 0.3);
        npc.path = [];
        npc.pathTimer = Math.random() * 0.4;
        npc._brainState = "patrol";
        npc._goalTile = sp;
        this.physics.add.collider(npc, wallGroup);
        npc._tag = this.add.text(tc.x, tc.y - 14, name, {
          fontFamily: "monospace", fontSize: "9px", color: COLORS[name] || "#ffffff"
        }).setOrigin(0.5).setDepth(10);
        return npc;
      });
    } else if (isFoxPlayer && !isMultiplayer()) {
      npcs = allRunnerNames.map((name, i) => {
        const sp = level.npcSpawns[i % level.npcSpawns.length];
        const tc = tileCenter(sp.col, sp.row);
        const npc = this.physics.add.sprite(tc.x, tc.y, name).setDepth(5) as any;
        const npcScale2 = spriteScaleForHeight(name, 30);
        npc.setScale(npcScale2);
        npc.body.setSize(22 / npcScale2, 22 / npcScale2);
        npc.setCollideWorldBounds(true);
        npc._name = name;
        npc._alive = true;
        npc._speed = RUNNER_SPD * (0.85 + Math.random() * 0.3);
        npc.path = [];
        npc.pathTimer = Math.random() * 0.4;
        npc._brainState = "patrol";
        npc._goalTile = sp;
        this.physics.add.collider(npc, wallGroup);
        npc._tag = this.add.text(tc.x, tc.y - 14, name, {
          fontFamily: "monospace", fontSize: "9px", color: COLORS[name] || "#ffffff"
        }).setOrigin(0.5).setDepth(10);
        return npc;
      });
    }
    this._npcs = npcs;
    state.survivingNPCs = npcs.slice();

    // ── FOXMIND (AI) ──────────────────────────────────────
    let fox: any = null;
    if (!isFoxPlayer) {
      const foxPos = tileCenter(level.foxSpawn.col, level.foxSpawn.row);
      fox = this.physics.add.sprite(foxPos.x, foxPos.y, "Foxmind").setDepth(5);
      const foxScale = spriteScaleForHeight("Foxmind", 36);
      fox.setScale(foxScale);
      fox.body.setSize(14 / foxScale, 14 / foxScale);
      fox.setCollideWorldBounds(true);
      fox._speed = diff.foxSpd;
      fox.path = [];
      fox.pathTimer = 0;
      fox._patrolTile = level.foxSpawn;
      fox._brainState = "patrol";
      fox._memoryTile = level.foxSpawn;
      fox._memoryTime = 0;
      fox._searchHideTimer = 30;
      this.physics.add.collider(fox, wallGroup);
      fox._tag = this.add.text(foxPos.x, foxPos.y - 14, "FOXMIND", {
        fontFamily: "monospace", fontSize: "9px", color: "#dc3232"
      }).setOrigin(0.5).setDepth(10);
    }
    this._fox = fox;

    // ── KEYS ──────────────────────────────────────────────
    const keyObjects = level.keyTiles.map((t) => {
      const tc = tileCenter(t.col, t.row);
      const k: any = this.physics.add.image(tc.x, tc.y, "key").setDepth(1).setScale(1.4);
      k.body.setSize(14, 14);
      k._bobT = Math.random() * 6.28;
      k._baseY = tc.y;
      return k;
    });
    this._keyObjects = keyObjects;

    // ── EXIT ──────────────────────────────────────────────
    const exitTc = tileCenter(level.exitTile.col, level.exitTile.row);
    const exitObj: any = this.physics.add.image(exitTc.x, exitTc.y, "exitlocked").setDepth(1).setScale(2);
    exitObj.body.setSize(18, 28);
    exitObj._locked = true;
    this._exitObj = exitObj;

    // ── HUD ───────────────────────────────────────────────
    this.add.rectangle(CANVAS_W / 2, 18, CANVAS_W, 36, 0x000000, 0.85).setScrollFactor(0).setDepth(100);
    const keyHUD = this.add.text(12, 10, "🔑 0/" + state.keysTotal, {
      fontFamily: "monospace", fontSize: "14px", color: "#f1c40f"
    }).setScrollFactor(0).setDepth(101);
    const survivorHUD = this.add.text(150, 10, "👤 5/5", {
      fontFamily: "monospace", fontSize: "14px", color: "#96dc96"
    }).setScrollFactor(0).setDepth(101);
    const bossHUD = this.add.text(320, 10, "⚠ БОСС через " + diff.bossDelay + "с", {
      fontFamily: "monospace", fontSize: "14px", color: "#c86432"
    }).setScrollFactor(0).setDepth(101);
    this.add.text(CANVAS_W - 10, 10, "▶ " + playerName, {
      fontFamily: "monospace", fontSize: "14px", color: COLORS[playerName] || "#ffffff"
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(101);
    const roomHUD = this.add.text(CANVAS_W / 2, 10, level.startRoomLabel || "", {
      fontFamily: "monospace", fontSize: "13px", color: "#9696b4"
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    const hideHUD = this.add.text(CANVAS_W / 2, CANVAS_H - 30, "", {
      fontFamily: "monospace", fontSize: "12px", color: "#b4b464"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
    const fpsHUD = this.add.text(CANVAS_W - 10, CANVAS_H - 10, "60 FPS", {
      fontFamily: "monospace", fontSize: "10px", color: "#3c3c3c"
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(101);

    const spectateHUD = this.add.text(CANVAS_W / 2, CANVAS_H - 55, "", {
      fontFamily: "monospace", fontSize: "13px", color: "#c8c8ff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(false);
    this._hud = { keyHUD, survivorHUD, bossHUD, roomHUD, hideHUD, fpsHUD, spectateHUD };

    // ── Controls hint ─────────────────────────────────────
    const hint = isFoxPlayer ? "WASD — движение  |  Shift — бег  |  C — тихий шаг  |  R — вспышка  |  Лови бегущих!" : "WASD — движение  |  Shift — бег  |  C — тихий шаг  |  R — фонарик  |  1/2/3 — режим  |  E — спрятаться";
    this.add.text(12, CANVAS_H - 20, hint, {
      fontFamily: "monospace", fontSize: "10px", color: "#3c2828"
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(101);

    // ── Fog of war ────────────────────────────────────────
    createFogOverlay();
    if (!this.textures.exists("_fog")) {
      this._fogTex = this.textures.addCanvas("_fog", getFogCanvas()!);
    } else {
      this._fogTex = this.textures.get("_fog");
    }
    this._fogImg = this.add.image(CANVAS_W / 2, CANVAS_H / 2, "_fog")
      .setScrollFactor(0).setDepth(50).setDisplaySize(CANVAS_W, CANVAS_H);
    setFogImage(this._fogImg);
    initWorker(level.rows.slice(), MAP_W, MAP_H);
    this._playerVisible = new Set<string>();
    this._lastVisTileKey = "";
    this._pendingVisibility = false;
    this._facingAngle = Math.PI / 2;
    this._footsteps = [];
    this._flashlight = { on: false, mode: 2 };
    this._foxFlash = { active: false, x: 0, y: 0 };
    // Fox player starts with flash ready; AI fox auto-triggers at 30s intervals
    this._foxFlashTimer = isFoxPlayer ? 0 : 30;

    // ── Camera ────────────────────────────────────────────
    this.cameras.main.startFollow(player, true, 0.08, 0.08);

    // ── Boss reference ────────────────────────────────────
    this._bossObj = null;

    // ── Input ─────────────────────────────────────────────
    this._keys = this.input.keyboard!.addKeys("W,A,S,D");
    this._cursors = this.input.keyboard!.createCursorKeys();

    // Physical key tracking (supports Russian & other layouts via event.code)
    const physKeys: Record<string, boolean> = { w: false, a: false, s: false, d: false, e: false, f: false, shift: false, c: false };
    this._physKeys = physKeys;
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => {
      if (ev.code === "KeyW") physKeys.w = true;
      if (ev.code === "KeyA") physKeys.a = true;
      if (ev.code === "KeyS") physKeys.s = true;
      if (ev.code === "KeyD") physKeys.d = true;
      if (ev.code === "KeyE") physKeys.e = true;
      if (ev.code === "KeyF") physKeys.f = true;
      if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") physKeys.shift = true;
      if (ev.code === "KeyC") physKeys.c = true;
    });
    this.input.keyboard!.on("keyup", (ev: KeyboardEvent) => {
      if (ev.code === "KeyW") physKeys.w = false;
      if (ev.code === "KeyA") physKeys.a = false;
      if (ev.code === "KeyS") physKeys.s = false;
      if (ev.code === "KeyD") physKeys.d = false;
      if (ev.code === "KeyE") physKeys.e = false;
      if (ev.code === "KeyF") physKeys.f = false;
      if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") physKeys.shift = false;
      if (ev.code === "KeyC") physKeys.c = false;
    });

    // ── Minigame digit keys ───────────────────────────────
    const digitNames = ["ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE"];
    for (let d = 1; d <= 9; d++) {
      ((digit: number) => {
        this.input.keyboard!.on("keydown-" + digitNames[digit-1], () => {
          this._onMinigameDigit(digit);
        });
      })(d);
    }
    const tryTerminal = () => {
      if (state.gameOver || state.won || !(player as any)._alive || minigame.active || state.playerHiding || isFoxPlayer) return;
      for (let i = 0; i < terminalObjects.length; i++) {
        const term = terminalObjects[i];
        if (term._solved || !term.active) continue;
        const dx = player.x - term.x, dy = player.y - term.y;
        if (Math.sqrt(dx*dx + dy*dy) < TILE * 2) {
          this._startMinigame(term._doorIdx);
          return;
        }
      }
    };
    const tryHide = () => {
      if (state.gameOver || state.won || !(player as any)._alive || isFoxPlayer) return;
      if (state.playerHiding) {
        state.playerHiding = false;
        player.setVisible(true);
        this._playerTag.setVisible(true);
        (player.body as Phaser.Physics.Arcade.Body).enable = true;
        if (isMultiplayer()) mpSendHidingState(false);
        this._showMsg("Вышел из укрытия", "#c8c864");
      } else {
        const loc = this._findNearestLocker();
        if (loc) {
          state.playerHiding = true;
          player.setVisible(false);
          this._playerTag.setVisible(false);
          (player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
          (player.body as Phaser.Physics.Arcade.Body).enable = false;
          player.x = loc.x; player.y = loc.y;
          if (isMultiplayer()) mpSendHidingState(true);
          this._showMsg("В УКРЫТИИ (E — выйти)", "#64c864");
        }
      }
    };
    // Handle E/F via event.code only (avoids double-fire bug across layouts)
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => {
      if (ev.code === "KeyF") tryTerminal();
      if (ev.code === "KeyE") tryHide();
      // Flashlight toggle (R) — runners only
      if (ev.code === "KeyR" && !isFoxPlayer && !state.gameOver && !state.won) {
        this._flashlight.on = !this._flashlight.on;
        this._showMsg(this._flashlight.on ? "🔦 Фонарик ВКЛ (режим " + this._flashlight.mode + ")" : "🔦 Фонарик ВЫКЛ", this._flashlight.on ? "#ffe090" : "#808080");
      }
      // Fox player flash (R key) — 30s cooldown, 1s burst
      if (ev.code === "KeyR" && isFoxPlayer && !state.gameOver && !state.won) {
        if (this._foxFlashTimer <= 0) {
          this._foxFlash = { active: true, x: player.x, y: player.y };
          this._foxFlashTimer = 30;
          this._showMsg("⚡ ВСПЫШКА!", "#ffff64");
          this.time.delayedCall(1000, () => {
            this._foxFlash = { active: false, x: 0, y: 0 };
          });
        } else {
          this._showMsg("⚡ Перезарядка: " + Math.ceil(this._foxFlashTimer) + "с", "#808080");
        }
      }
      // Flashlight mode (1/2/3) — runners only, not during minigame
      if (!isFoxPlayer && this._flashlight.on && !minigame.active) {
        if (ev.code === "Digit1") { this._flashlight.mode = 1; this._showMsg("🔦 Режим 1: Узкий луч", "#ffe090"); }
        if (ev.code === "Digit2") { this._flashlight.mode = 2; this._showMsg("🔦 Режим 2: Средний", "#ffe090"); }
        if (ev.code === "Digit3") { this._flashlight.mode = 3; this._showMsg("🔦 Режим 3: Широкий", "#ffe090"); }
      }
    });
    this.input.keyboard!.on("keydown-ESC", () => {
      if (minigame.active) this._endMinigame(false);
      else if (state.spectating) {
        state.spectating = false;
        state.gameOver = true;
        this._triggerGameOver();
      } else if (!state.gameOver && !state.won) {
        destroyWorker();
        this._cleanupMPCallbacks();
        if (isMultiplayer()) cleanupMultiplayer();
        this.scene.start("Menu");
      }
    });
    this.input.keyboard!.on("keydown-TAB", (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (!state.spectating) return;
      this._cycleSpectateTarget(1);
    });

    // ── Collisions ────────────────────────────────────────
    keyObjects.forEach((k, idx) => {
      this.physics.add.overlap(player, k, () => {
        if (!(player as any)._alive || !k.active) return;
        state.keysCollected++;
        k.destroy();
        if (isMultiplayer()) mpSendKeyCollected(idx);
        if (state.keysCollected >= state.keysTotal) {
          exitObj.setTexture("exit");
          exitObj._locked = false;
          this._showMsg("ВЫХОД ОТКРЫТ! БЕГИ!", "#32ff32");
        } else {
          this._showMsg("Ключ " + state.keysCollected + "/" + state.keysTotal, "#f1c40f");
        }
        this.cameras.main.shake(200, 0.005);
      });
    });

    if (!isMultiplayer()) {
      npcs.forEach((npc) => {
        keyObjects.forEach((k, idx) => {
          this.physics.add.overlap(npc, k, () => {
            if (!npc._alive || !k.active) return;
            state.keysCollected++;
            k.destroy();
            npc.path = []; npc.pathTimer = 0;
            if (state.keysCollected >= state.keysTotal) {
              exitObj.setTexture("exit");
              exitObj._locked = false;
              this._showMsg("ВЫХОД ОТКРЫТ! БЕГИ!", "#32ff32");
            }
          });
        });
      });
    }

    this.physics.add.overlap(player, exitObj, () => {
      if (!(player as any)._alive || exitObj._locked || state.playerHiding) return;
      if (!state.won) {
        state.won = true;
        if (isMultiplayer()) mpSendEscaped(MP.localPeerId!);
        this._triggerWin();
      }
    });

    if (!isMultiplayer()) {
      npcs.forEach((npc) => {
        this.physics.add.overlap(npc, exitObj, () => {
          if (!npc._alive || exitObj._locked) return;
          npc._alive = false;
          npc.setVisible(false);
          if (npc._tag) npc._tag.setVisible(false);
          state.escapedNPCs++;
          state.survivingNPCs = state.survivingNPCs.filter((n: any) => n !== npc);
          this._showMsg(npc._name + " сбежал!", "#64ff64");
          // If spectating, check if we still have targets
          if (state.spectating) {
            const alive = this._npcs.filter((n: any) => n._alive);
            if (alive.length === 0) {
              state.spectating = false;
              state.gameOver = true;
              this._triggerGameOver();
            } else {
              this._updateSpectateCamera();
            }
          }
        });
      });
    }

    if (fox) {
      const catchTargets = [player, ...npcs];
      catchTargets.forEach((target) => {
        this.physics.add.overlap(fox, target, () => {
          if (!(target as any)._alive) return;
          if (target === player && state.playerHiding) return;
          this._catchRunner(target, "Foxmind");
        });
      });
    }

    if (isFoxPlayer) {
      npcs.forEach((npc) => {
        this.physics.add.overlap(player, npc, () => {
          if (!npc._alive) return;
          this._catchRunner(npc, "Foxmind");
        });
      });
    }

    // ── Multiplayer ───────────────────────────────────────
    this._remotePlayers = new Map();
    if (isMultiplayer()) {
      this._setupMultiplayer();
    }

    state.startTime = this.time.now / 1000;
    console.log("[ASSYLUM] GameScene.create() DONE");
  }

  // ── UPDATE ──────────────────────────────────────────────
  update(time: number, delta: number) {
    if (!this._state) return; // create() didn't finish
    try {
      this._updateInner(time, delta);
    } catch (err) {
      console.error("[ASSYLUM] GameScene.update() CRASHED:", err);
    }
  }

  _updateInner(time: number, delta: number) {
    const state = this._state;
    if (state.won) return;
    if (state.gameOver && !state.spectating) return;
    const dt = delta / 1000;
    const player = this._player;
    if (!player) return; // create() didn't finish
    const level = this._level;
    const diff = this._diff;
    const fox = this._fox;
    const npcs = this._npcs;
    const isFoxPlayer = this._isFoxPlayer;

    // ── Hide HUD indicator ─────────────────────────────
    const nearLocker = this._findNearestLocker();
    let nearTerminal = false;
    for (let i = 0; i < this._terminalObjects.length; i++) {
      const term = this._terminalObjects[i];
      if (!term._solved && term.active) {
        const dx = player.x - term.x, dy = player.y - term.y;
        if (Math.sqrt(dx*dx + dy*dy) < TILE * 2) { nearTerminal = true; break; }
      }
    }
    if (state.playerHiding) {
      this._hud.hideHUD.setText("🚪 УКРЫТИЕ [E — выйти]");
    } else if (nearTerminal && !this._minigame.active) {
      this._hud.hideHUD.setText("💻 Нажми F — терминал");
    } else if (nearLocker) {
      this._hud.hideHUD.setText(nearLocker._isBed ? "🛏 Нажми E — спрятаться под кровать" : "🚪 Нажми E чтобы спрятаться");
    } else {
      this._hud.hideHUD.setText("");
    }

    // ── Player movement ───────────────────────────────
    if ((player as any)._alive && !state.playerHiding && !this._minigame.active) {
      let mx = 0, my = 0;
      if (this._keys.A.isDown || this._cursors.left.isDown || this._physKeys.a) mx -= 1;
      if (this._keys.D.isDown || this._cursors.right.isDown || this._physKeys.d) mx += 1;
      if (this._keys.W.isDown || this._cursors.up.isDown || this._physKeys.w)   my -= 1;
      if (this._keys.S.isDown || this._cursors.down.isDown || this._physKeys.s)  my += 1;
      const len = Math.sqrt(mx * mx + my * my);
      if (len > 0) {
        let spdMult = 1;
        if (this._physKeys.shift) spdMult = SPRINT_MULT;
        else if (this._physKeys.c) spdMult = SNEAK_MULT;
        const spd = (player as any)._speed * spdMult;
        (player.body as Phaser.Physics.Arcade.Body).setVelocity(mx / len * spd, my / len * spd);
        this._facingAngle = Math.atan2(my, mx);
      } else {
        (player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    } else {
      (player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // ── Player tag follow ─────────────────────────────
    this._playerTag.x = player.x;
    this._playerTag.y = player.y - 14;

    // ── Key bob animation ─────────────────────────────
    this._keyObjects.forEach((k) => {
      if (!k.active) return;
      k._bobT += dt;
      k.y = k._baseY + Math.sin(k._bobT * 3) * 3;
    });

    // ── Footstep waves ────────────────────────────────
    this._tickFootsteps(player, npcs, fox, dt);

    // ── MP position sync ──────────────────────────────
    if (isMultiplayer()) {
      const pb = player.body as Phaser.Physics.Arcade.Body;
      mpSendPosition(player.x, player.y, pb.velocity.x, pb.velocity.y);
      if (MP.isHost) {
        if (fox && fox.body) mpSendFoxPos(fox.x, fox.y, fox.body.velocity.x, fox.body.velocity.y);
        if (this._bossObj && this._bossObj.active && this._bossObj.body) mpSendBossPos(this._bossObj.x, this._bossObj.y, this._bossObj.body.velocity.x, this._bossObj.body.velocity.y);
        // Send NPC positions to clients
        const npcData = npcs.filter((n: any) => n._alive).map((n: any) => ({name: n._name, x: n.x, y: n.y}));
        mpSendNpcPositions(npcData);
      }
    }

    // ── Room label ────────────────────────────────────
    const pt = worldToTile(player);
    const rType = this._roomTileType.get(tileKey(pt.col, pt.row));
    this._hud.roomHUD.setText(rType ? (ROOM_LABELS[rType] || "") : "");

    // ── NPC AI (host/solo) ────────────────────────────
    if (!isMultiplayer() || MP.isHost) {
      npcs.forEach((npc, ni) => {
        if (!npc._alive) return;
        const npcTile = worldToTile(npc);
        const threats: Tile[] = [];
        let dangerVisible = false;

        if (fox) {
          threats.push(worldToTile(fox));
          dangerVisible = hasLineOfSight(level.rows, npc, fox) && Phaser.Math.Distance.Between(npc.x, npc.y, fox.x, fox.y) < TILE * 12;
        }
        if (isFoxPlayer) {
          threats.push(worldToTile(player));
          dangerVisible = dangerVisible || (hasLineOfSight(level.rows, npc, player) && Phaser.Math.Distance.Between(npc.x, npc.y, player.x, player.y) < TILE * 12);
        }
        if (this._bossObj && this._bossObj.active) {
          threats.push(worldToTile(this._bossObj));
          dangerVisible = dangerVisible || (hasLineOfSight(level.rows, npc, this._bossObj) && Phaser.Math.Distance.Between(npc.x, npc.y, this._bossObj.x, this._bossObj.y) < TILE * 12);
        }

        // Separation (add push to velocity set by moveAlongPath)
        npcs.forEach((other, oi) => {
          if (oi === ni || !other._alive) return;
          const sep = Phaser.Math.Distance.Between(npc.x, npc.y, other.x, other.y);
          if (sep < 18 && sep > 0.5) {
            const pushFactor = 40 / sep;
            const nBody = npc.body as Phaser.Physics.Arcade.Body;
            nBody.velocity.x += (npc.x - other.x) * pushFactor;
            nBody.velocity.y += (npc.y - other.y) * pushFactor;
          }
        });

        npc.pathTimer -= dt;
        if (npc.pathTimer <= 0 || npc.path.length === 0) {
          let dest: Tile;
          if (dangerVisible) {
            npc._brainState = "flee";
            dest = chooseEscapeTile(level, npcTile, threats);
            npc.pathTimer = 0.5;
          } else {
            const obj = chooseObjectiveTile(level, npcTile, this._keyObjects, this._exitObj._locked);
            if (obj) {
              npc._brainState = this._exitObj._locked ? "seek-key" : "escape";
              dest = obj;
              npc.pathTimer = this._exitObj._locked ? 1.2 + Math.random() * 0.5 : 0.8;
            } else {
              npc._brainState = "patrol";
              dest = choosePatrolTile(level, npcTile);
              npc.pathTimer = 2.0 + Math.random() * 1.0;
            }
          }
          npc.path = findPath(level.rows, npcTile, dest);
          if (npc.path.length === 0) {
            // Already at dest or unreachable — force a far patrol target
            const alt = choosePatrolTile(level, npcTile);
            npc.path = findPath(level.rows, npcTile, alt);
            npc.pathTimer = Math.max(npc.pathTimer, 0.8 + Math.random() * 0.5);
          }
        }
        // NPC sprint when fleeing, sneak when patrolling near threats
        let npcSpeedMult = 1;
        if (npc._brainState === "flee") {
          npcSpeedMult = SPRINT_MULT; // sprint when running away
        } else if (dangerVisible && npc._brainState === "patrol") {
          npcSpeedMult = SNEAK_MULT; // sneak when danger is visible but not fleeing
        }
        moveAlongPath(npc, npc._speed * npcSpeedMult, dt);

        if (npc._tag) {
          npc._tag.x = npc.x;
          npc._tag.y = npc.y - 14;
        }
      });
    } else {
      npcs.forEach((npc) => {
        if (npc._tag) {
          npc._tag.x = npc.x;
          npc._tag.y = npc.y - 14;
        }
      });
    }

    // ── Fox AI ────────────────────────────────────────
    if (fox && (!isMultiplayer() || MP.isHost)) {
      const visibleTargets: { actor: any; dist: number; pri: number }[] = [];
      if (!isFoxPlayer && (player as any)._alive && !state.playerHiding) {
        // Player in dark area with flashlight off → invisible to fox (unless fox flash active)
        const playerLit = this._flashlight.on || this._isInLitArea(player.x, player.y) || this._foxFlash.active;
        if (playerLit) {
          const d = Phaser.Math.Distance.Between(fox.x, fox.y, player.x, player.y);
          if (d < TILE * diff.foxSight && hasLineOfSight(level.rows, fox, player))
            visibleTargets.push({ actor: player, dist: d, pri: 0 });
        }
      }
      npcs.forEach((npc) => {
        if (!npc._alive) return;
        const d = Phaser.Math.Distance.Between(fox.x, fox.y, npc.x, npc.y);
        if (d < TILE * diff.foxSight && hasLineOfSight(level.rows, fox, npc))
          visibleTargets.push({ actor: npc, dist: d, pri: 1 });
      });
      if (isMultiplayer()) {
        getHostPlayerStates().forEach((ps, pid) => {
          if (!ps.alive || ps.hiding || pid === MP.foxPlayerId) return;
          // Remote players in dark areas are also hidden (assume no flashlight info for now)
          if (!this._isInLitArea(ps.x, ps.y) && !this._foxFlash.active) return;
          const d = Phaser.Math.Distance.Between(fox.x, fox.y, ps.x, ps.y);
          if (d < TILE * diff.foxSight && hasLineOfSight(level.rows, fox, {x: ps.x, y: ps.y}))
            visibleTargets.push({ actor: {x: ps.x, y: ps.y}, dist: d, pri: 0 });
        });
      }

      visibleTargets.sort((a, b) => (a.pri - b.pri) || (a.dist - b.dist));
      let nearest: any = null, nearestDist = Infinity;

      if (visibleTargets.length > 0) {
        nearest = visibleTargets[0].actor;
        nearestDist = visibleTargets[0].dist;
        fox._brainState = "chase";
        fox._memoryTile = worldToTile(nearest);
        fox._memoryTime = 5;
      } else if (fox._memoryTime > 0) {
        fox._memoryTime -= dt;
        fox._brainState = "search";
      } else {
        fox._brainState = "patrol";
      }

      fox.pathTimer -= dt;
      if (fox.pathTimer <= 0 || fox.path.length === 0) {
        const fTile = worldToTile(fox);
        if (nearest && nearestDist < TILE * diff.foxSight) {
          fox.path = findPath(level.rows, fTile, worldToTile(nearest));
          fox.pathTimer = 0.35;
        } else if (fox._memoryTime > 0) {
          fox.path = findPath(level.rows, fTile, chooseSearchTile(level, fTile, fox._memoryTile));
          fox.pathTimer = 0.7;
        } else {
          const patrolDest = choosePatrolTile(level, fTile);
          if (tileDist(patrolDest, fTile) < 4) {
            const farRooms = level.rooms.map((r) => roomCenter(r)).filter((t) => tileDist(t, fTile) > 10);
            fox._patrolTile = farRooms.length > 0 ? farRooms[Math.floor(Math.random() * farRooms.length)] : patrolDest;
          } else {
            fox._patrolTile = patrolDest;
          }
          fox.path = findPath(level.rows, fTile, fox._patrolTile);
          fox.pathTimer = 2.0 + Math.random() * 1.5;
        }
      }
      moveAlongPath(fox, fox._speed, dt);
      if (fox._tag) { fox._tag.x = fox.x; fox._tag.y = fox.y - 14; }

      // ── Fox searches hiding spots every 30 seconds ──
      fox._searchHideTimer -= dt;
      if (fox._searchHideTimer <= 0) {
        fox._searchHideTimer = 30;
        const foxTile = worldToTile(fox);
        const searchRange = TILE * 3;
        const allSpots = [...this._lockerObjects, ...this._bedObjects];
        for (let si = 0; si < allSpots.length; si++) {
          const spot = allSpots[si];
          if (!spot.active) continue;
          const sd = Phaser.Math.Distance.Between(fox.x, fox.y, spot.x, spot.y);
          if (sd > searchRange) continue;
          // Check if player is hiding in this spot
          if (state.playerHiding && (player as any)._alive && !isFoxPlayer) {
            const pd = Phaser.Math.Distance.Between(player.x, player.y, spot.x, spot.y);
            if (pd < TILE) {
              state.playerHiding = false;
              player.setVisible(true);
              this._playerTag.setVisible(true);
              (player.body as Phaser.Physics.Arcade.Body).enable = true;
              this._showMsg("ОБНАРУЖЕН!", "#ff3232");
              this._catchRunner(player, "Foxmind");
              break;
            }
          }
        }
      }

      // ── Fox flash ability (30s cooldown, 1s burst) — AI only ──
      this._foxFlashTimer -= dt;
      if (this._foxFlashTimer <= 0) {
        this._foxFlash = { active: true, x: fox.x, y: fox.y };
        this._foxFlashTimer = 30;
        this.time.delayedCall(1000, () => {
          this._foxFlash = { active: false, x: 0, y: 0 };
        });
      } else {
        if (this._foxFlash.active) {
          this._foxFlash.x = fox.x;
          this._foxFlash.y = fox.y;
        }
      }
    }

    // ── Fox player flash cooldown ─────────────────────
    if (isFoxPlayer) {
      if (this._foxFlashTimer > 0) this._foxFlashTimer -= dt;
      if (this._foxFlash.active) {
        this._foxFlash.x = player.x;
        this._foxFlash.y = player.y;
      }
    }

    // ── Boss AI ───────────────────────────────────────
    if ((!isMultiplayer() || MP.isHost) && state.bossSpawned && this._bossObj && this._bossObj.active) {
      const bossObj = this._bossObj;
      const bTile = worldToTile(bossObj);
      let target: any = null, targetDist = Infinity;
      if ((player as any)._alive && !state.playerHiding && !this._isFoxPlayer) {
        const bd = Phaser.Math.Distance.Between(bossObj.x, bossObj.y, player.x, player.y);
        if (bd < TILE * (diff.foxSight + 4) && hasLineOfSight(level.rows, bossObj, player)) {
          if (bd < targetDist) { targetDist = bd; target = player; }
        }
      }
      npcs.forEach((npc) => {
        if (!npc._alive) return;
        const bd = Phaser.Math.Distance.Between(bossObj.x, bossObj.y, npc.x, npc.y);
        if (bd < TILE * (diff.foxSight + 4) && hasLineOfSight(level.rows, bossObj, npc)) {
          if (bd < targetDist) { targetDist = bd; target = npc; }
        }
      });
      if (isMultiplayer()) {
        getHostPlayerStates().forEach((ps, pid) => {
          if (!ps.alive || ps.hiding || pid === MP.foxPlayerId) return;
          const bd = Phaser.Math.Distance.Between(bossObj.x, bossObj.y, ps.x, ps.y);
          if (bd < TILE * (diff.foxSight + 4) && hasLineOfSight(level.rows, bossObj, {x: ps.x, y: ps.y})) {
            if (bd < targetDist) { targetDist = bd; target = {x: ps.x, y: ps.y}; }
          }
        });
      }

      bossObj.pathTimer -= dt;
      if (target) {
        if (bossObj.pathTimer <= 0 || bossObj.path.length === 0) {
          bossObj.path = findPath(level.rows, bTile, worldToTile(target));
          bossObj.pathTimer = 0.4;
        }
      } else if (bossObj.pathTimer <= 0 || bossObj.path.length === 0) {
        const farRooms = level.rooms.map((r) => roomCenter(r)).filter((t) => tileDist(t, bTile) > 8);
        const dest = farRooms.length > 0 ? farRooms[Math.floor(Math.random() * farRooms.length)] : choosePatrolTile(level, bTile);
        bossObj.path = findPath(level.rows, bTile, dest);
        bossObj.pathTimer = 2.0 + Math.random() * 1.0;
      }
      moveAlongPath(bossObj, bossObj._speed, dt);
      if (bossObj._tag) { bossObj._tag.x = bossObj.x; bossObj._tag.y = bossObj.y - 16; }
    }

    // ── Host-authoritative catch check ────────────
    if (isMultiplayer() && MP.isHost) this._checkHostCatches();

    // ── Boss timer ────────────────────────────────────
    if (!isMultiplayer() || MP.isHost) {
      if (!state.bossSpawned) {
        state.bossTimer += dt;
        const rem = Math.max(0, Math.ceil(diff.bossDelay - state.bossTimer));
        this._hud.bossHUD.setText("⚠ БОСС через " + rem + "с");
        this._hud.bossHUD.setColor(rem < 15 ? "#ff3232" : "#c86432");
        if (state.bossTimer >= diff.bossDelay) this._spawnBoss();
      } else {
        this._hud.bossHUD.setText("⚠ ЖЕЛОЧЬ ЗДЕСЬ");
        this._hud.bossHUD.setColor("#ff0000");
      }
    }

    // ── Remote players (velocity extrapolation) ──────
    if (isMultiplayer()) {
      this._remotePlayers.forEach((rp) => {
        if (!rp.sprite.active) return;
        // Extrapolate target using velocity
        const vx = rp.vx || 0, vy = rp.vy || 0;
        rp.targetX += vx * dt;
        rp.targetY += vy * dt;
        // Smooth lerp towards extrapolated position
        rp.sprite.x += (rp.targetX - rp.sprite.x) * 0.3;
        rp.sprite.y += (rp.targetY - rp.sprite.y) * 0.3;
        if (rp.tag) { rp.tag.x = rp.sprite.x; rp.tag.y = rp.sprite.y - 14; }
      });
    }

    // ── Flicker ───────────────────────────────────────
    state.flickerTimer += dt;
    const flickerExtra = Math.abs(Math.sin(state.flickerTimer * 7.3) * Math.sin(state.flickerTimer * 3.1)) * state.flickerIntensity * 0.12;

    // ── Fog of war ────────────────────────────────────
    const fogSource = state.spectating ? this._getSpectateTarget() || player : player;
    const pTile = worldToTile(fogSource);
    const pKey = tileKey(pTile.col, pTile.row);
    if (pKey !== this._lastVisTileKey && !this._pendingVisibility) {
      this._pendingVisibility = true;
      this._lastVisTileKey = pKey;
      workerVisibility(pTile.col, pTile.row, isFoxPlayer ? diff.foxSight : diff.sight, (vis) => {
        this._playerVisible = vis;
        this._pendingVisibility = false;
      });
    }

    const cam = this.cameras.main;
    // Fox player gets full sight, no flashlight needed
    const fogFlashlight: FlashlightState = isFoxPlayer ? { on: true, mode: 3 } : this._flashlight;
    renderFogGPU(this._playerVisible, pTile.col, pTile.row, isFoxPlayer ? diff.foxSight : diff.sight, cam.scrollX + CANVAS_W / 2, cam.scrollY + CANVAS_H / 2, flickerExtra, 36, this._facingAngle, this._footsteps, level.lightSources || [], fogFlashlight, this._foxFlash);
    if (this._fogTex && this._fogTex.refresh) this._fogTex.refresh();

    // ── Hide entities behind fog ──────────────────────
    if (fox) {
      const foxTile = worldToTile(fox);
      const foxVis = this._playerVisible.has(tileKey(foxTile.col, foxTile.row));
      fox.setVisible(foxVis);
      if (fox._tag) fox._tag.setVisible(foxVis);
    }
    const vis = this._playerVisible;
    npcs.forEach((npc) => {
      if (!npc._alive) return;
      const nt = worldToTile(npc);
      const nVis = vis.has(tileKey(nt.col, nt.row));
      npc.setVisible(nVis);
      if (npc._tag) npc._tag.setVisible(nVis);
    });
    if (this._bossObj && this._bossObj.active) {
      const bt = worldToTile(this._bossObj);
      const bVis = vis.has(tileKey(bt.col, bt.row));
      this._bossObj.setVisible(bVis);
      if (this._bossObj._tag) this._bossObj._tag.setVisible(bVis);
    }

    // ── FPS ───────────────────────────────────────────
    this._hud.fpsHUD.setText(updateFPS() + " FPS");

    // ── HUD update ────────────────────────────────────
    this._hud.keyHUD.setText("🔑 " + state.keysCollected + "/" + state.keysTotal);
    const aliveCount = ((player as any)._alive ? 1 : 0) + npcs.filter((n: any) => n._alive).length;
    this._hud.survivorHUD.setText("👤 " + aliveCount + "/" + this._allRunnerNames.length + "  Спасены: " + state.escapedNPCs);
    this._hud.survivorHUD.setColor(aliveCount <= 2 ? "#ff6464" : "#96dc96");
    if (state.spectating) {
      this._hud.hideHUD.setText("");
      const st = this._getSpectateTarget();
      if (st) {
        this._hud.spectateHUD.setText("👁 НАБЛЮДЕНИЕ: " + (st._name || "???") + "  [Tab — переключить | ESC — выход]");
      }
    } else if (isFoxPlayer) {
      if (this._foxFlashTimer <= 0) {
        this._hud.hideHUD.setText("⚡ [R] Вспышка — готово!");
        this._hud.hideHUD.setColor("#ffff64");
      } else {
        this._hud.hideHUD.setText("⚡ Вспышка: " + Math.ceil(this._foxFlashTimer) + "с");
        this._hud.hideHUD.setColor("#808080");
      }
    }
  }

  // ── HELPER METHODS ──────────────────────────────────────

  _tickFootsteps(player: any, npcs: any[], fox: any, dt: number) {
    // Generate footsteps for all actors (visible as ripples through fog)
    const actors: any[] = [...npcs.filter((n: any) => n._alive), fox, this._bossObj].filter(Boolean).filter((a: any) => a.active !== false);
    for (const actor of actors) {
      if (!actor.body) continue;
      const vx = actor.body.velocity.x, vy = actor.body.velocity.y;
      const spd = Math.sqrt(vx * vx + vy * vy);
      if (spd < 70) { actor._stepTimer = 0; continue; }
      const isRunning = spd >= 140;
      const interval = isRunning ? 0.35 : 0.5;
      actor._stepTimer = (actor._stepTimer || 0) + dt;
      if (actor._stepTimer >= interval) {
        actor._stepTimer -= interval;
        this._footsteps.push({
          x: actor.x, y: actor.y, age: 0,
          maxAge: isRunning ? 1.5 : 1.0,
          maxRadius: isRunning ? TILE * 5 : TILE * 3,
        });
      }
    }
    // Player footsteps (feedback: how loud am I?)
    if ((player as any)._alive && !this._state.playerHiding) {
      const pb = player.body as Phaser.Physics.Arcade.Body;
      const ps = Math.sqrt(pb.velocity.x ** 2 + pb.velocity.y ** 2);
      if (ps >= 70) {
        const isRun = ps >= 140;
        const pInterval = isRun ? 0.35 : 0.5;
        player._stepTimer = (player._stepTimer || 0) + dt;
        if (player._stepTimer >= pInterval) {
          player._stepTimer -= pInterval;
          this._footsteps.push({
            x: player.x, y: player.y, age: 0,
            maxAge: isRun ? 1.5 : 1.0,
            maxRadius: isRun ? TILE * 5 : TILE * 3,
          });
        }
      } else {
        player._stepTimer = 0;
      }
    }
    // Age and remove expired footsteps
    for (let i = this._footsteps.length - 1; i >= 0; i--) {
      this._footsteps[i].age += dt;
      if (this._footsteps[i].age >= this._footsteps[i].maxAge) {
        this._footsteps.splice(i, 1);
      }
    }
  }

  _isInLitArea(x: number, y: number): boolean {
    const tile = worldToTile({ x, y });
    const ls = this._level.lightSources;
    if (!ls) return true;
    for (let i = 0; i < ls.length; i++) {
      const dx = tile.col - ls[i].col, dy = tile.row - ls[i].row;
      if (Math.sqrt(dx * dx + dy * dy) < ls[i].radius) return true;
    }
    return false;
  }

  _findNearestLocker(): any {
    const p = this._player;
    let best: any = null, bestD = Infinity;
    for (let i = 0; i < this._lockerObjects.length; i++) {
      const loc = this._lockerObjects[i];
      if (!loc.active) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, loc.x, loc.y);
      if (d < TILE * 1.5 && d < bestD) { bestD = d; best = loc; }
    }
    for (let i = 0; i < this._bedObjects.length; i++) {
      const bed = this._bedObjects[i];
      if (!bed.active) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, bed.x, bed.y);
      if (d < TILE * 2 && d < bestD) { bestD = d; best = bed; }
    }
    return best;
  }

  _startMinigame(termIdx: number) {
    const mg = this._minigame;
    mg.active = true;
    mg.termIdx = termIdx;
    mg.code = [randInt(1,9), randInt(1,9), randInt(1,9), randInt(1,9)];
    mg.input = [];
    const cx = CANVAS_W / 2, cy = CANVAS_H / 2;

    const bg1 = this.add.rectangle(cx, cy, 364, 224, 0x00503c, 0.85).setScrollFactor(0).setDepth(299);
    const bg2 = this.add.rectangle(cx, cy, 356, 216, 0x050f19, 0.97).setScrollFactor(0).setDepth(300);
    const titleTxt = this.add.text(cx, cy - 78, "ТЕРМИНАЛ ДОСТУПА", {
      fontFamily: "monospace", fontSize: "14px", color: "#00c878"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    const codeTxt = this.add.text(cx, cy - 32, "КОД: " + mg.code.join("  "), {
      fontFamily: "monospace", fontSize: "22px", color: "#00ffa0"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    const inputDisp = this.add.text(cx, cy + 14, "ВВОД: _  _  _  _", {
      fontFamily: "monospace", fontSize: "18px", color: "#b4b4b4"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    const helpTxt = this.add.text(cx, cy + 55, "Нажимайте цифры 1-9", {
      fontFamily: "monospace", fontSize: "10px", color: "#506450"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    const escTxt = this.add.text(cx, cy + 80, "ESC — отмена", {
      fontFamily: "monospace", fontSize: "10px", color: "#3c4641"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);

    mg.elements = [bg1, bg2, titleTxt, codeTxt, inputDisp, helpTxt, escTxt];
    mg.inputDisplay = inputDisp;
  }

  _onMinigameDigit(digit: number) {
    const mg = this._minigame;
    if (!mg.active) return;
    mg.input.push(digit);
    this._updateMinigameDisplay();
    const idx = mg.input.length - 1;
    if (mg.input[idx] !== mg.code[idx]) {
      mg.inputDisplay.setColor("#ff3232");
      this.time.delayedCall(300, () => {
        mg.input = [];
        if (mg.inputDisplay && mg.inputDisplay.active) {
          mg.inputDisplay.setColor("#b4b4b4");
          this._updateMinigameDisplay();
        }
      });
      return;
    }
    mg.inputDisplay.setColor("#00ff78");
    this.time.delayedCall(150, () => {
      if (mg.inputDisplay && mg.inputDisplay.active) mg.inputDisplay.setColor("#b4b4b4");
    });
    if (mg.input.length >= 4) {
      this.time.delayedCall(300, () => { this._endMinigame(true); });
    }
  }

  _updateMinigameDisplay() {
    const mg = this._minigame;
    const d = mg.input.map((v: number) => String(v));
    while (d.length < 4) d.push("_");
    mg.inputDisplay.setText("ВВОД: " + d.join("  "));
  }

  _endMinigame(success: boolean) {
    const mg = this._minigame;
    if (success) {
      const doorData = this._lockedDoorObjects[mg.termIdx];
      if (doorData) {
        doorData.barriers.forEach((b: any) => { if (b.active) b.destroy(); });
        doorData.data.doorTiles.forEach((d: any) => {
          const chars = this._level.rows[d.row].split('');
          chars[d.col] = '.';
          this._level.rows[d.row] = chars.join('');
          workerUpdateRow(d.row, this._level.rows[d.row]);
        });
      }
      if (this._terminalObjects[mg.termIdx]) this._terminalObjects[mg.termIdx]._solved = true;
      this._showMsg("ДВЕРЬ ОТКРЫТА!", "#00ff78");
      this.cameras.main.shake(200, 0.008);
      if (isMultiplayer()) mpSendDoorOpened(mg.termIdx);
    }
    mg.elements.forEach((e: any) => { if (e.active) e.destroy(); });
    mg.elements = [];
    mg.active = false;
    mg.termIdx = -1;
  }

  _checkHostCatches() {
    const fox = this._fox;
    const bossObj = this._bossObj;
    const catchRadius = TILE * 1.2;
    getHostPlayerStates().forEach((ps, pid) => {
      if (!ps.alive || ps.hiding) return;
      if (fox) {
        const d = Phaser.Math.Distance.Between(fox.x, fox.y, ps.x, ps.y);
        if (d < catchRadius) {
          mpSendHostCatch(pid, "Foxmind");
          return;
        }
      }
      if (bossObj && bossObj.active && pid !== MP.foxPlayerId) {
        const d = Phaser.Math.Distance.Between(bossObj.x, bossObj.y, ps.x, ps.y);
        if (d < catchRadius) {
          mpSendHostCatch(pid, "Желочь");
        }
      }
    });
  }

  _spawnBoss() {
    const state = this._state;
    const diff = this._diff;
    const level = this._level;
    state.bossSpawned = true;
    if (this._fox) this._fox._speed = diff.foxSpd * 1.5;
    state.flickerIntensity = 0.7;
    if (isMultiplayer() && MP.isHost) mpSendBossSpawned();

    const ann = this.add.text(CANVAS_W / 2, CANVAS_H / 2, "ЖЕЛОЧЬ ПРОСНУЛАСЬ", {
      fontFamily: "monospace", fontSize: "36px", color: "#c80000"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({
      targets: ann, alpha: 1, duration: 500,
      onComplete: () => {
        this.time.delayedCall(2000, () => {
          this.tweens.add({ targets: ann, alpha: 0, duration: 1000, onComplete: () => { ann.destroy(); } });
        });
      }
    });
    this.cameras.main.shake(500, 0.02);

    const flash = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x960000, 0.5).setScrollFactor(0).setDepth(88);
    this.tweens.add({ targets: flash, alpha: 0, duration: 2000, onComplete: () => { flash.destroy(); } });

    const bossPos = tileCenter(level.bossSpawn.col, level.bossSpawn.row);
    const bossObj: any = this.physics.add.sprite(bossPos.x, bossPos.y, "Jelo").setDepth(5);
    const bossScale = spriteScaleForHeight("Jelo", 48);
    bossObj.setScale(bossScale);
    bossObj.body.setSize(10 / bossScale, 10 / bossScale);
    bossObj.setCollideWorldBounds(true);
    bossObj._speed = diff.bossSpd;
    bossObj.path = [];
    bossObj.pathTimer = 0;
    this.physics.add.collider(bossObj, this._wallGroup);
    bossObj._tag = this.add.text(bossPos.x, bossPos.y - 16, "ЖЕЛОЧЬ", {
      fontFamily: "monospace", fontSize: "9px", color: "#32dc32"
    }).setOrigin(0.5).setDepth(10);
    this._bossObj = bossObj;

    const catchTargets = [this._player, ...this._npcs];
    catchTargets.forEach((target) => {
      this.physics.add.overlap(bossObj, target, () => {
        if (!(target as any)._alive) return;
        if (target === this._player && this._isFoxPlayer) return;
        if (target === this._player && state.playerHiding) return;
        this._catchRunner(target, "Желочь");
      });
    });
  }

  _catchRunner(runner: any, catcherName: string) {
    const state = this._state;
    if (!runner._alive) return;
    runner._alive = false;
    const isPlayer = (runner === this._player);

    this.add.image(runner.x, runner.y, "blood").setScale(2.5).setDepth(0);
    this.add.image(runner.x, runner.y, "corpse").setScale(2).setDepth(1);
    this.cameras.main.shake(isPlayer ? 400 : 200, isPlayer ? 0.02 : 0.01);

    if (isPlayer) {
      runner.setVisible(false);
      if (this._playerTag) this._playerTag.setVisible(false);
      (runner.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      state.catcherName = catcherName;
      if (isMultiplayer()) mpSendCaught(MP.localPeerId!, catcherName);

      // Enter spectator mode if there are alive NPCs to watch
      const aliveNPCs = this._npcs.filter((n: any) => n._alive);
      if (aliveNPCs.length > 0 && !this._isFoxPlayer) {
        state.spectating = true;
        state.spectateIdx = 0;
        this._updateSpectateCamera();
        this._showMsg("Tab — переключить | ESC — выход", "#c8c8ff");
      } else {
        state.gameOver = true;
        this.time.delayedCall(600, () => { this._triggerGameOver(); });
      }
    } else {
      runner.setVisible(false);
      if (runner._tag) runner._tag.setVisible(false);
      (runner.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      state.survivingNPCs = state.survivingNPCs.filter((n: any) => n !== runner);
      this._showMsg(runner._name + " пойман!", "#ff5050");
      if (isMultiplayer() && MP.isHost) mpSendNpcCaught(runner._name, catcherName);

      // If spectating and current target died, cycle to next or end
      if (state.spectating) {
        const aliveNPCs = this._npcs.filter((n: any) => n._alive);
        if (aliveNPCs.length === 0) {
          state.spectating = false;
          state.gameOver = true;
          this.time.delayedCall(600, () => { this._triggerGameOver(); });
        } else {
          this._updateSpectateCamera();
        }
      }

      if (this._isFoxPlayer) {
        const aliveRunners = this._npcs.filter((n: any) => n._alive);
        if (aliveRunners.length === 0) {
          state.won = true;
          this._triggerWin();
        }
      }
    }
  }

  _getSpectateTarget(): any {
    const aliveNPCs = this._npcs.filter((n: any) => n._alive);
    if (aliveNPCs.length === 0) return null;
    const idx = this._state.spectateIdx % aliveNPCs.length;
    return aliveNPCs[idx];
  }

  _updateSpectateCamera() {
    const target = this._getSpectateTarget();
    if (target) {
      this.cameras.main.startFollow(target, true, 0.08, 0.08);
      this._hud.spectateHUD.setText("👁 НАБЛЮДЕНИЕ: " + (target._name || "???") + "  [Tab — переключить | ESC — выход]");
      this._hud.spectateHUD.setVisible(true);
    }
  }

  _cycleSpectateTarget(dir: number) {
    const aliveNPCs = this._npcs.filter((n: any) => n._alive);
    if (aliveNPCs.length === 0) return;
    this._state.spectateIdx = (this._state.spectateIdx + dir + aliveNPCs.length) % aliveNPCs.length;
    this._updateSpectateCamera();
  }

  _triggerGameOver() {
    hideFogOverlay();
    destroyWorker();
    this._cleanupMPCallbacks();
    if (isMultiplayer()) cleanupMultiplayer();
    this.scene.start("GameOver", {
      catcherName: this._state.catcherName,
      playerName: this._playerName,
      keysCollected: this._state.keysCollected,
      keysTotal: this._state.keysTotal,
      escaped: this._state.escapedNPCs,
      totalRunners: this._npcs.length,
    });
  }

  _triggerWin() {
    hideFogOverlay();
    destroyWorker();
    this._cleanupMPCallbacks();
    if (isMultiplayer()) cleanupMultiplayer();
    const elapsed = Math.floor(this.time.now / 1000 - this._state.startTime);
    this.scene.start("Win", {
      playerName: this._playerName,
      keysCollected: this._state.keysCollected,
      keysTotal: this._state.keysTotal,
      elapsed,
      bossSpawned: this._state.bossSpawned,
      escaped: this._state.escapedNPCs,
      totalRunners: this._npcs.length,
    });
  }

  _cleanupMPCallbacks() {
    if (isMultiplayer()) {
      MP.onPeerPos = null; MP.onKeyCollected = null; MP.onDoorOpened = null;
      MP.onBossSpawned = null; MP.onPeerCaught = null; MP.onPeerEscaped = null;
      MP.onNpcPositions = null; MP.onNpcCaught = null; MP.onHostCatch = null;
    }
  }

  _showMsg(txt: string, color?: string) {
    const msg = this.add.text(CANVAS_W / 2, CANVAS_H / 2 - 60, txt, {
      fontFamily: "monospace", fontSize: "20px", color: color || "#ffffff"
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150).setAlpha(1);
    this.tweens.add({
      targets: msg, y: msg.y - 40, alpha: 0, duration: 1400,
      onComplete: () => { msg.destroy(); }
    });
  }

  _setupMultiplayer() {
    const level = this._level;
    const state = this._state;
    const player = this._player;
    const fox = this._fox;
    const npcs = this._npcs;
    const exitObj = this._exitObj;

    for (const peerId in MP.players) {
      if (peerId === MP.localPeerId) continue;
      const pData = MP.players[peerId];
      const charName = pData.character || "Naumi";
      const spawnPos = tileCenter(level.playerSpawn.col, level.playerSpawn.row);
      const rp = this.add.image(spawnPos.x, spawnPos.y, charName).setDepth(5).setAlpha(0.8);
      rp.setScale(spriteScaleForHeight(charName, 30));
      const rpTag = this.add.text(spawnPos.x, spawnPos.y - 14, charName, {
        fontFamily: "monospace", fontSize: "9px", color: COLORS[charName] || "#ffffff"
      }).setOrigin(0.5).setDepth(10);
      this._remotePlayers.set(peerId, { sprite: rp, tag: rpTag, targetX: spawnPos.x, targetY: spawnPos.y });
    }

    MP.onPeerPos = (peerId: string, x: number, y: number, vx?: number, vy?: number) => {
      if (peerId === "__fox__" && fox) {
        fox.x += (x - fox.x) * 0.35;
        fox.y += (y - fox.y) * 0.35;
        return;
      }
      if (peerId === "__boss__" && this._bossObj && this._bossObj.active) {
        this._bossObj.x += (x - this._bossObj.x) * 0.35;
        this._bossObj.y += (y - this._bossObj.y) * 0.35;
        return;
      }
      const rp = this._remotePlayers.get(peerId);
      if (rp) {
        rp.targetX = x; rp.targetY = y;
        rp.vx = vx || 0; rp.vy = vy || 0;
      }
    };

    MP.onHostCatch = (catcherName: string) => {
      if (!(player as any)._alive) return;
      this._catchRunner(player, catcherName);
    };

    MP.onKeyCollected = (index) => {
      if (index >= 0 && index < this._keyObjects.length && this._keyObjects[index].active) {
        state.keysCollected++;
        this._keyObjects[index].destroy();
        if (state.keysCollected >= state.keysTotal) {
          exitObj.setTexture("exit");
          exitObj._locked = false;
          this._showMsg("ВЫХОД ОТКРЫТ! БЕГИ!", "#32ff32");
        }
      }
    };

    MP.onDoorOpened = (index) => {
      const doorData = this._lockedDoorObjects[index];
      if (doorData) {
        doorData.barriers.forEach((b: any) => { if (b.active) b.destroy(); });
        doorData.data.doorTiles.forEach((d: any) => {
          const chars = level.rows[d.row].split('');
          chars[d.col] = '.';
          level.rows[d.row] = chars.join('');
          workerUpdateRow(d.row, level.rows[d.row]);
        });
      }
    };

    MP.onBossSpawned = () => {
      if (!state.bossSpawned) this._spawnBoss();
    };

    MP.onPeerCaught = (peerId, catcherName) => {
      const rp = this._remotePlayers.get(peerId);
      if (rp && rp.sprite.active) {
        rp.sprite.setVisible(false);
        rp.tag.setVisible(false);
        this.add.image(rp.sprite.x, rp.sprite.y, "blood").setScale(2.5).setDepth(0);
        this.add.image(rp.sprite.x, rp.sprite.y, "corpse").setScale(2).setDepth(1);
        this._showMsg(rp.tag.text + " пойман!", "#ff5050");
        this.cameras.main.shake(200, 0.01);
      }
    };

    MP.onPeerEscaped = (peerId) => {
      const rp = this._remotePlayers.get(peerId);
      if (rp && rp.sprite.active) {
        rp.sprite.setVisible(false);
        rp.tag.setVisible(false);
        this._showMsg("Союзник сбежал!", "#64ff64");
      }
    };

    MP.onNpcPositions = (npcDataArray) => {
      if (MP.isHost) return;
      npcDataArray.forEach((nd: any) => {
        const npc = npcs.find((n: any) => n._name === nd.name);
        if (npc && npc._alive) {
          npc.x += (nd.x - npc.x) * 0.25;
          npc.y += (nd.y - npc.y) * 0.25;
        }
      });
    };

    MP.onNpcCaught = (npcName, catcherName) => {
      if (MP.isHost) return;
      const npc = npcs.find((n: any) => n._name === npcName);
      if (npc && npc._alive) {
        npc._alive = false;
        npc.setVisible(false);
        if (npc._tag) npc._tag.setVisible(false);
        this.add.image(npc.x, npc.y, "blood").setScale(2.5).setDepth(0);
        this.add.image(npc.x, npc.y, "corpse").setScale(2).setDepth(1);
        state.survivingNPCs = state.survivingNPCs.filter((n: any) => n !== npc);
        this._showMsg(npcName + " пойман!", "#ff5050");
        this.cameras.main.shake(200, 0.01);
      }
    };
  }
}
