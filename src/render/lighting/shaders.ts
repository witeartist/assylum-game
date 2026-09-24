// GLSL for the lighting post-process. Pass 1 builds a low-resolution light map with ray-traced
// wall shadows and the viewer's line of sight; pass 2 multiplies the scene by it and grades
// the image (darkness, film grain, vignette, danger pulse).
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
uniform sampler2D uOcc;      // R: solid tile (nearest)
uniform sampler2D uVis;      // R: visible tile, G: explored tile (linear)
uniform vec2 uMapSize;       // tiles
uniform float uTile;         // world px per tile
uniform float uWallH;        // wall height, world px
uniform vec4 uView;          // visible world rect: x, y, w, h
uniform float uFlipY;
uniform vec2 uViewer;        // eye position, world px
uniform float uSight;        // lamp light fades beyond this distance, world px
uniform float uMemory;       // brightness of remembered (explored, not visible) floor
uniform float uTopLight;     // brightness of wall tops
uniform float uSoft;         // light jitter for soft shadow edges, world px
uniform int uLightCount;
uniform vec4 uLightA[MAX_LIGHTS];   // x, y, radius, intensity
uniform vec4 uLightB[MAX_LIGHTS];   // r, g, b, kind (0 lamp, 1 plain, 2 beam)
uniform vec4 uLightC[MAX_LIGHTS];   // dirX, dirY, cosOuter, cosInner

varying vec2 outTexCoord;

float solidAt(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uMapSize.x || cell.y >= uMapSize.y) return 1.0;
  return texture2D(uOcc, (cell + 0.5) / uMapSize).r;
}

// 1.0 if the segment a→b crosses no solid tile (the tiles of a and b themselves are not tested).
float trace(vec2 a, vec2 b) {
  vec2 p = a / uTile;
  vec2 q = b / uTile;
  vec2 cell = floor(p);
  vec2 end = floor(q);
  vec2 d = q - p;
  vec2 s = vec2(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0);
  vec2 ad = max(abs(d), vec2(1e-5));
  vec2 tDelta = 1.0 / ad;
  vec2 tMax = vec2(
    (s.x > 0.0 ? cell.x + 1.0 - p.x : p.x - cell.x) / ad.x,
    (s.y > 0.0 ? cell.y + 1.0 - p.y : p.y - cell.y) / ad.y);
  for (int i = 0; i < MAX_STEPS; i++) {
    if (min(tMax.x, tMax.y) >= 1.0) return 1.0;
    if (tMax.x < tMax.y) { cell.x += s.x; tMax.x += tDelta.x; }
    else { cell.y += s.y; tMax.y += tDelta.y; }
    if (cell.x == end.x && cell.y == end.y) return 1.0;
    if (solidAt(cell) > 0.5) return 0.0;
  }
  return 1.0;
}

// What the pixel shows (0 floor, 1 wall front, 2 wall top) and the ground point it stands for.
float material(vec2 w, out vec2 g) {
  vec2 cell = floor(w / uTile);
  vec2 capCell = vec2(cell.x, floor((w.y + uWallH) / uTile));
  if (solidAt(capCell) > 0.5) { g = (capCell + 0.5) * uTile; return 2.0; }
  if (solidAt(cell) > 0.5) { g = vec2(w.x, (cell.y + 1.0) * uTile + 0.5); return 1.0; }
  g = w;
  return 0.0;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = outTexCoord;
  vec2 w = uView.xy + vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY)) * uView.zw;
  vec2 g;
  float m = material(w, g);

  if (m > 1.5) {
    vec4 tv = texture2D(uVis, g / uTile / uMapSize);
    float seen = max(tv.r, tv.g * 0.4);
    gl_FragColor = vec4(vec3(uTopLight * seen) * 0.5, 0.0);
    return;
  }

  float explored = texture2D(uVis, w / uTile / uMapSize).g;
  float los = trace(g, uViewer);
  if (los < 0.5) {
    gl_FragColor = vec4(vec3(uMemory * explored) * 0.5, 0.0);
    return;
  }

  float sightFade = 1.0 - smoothstep(uSight * 0.6, uSight * 1.15, length(g - uViewer));
  float jitter = (hash(gl_FragCoord.xy) - 0.5) * uSoft;
  vec3 sum = vec3(0.0);
  float haze = 0.0;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec4 A = uLightA[i];
    vec2 toL = A.xy - g;
    float d = length(toL);
    if (d >= A.z) continue;
    vec4 C = uLightC[i];
    vec2 dir = -toL / max(d, 0.001);
    float cone = smoothstep(C.z, C.w, dot(dir, C.xy));
    if (cone <= 0.0) continue;
    float att = 1.0 - d / A.z;
    att *= att;
    if (m > 0.5) att *= clamp(toL.y / max(d, 1.0) * 1.5 + 0.25, 0.0, 1.0); // wall fronts face south
    vec2 side = vec2(-toL.y, toL.x) / max(d, 0.001);
    float sh = trace(g, A.xy + side * jitter);
    if (sh <= 0.0) continue;
    vec4 B = uLightB[i];
    float k = A.w * att * cone;
    if (B.a < 0.5) k *= sightFade;
    sum += B.rgb * k;
    if (B.a > 1.5) haze += k;
  }
  sum = max(sum, vec3(uMemory * explored));
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
