export interface Tile { col: number; row: number; }
export interface Vec2 { x: number; y: number; }

/** A runner, or the villain (an infected hero, see data/characters.ts). */
export type Role = "runner" | "hunter";

/** Where a runner is in the round. "left" = disconnected (multiplayer only). */
export type RunnerStatus = "alive" | "caught" | "escaped" | "left";
