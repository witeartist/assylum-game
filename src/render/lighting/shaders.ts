// GLSL for the lighting post-process. Pass 1 builds a low-resolution light map with ray-traced
// wall shadows and the viewer's line of sight, per pixel — whatever the viewer can't see, or no
// light reaches, is black. Pass 2 multiplies the scene by it and grades the image (darkness,
// film grain, vignette, danger pulse).
export const MAX_LIGHTS = 16;
const MAX_STEPS = 40;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const LIGHT_FRAG = `#define SHADER_NAME ASSYLUM_LIGHT
${PRECISION}
#define MAX_LIGHTS ${MAX_LIGHTS}
#define MAX_STEPS ${MAX_STEPS}

uniform sampler2D uMainSampler;
uniform sampler2D uOcc;      // R: 1 wall, 0.6 door (solid, but lit like a wall front), 0 open; G: shape (walls.ts)
uniform vec2 uMapSize;       // tiles
uniform float uTile;         // world px per tile
uniform float uWallH;        // wall height, world px
uniform float uThin;         // thin wall thickness, tiles
uniform vec4 uView;          // visible world rect: x, y, w, h
uniform float uFlipY;
uniform vec2 uViewer;        // eye position, world px
uniform float uSight;        // lamp light fades beyond this distance, world px
uniform float uTopLight;     // brightness of wall tops
uniform float uThinTop;      // brightness of thin wall tops (partitions stay legible)
uniform vec3 uAmbient;       // light everywhere, even out of sight: 0 in play (screenshots only)
uniform float uPhoto;        // 1 = screenshot mode: light every room, not only what the viewer sees
uniform float uSoft;         // light jitter for soft shadow edges, world px
uniform int uLightCount;
uniform vec4 uLightA[MAX_LIGHTS];   // x, y, radius, intensity
uniform vec4 uLightB[MAX_LIGHTS];   // r, g, b, kind (0 lamp, 1 plain, 2 beam)
uniform vec4 uLightC[MAX_LIGHTS];   // dirX, dirY, cosOuter, cosInner

varying vec2 outTexCoord;

// x: solid (1 wall, 0.6 door, 0 open), y: shape code (0 whole tile, 16 + arms thin wall).
vec2 occAt(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uMapSize.x || cell.y >= uMapSize.y) return vec2(1.0, 0.0);
  vec4 t = texture2D(uOcc, (cell + 0.5) / uMapSize);
  return vec2(t.r, floor(t.g * 255.0 + 0.5));
}

// Bands of a thin wall in cell-local tiles (x0, y0, x1, y1), as in walls.ts: h runs west–east
// along the bottom, v north–south through the middle; a missing band is empty (x0 > x1).
void thinBands(float code, out vec4 h, out vec4 v) {
  float arms = code - 16.0;
  float n = mod(arms, 2.0), e = mod(floor(arms / 2.0), 2.0), s = mod(floor(arms / 4.0), 2.0), w = floor(arms / 8.0);
  float across = max(e, w), along = max(n, s);
  float m0 = 0.5 - uThin * 0.5, m1 = 0.5 + uThin * 0.5, top = 1.0 - uThin;
  h = across > 0.5 ? vec4(w > 0.5 ? 0.0 : (along > 0.5 ? m0 : 0.0), top, e > 0.5 ? 1.0 : (along > 0.5 ? m1 : 1.0), 1.0) : vec4(1.0, 1.0, -1.0, -1.0);
  v = along > 0.5 ? vec4(m0, n > 0.5 ? 0.0 : (across > 0.5 ? top : 0.0), m1, 1.0) : vec4(1.0, 1.0, -1.0, -1.0);
}

bool inBox(vec2 p, vec4 b) { return p.x >= b.x && p.x <= b.z && p.y >= b.y && p.y <= b.w; }

// Does the segment p + t·d (t in 0..1) touch box b?
bool segBox(vec2 p, vec2 d, vec4 b) {
  if (b.x > b.z) return false;
  vec2 dd = vec2(abs(d.x) < 1e-4 ? 1e-4 : d.x, abs(d.y) < 1e-4 ? 1e-4 : d.y);
  vec2 t0 = (b.xy - p) / dd, t1 = (b.zw - p) / dd;
  vec2 lo = min(t0, t1), hi = max(t0, t1);
  return max(max(lo.x, lo.y), 0.0) <= min(min(hi.x, hi.y), 1.0);
}

// 1.0 if the segment a→b (world px) crosses no wall; a starts on open floor. A whole solid cell
// blocks, except the cells of the end points; a thin wall blocks where its band is, unless the
// band holds an end point (a lamp hangs on a wall).
float trace(vec2 a, vec2 b) {
  vec2 p = a / uTile;
  vec2 q = b / uTile;
  vec2 d = q - p;
  vec2 cell = floor(p);
  vec2 end = floor(q);
  vec2 s = vec2(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0);
  vec2 ad = max(abs(d), vec2(1e-5));
  vec2 tDelta = 1.0 / ad;
  vec2 tMax = vec2(
    (s.x > 0.0 ? cell.x + 1.0 - p.x : p.x - cell.x) / ad.x,
    (s.y > 0.0 ? cell.y + 1.0 - p.y : p.y - cell.y) / ad.y);
  for (int i = 0; i < MAX_STEPS; i++) {
    bool last = cell.x == end.x && cell.y == end.y;
    vec2 o = occAt(cell);
    if (o.x > 0.3) {
      if (o.y < 15.5) {
        if (i > 0 && !last) return 0.0;
      } else {
        vec4 h, v;
        thinBands(o.y, h, v);
        vec2 lp = p - cell, lq = q - cell;
        if (!inBox(lp, h) && !(last && inBox(lq, h)) && segBox(lp, d, h)) return 0.0;
        if (!inBox(lp, v) && !(last && inBox(lq, v)) && segBox(lp, d, v)) return 0.0;
      }
    }
    if (last || min(tMax.x, tMax.y) >= 1.0) return 1.0;
    if (tMax.x < tMax.y) { cell.x += s.x; tMax.x += tDelta.x; }
    else { cell.y += s.y; tMax.y += tDelta.y; }
  }
  return 1.0;
}

// Solid at ground point p (world px): the cell's value, or 0 beside the bands of a thin wall.
// thin: set to 1 if p is in the tile of a thin wall.
float solidAt(vec2 p, out float thin) {
  vec2 cell = floor(p / uTile);
  vec2 o = occAt(cell);
  thin = 0.0;
  if (o.x < 0.3 || o.y < 15.5) return o.x;
  vec4 h, v;
  thinBands(o.y, h, v);
  vec2 l = p / uTile - cell;
  thin = 1.0;
  return inBox(l, h) || inBox(l, v) ? o.x : 0.0;
}

// A wall top at ground point g is seen and lit like the floor right beside its wall, on the side
// facing the other point: across the north or south face of a wall running west–east, across the
// west or east face of one running north–south (a block or a corner: either). Never through the
// wall it stands on, so its top is lit evenly; and a wall that bounds other rooms stays dark.
float traceTop(vec2 g, vec2 to) {
  vec2 cell = floor(g / uTile);
  vec2 o = occAt(cell);
  vec2 lo = cell * uTile;
  float y0 = lo.y, y1 = lo.y + uTile, x0 = lo.x, x1 = lo.x + uTile;
  bool acrossY = true, acrossX = true;
  if (o.y > 15.5) {
    vec4 h, v;
    thinBands(o.y, h, v);
    vec2 l = g / uTile - cell;
    acrossY = inBox(l, h);
    acrossX = inBox(l, v);
    y0 = lo.y + h.y * uTile; y1 = lo.y + h.w * uTile;
    x0 = lo.x + v.x * uTile; x1 = lo.x + v.z * uTile;
  }
  float thin;
  float seen = 0.0;
  if (acrossY) {
    vec2 c = vec2(g.x, to.y < g.y ? y0 - 0.5 : y1 + 0.5);
    if (solidAt(c, thin) < 0.3) seen = trace(c, to);
  }
  if (seen < 0.5 && acrossX) {
    vec2 c = vec2(to.x < g.x ? x0 - 0.5 : x1 + 0.5, g.y);
    if (solidAt(c, thin) < 0.3) seen = trace(c, to);
  }
  return seen;
}

// What the pixel shows (0 floor, 1 wall front, 2 wall top, 2.5 thin wall top) and the ground
// point it stands for.
float material(vec2 w, out vec2 g) {
  vec2 raised = vec2(w.x, w.y + uWallH);
  float thin;
  float cap = solidAt(raised, thin);
  // Wall top: lit and seen like the floor right under it (per pixel, so no square edges).
  if (cap > 0.8) { g = raised; return 2.0 + thin * 0.5; }
  if (cap > 0.3) { g = vec2(w.x, (floor(raised.y / uTile) + 1.0) * uTile + 0.5); return 1.0; }
  // Front face: the lowest uWallH px above the floor line of a wall standing on open floor.
  float base = (floor(w.y / uTile) + 1.0) * uTile;
  if (raised.y >= base && solidAt(vec2(w.x, base - 0.5), thin) > 0.3) { g = vec2(w.x, base + 0.5); return 1.0; }
  g = w;
  return 0.0;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Light arriving at ground point g from one light (no shadow test). A: x, y, radius, intensity;
// C: cone; lamp: 1 for lamps (they fade with view distance).
float lightFrom(vec4 A, vec4 C, float lamp, vec2 g, float m, float sightFade) {
  vec2 toL = A.xy - g;
  float d = length(toL);
  if (d >= A.z) return 0.0;
  vec2 dir = -toL / max(d, 0.001);
  float cone = smoothstep(C.z, C.w, dot(dir, C.xy));
  float att = 1.0 - d / A.z;
  att *= att;
  if (m > 0.5 && m < 1.5) att *= clamp(toL.y / max(d, 1.0) * 1.5 + 0.25, 0.0, 1.0); // wall fronts face south
  float k = A.w * att * cone;
  if (lamp > 0.5) k *= sightFade;
  return k;
}

void main() {
  vec2 uv = outTexCoord;
  vec2 w = uView.xy + vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY)) * uView.zw;
  vec2 g;
  float m = material(w, g);
  float sightFade = uPhoto > 0.5 ? 1.0 : 1.0 - smoothstep(uSight * 0.7, uSight * 1.2, length(g - uViewer));
  vec3 sum = vec3(0.0);

  // Out of the viewer's line of sight: nothing at all. (A wall top shows if the floor beside its
  // wall on the viewer's side is in sight: the whole top of a wall facing the viewer, never cut
  // into squares, while walls that bound other rooms stay black.)
  bool isTop = m > 1.5;
  float top = m > 2.25 ? uThinTop : isTop ? uTopLight : 1.0;
  if (uPhoto < 0.5 && (isTop ? traceTop(g, uViewer) : trace(g, uViewer)) < 0.5) { gl_FragColor = vec4(uAmbient * top * 0.5, 0.0); return; }

  float jitter = (hash(gl_FragCoord.xy) - 0.5) * uSoft;
  float haze = 0.0;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec4 A = uLightA[i];
    vec4 B = uLightB[i];
    float k = lightFrom(A, uLightC[i], B.a < 0.5 ? 1.0 : 0.0, g, m, sightFade);
    if (k <= 0.0) continue;
    vec2 toL = A.xy - g;
    vec2 side = vec2(-toL.y, toL.x) / max(length(toL), 0.001);
    vec2 at = A.xy + side * jitter;
    if ((isTop ? traceTop(g, at) : trace(g, at)) <= 0.0) continue;
    sum += B.rgb * k;
    if (B.a > 1.5 && m < 0.5) haze += k;
  }
  sum += uAmbient;
  sum *= top;
  gl_FragColor = vec4(sum * 0.5, clamp(haze, 0.0, 1.0));
}
`;

export const COMPOSITE_FRAG = `#define SHADER_NAME ASSYLUM_COMPOSITE
${PRECISION}
uniform sampler2D uMainSampler;
uniform sampler2D uLight;
uniform vec2 uTexel;        // one scene pixel in uv
uniform vec2 uLightTexel;   // one light-map texel in uv
uniform float uTime;
uniform float uDanger;      // 0..1: a hunter is close
uniform float uPost;        // 0/1: grain, aberration, glow
uniform vec2 uViewerUv;     // viewer on screen (uv), for relief lighting
uniform float uAspect;
uniform float uFlipY;
uniform vec3 uHaze;

varying vec2 outTexCoord;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  vec2 fromC = uv - 0.5;
  float ca = uPost * (0.0012 + uDanger * 0.006) * dot(fromC, fromC) * 4.0;
  vec3 col = vec3(
    texture2D(uMainSampler, uv - fromC * ca).r,
    texture2D(uMainSampler, uv).g,
    texture2D(uMainSampler, uv + fromC * ca).b);

  vec4 lm = texture2D(uLight, uv);
  vec3 L = lm.rgb * 2.0;

  // Relief: treat albedo brightness as a height map lit from the viewer (strongest in the beam).
  float lx = luma(texture2D(uMainSampler, uv + vec2(uTexel.x, 0.0)).rgb) - luma(texture2D(uMainSampler, uv - vec2(uTexel.x, 0.0)).rgb);
  float ly = luma(texture2D(uMainSampler, uv + vec2(0.0, uTexel.y)).rgb) - luma(texture2D(uMainSampler, uv - vec2(0.0, uTexel.y)).rgb);
  vec3 n = normalize(vec3(-lx * 4.0, -ly * 4.0 * (uFlipY > 0.5 ? -1.0 : 1.0), 1.0));
  vec2 toV = (uViewerUv - uv) * vec2(uAspect, 1.0);
  vec3 ldir = normalize(vec3(toV, 0.25));
  float relief = mix(1.0, clamp(dot(n, ldir) * 1.3, 0.35, 1.7), clamp(lm.a * 1.5 + 0.25, 0.0, 1.0));

  vec3 lit = col * L * relief;

  if (uPost > 0.5) {
    // Light bleeding into the air around bright spots.
    vec3 glow = texture2D(uLight, uv + vec2(uLightTexel.x * 4.0, 0.0)).rgb + texture2D(uLight, uv - vec2(uLightTexel.x * 4.0, 0.0)).rgb
      + texture2D(uLight, uv + vec2(0.0, uLightTexel.y * 4.0)).rgb + texture2D(uLight, uv - vec2(0.0, uLightTexel.y * 4.0)).rgb;
    lit += glow * 0.035;
  }
  lit += uHaze * lm.a * 0.07;

  // Darkness is colourless and a little blue.
  float l = luma(L);
  lit = mix(vec3(luma(lit)) * vec3(0.8, 0.92, 1.12), lit, smoothstep(0.04, 0.55, l));
  lit = max(lit * 1.06 - 0.008, 0.0);

  // Vignette, tighter and pulsing red when a hunter is near.
  float r = length(fromC * vec2(uAspect, 1.0));
  float vig = 1.0 - smoothstep(0.35 - uDanger * 0.12, 0.95, r);
  float pulse = uDanger * (0.55 + 0.45 * sin(uTime * 6.5));
  lit *= mix(1.0, vig, 0.8);
  lit = mix(lit, lit * vec3(1.35, 0.55, 0.55) + vec3(0.05, 0.0, 0.0), pulse * 0.4 * (1.0 - vig));

  lit += (rand(uv * 971.3 + fract(uTime * 13.7)) - 0.5) * 0.05 * uPost;
  gl_FragColor = vec4(lit, 1.0);
}
`;
