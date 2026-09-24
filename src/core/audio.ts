// Background music. One looping track for now; layered music comes with the sound stage.
import { MUSIC } from "../data/assets";
import { settings, updateSettings } from "./settings";

let music: HTMLAudioElement | null = null;

export function playMusic(): void {
  if (!music) {
    music = new Audio(MUSIC.main);
    music.loop = true;
  }
  music.volume = settings.musicVolume;
  music.play().catch(() => { /* autoplay blocked until the first user gesture */ });
}

export function setMusicVolume(v: number): void {
  updateSettings({ musicVolume: v });
  if (music) music.volume = v;
}
