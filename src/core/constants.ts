// World and screen dimensions. Gameplay code works in world pixels (TILE per tile);
// visual scale is a camera concern, so these never need to change for new art.
export const TILE = 32;
export const MAP_W = 80;
export const MAP_H = 50;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const CANVAS_W = 960;
export const CANVAS_H = 600;

/** Height of walls in the 3/4 view, world px: the top is drawn this much above the footprint. */
export const WALL_HEIGHT = TILE / 2;
