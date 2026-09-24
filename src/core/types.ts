export interface Tile { col: number; row: number; }
export interface Vec2 { x: number; y: number; }

export type Role = "runner" | "hunter" | "boss";

/** Where a runner is in the round. "left" = disconnected (multiplayer only). */
export type RunnerStatus = "alive" | "caught" | "escaped" | "left";
