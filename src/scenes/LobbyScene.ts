import Phaser from "phaser";
import { CANVAS_W } from "../core/constants";
import { settings } from "../core/settings";
import { CHARACTERS, PLAYABLE_IDS, RUNNER_IDS, type CharacterId } from "../data/characters";
import { ROOM_CODE_LENGTH, session } from "../net/session";
import type { GameSceneData } from "./GameScene";
import { difficultyToggles } from "./SelectScene";
import { Button, backLink, button, label, listen, uiCamera } from "../ui/components";
import { INK, TONES } from "../ui/theme";

type Mode = "choose" | "busy" | "typing" | "lobby";

export class LobbyScene extends Phaser.Scene {
  private mode: Mode = "choose";
  private character: CharacterId = RUNNER_IDS[0];
  private code = "";
  private ready = false;

  constructor() { super("Lobby"); }

  create(): void {
    uiCamera(this);
    this.mode = "choose";
    this.character = RUNNER_IDS[0];
    this.code = "";
    this.ready = false;
    const CX = CANVAS_W / 2;

    label(this, CX, 40, "МУЛЬТИПЛЕЕР", "h1", TONES.good.ink);
    label(this, CX, 68, "Сложность:", "small", "#786464");
    difficultyToggles(this, 92, 28);

    const status = label(this, CX, 270, "", "h3", INK.badSoft);
    const room = label(this, CX, 320, "", "body", TONES.warn.ink, { wrap: CANVAS_W * 0.85 });
    const players = label(this, CX, 400, "", "body", INK.goodSoft);
    const typed = label(this, CX, 330, "_", "h1", "#ffffc8").setVisible(false);

    // Character picker: mine highlighted, taken ones dimmed.
    const charY = 460;
    label(this, CX, charY - 20, "Персонаж:", "small", "#786464");
    const charButtons = new Map<CharacterId, Button>();
    PLAYABLE_IDS.forEach((id, i) => {
      const def = CHARACTERS[id];
      const b = button(this, {
        x: CX + (i - (PLAYABLE_IDS.length - 1) / 2) * 80, y: charY, w: 65, h: 30, text: def.name, kind: "tag",
        tone: def.role === "hunter" ? "hunter" : "neutral",
        onClick: () => { this.character = id; if (this.mode === "lobby") session.changeCharacter(id); paintChars(); },
      });
      b.text.setColor(def.color);
      charButtons.set(id, b);
    });
    const paintChars = () => {
      const taken = this.mode === "lobby" ? session.usedCharacters(session.localId ?? undefined) : new Set<CharacterId>();
      charButtons.forEach((b, id) => {
        b.setTone(id === this.character ? "blood" : CHARACTERS[id].role === "hunter" ? "hunter" : "neutral");
        b.setAlpha(taken.has(id) ? 0.4 : 1);
      });
    };
    paintChars();

    const create = button(this, { x: CX, y: 140, w: 200, h: 44, text: "СОЗДАТЬ КОМНАТУ", onClick: () => void hostRoom() });
    const join = button(this, { x: CX, y: 200, w: 200, h: 44, text: "ПРИСОЕДИНИТЬСЯ", onClick: () => startTyping() });
    const start = button(this, { x: CX, y: 540, w: 220, h: 44, text: "▶ НАЧАТЬ ИГРУ", kind: "h3", tone: "good", enabled: false, onClick: () => startGame() }).setVisible(false);
    const readyBtn = button(this, { x: CX, y: 530, w: 180, h: 40, text: "ГОТОВ", kind: "h3", onClick: () => toggleReady() }).setVisible(false);
    const showChoice = (on: boolean) => { create.setVisible(on); join.setVisible(on); };

    listen(this, session.events, "players", list => {
      const entries = Object.values(list);
      players.setText("Игроки (" + entries.length + "): " + entries.map(p => CHARACTERS[p.character].name + (p.ready ? " ✓" : " ✗")).join(", "));
      paintChars();
      if (session.isHost) start.setEnabled(session.allReady());
    });
    listen(this, session.events, "charAssigned", ch => { this.character = ch; paintChars(); });
    listen(this, session.events, "start", info => this.scene.start("Game", { character: this.character, difficulty: info.difficulty } satisfies GameSceneData));
    listen(this, session.events, "hostLost", () => {
      status.setText("Хост закрыл комнату");
      readyBtn.setVisible(false);
      session.leave();
    });

    const hostRoom = async () => {
      if (this.mode !== "choose") return;
      this.mode = "busy";
      showChoice(false);
      status.setText("Создание комнаты...");
      try {
        const code = await session.host(this.character);
        this.mode = "lobby";
        status.setText("Комната создана! Ожидание игроков...");
        room.setText("КОД: " + code + "\n\nСсылка для друзей:\n" + location.origin + location.pathname + "?room=" + code);
        button(this, {
          x: CX, y: 360, w: 180, h: 30, kind: "small", tone: "good", text: "📋 КОПИРОВАТЬ КОД",
          onClick: () => navigator.clipboard.writeText(code).then(() => {
            status.setText("Код скопирован!");
            this.time.delayedCall(1500, () => status.setText("Комната создана! Ожидание игроков..."));
          }).catch(() => undefined),
        });
        start.setVisible(true);
        paintChars();
      } catch (e) {
        status.setText("Ошибка: " + (e as Error).message);
        this.mode = "choose";
        showChoice(true);
      }
    };

    const startTyping = () => {
      if (this.mode !== "choose") return;
      this.mode = "typing";
      showChoice(false);
      status.setText("Введите " + ROOM_CODE_LENGTH + "-символьный код:");
      typed.setVisible(true);
    };

    const joinRoom = async () => {
      this.mode = "busy";
      status.setText("Подключение к " + this.code + "...");
      typed.setVisible(false);
      try {
        await session.join(this.code, this.character);
        this.mode = "lobby";
        status.setText("Подключено! Ожидание хоста...");
        room.setText("Комната: " + this.code);
        readyBtn.setVisible(true);
        paintChars();
      } catch (e) {
        status.setText("Ошибка: " + (e as Error).message);
        this.mode = "typing";
        typed.setVisible(true);
      }
    };

    const toggleReady = () => {
      this.ready = !this.ready;
      session.setReady(this.ready);
      readyBtn.setTone(this.ready ? "good" : "blood").setText(this.ready ? "✓ ГОТОВ" : "ГОТОВ");
    };

    const startGame = () => {
      if (this.mode !== "lobby" || !session.isHost || !session.allReady()) return;
      const info = session.startGame(settings.difficulty);
      this.scene.start("Game", { character: this.character, difficulty: info.difficulty } satisfies GameSceneData);
    };

    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => {
      if (this.mode !== "typing") return;
      if (ev.key === "Backspace") this.code = this.code.slice(0, -1);
      else if (ev.key === "Enter" && this.code.length === ROOM_CODE_LENGTH) { void joinRoom(); return; }
      else if (ev.key.length === 1 && this.code.length < ROOM_CODE_LENGTH) this.code += ev.key.toUpperCase();
      typed.setText(this.code + "_");
    });

    // Invite link: ?room=CODE joins straight away (once — the parameter is removed).
    const invited = new URLSearchParams(location.search).get("room");
    if (invited) {
      history.replaceState(null, "", location.pathname);
      this.code = invited.toUpperCase();
      showChoice(false);
      void joinRoom();
    }

    backLink(this, () => { session.leave(); this.scene.start("Menu"); });
  }
}
