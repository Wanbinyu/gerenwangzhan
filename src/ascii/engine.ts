/**
 * ASCII engine modeled on contentarchitecture.dev:
 * - Glyph atlas (monospace, 12 brightness rows)
 * - Phrase wallpaper (tiled copy, low-contrast)
 * - Image → glyph field (luminance mapping)
 * - Click-and-hold hero mix
 * - Page-transition curtain (canvas 2d, original algorithm)
 *
 * Large fields render through WebGL (one textured quad).
 * Photo overlays use canvas 2d fillText, matching the original hover fade.
 */

export const PHRASE_ATLAS =
  " .ACEHINORTU0123456789!@#$%^&*+BDFGJKLMPQSVWXYZ,:-?'abcdefghijklmnopqrstuvwxyz";
export const CURTAIN_ATLAS = "01<>[]{}()/\\|=+*#%&$@!?;:.~01ABCDEF0123456789";
export const DENSITY_ATLAS = " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
export const WALL_ATLAS =
  " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-'/#+*";

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export function createGlyphAtlas(
  charset: string,
  color: string,
  cellW: number,
  cellH: number,
  dpr = Math.min(window.devicePixelRatio || 1, 2),
): { canvas: HTMLCanvasElement; cellW: number; cellH: number; charset: string } {
  const cw = Math.ceil(cellW * dpr);
  const ch = Math.ceil(cellH * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = cw * charset.length;
  canvas.height = ch * 12;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, cellW: cw, cellH: ch, charset };
  ctx.font = `${Math.round(cellH * 0.86 * dpr)}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  for (let row = 0; row < 12; row++) {
    ctx.globalAlpha = (row + 1) / 12;
    const y = row * ch + ch / 2;
    for (let i = 0; i < charset.length; i++) {
      ctx.fillText(charset[i] ?? "0", i * cw + cw / 2, y);
    }
  }
  ctx.globalAlpha = 1;
  return { canvas, cellW: cw, cellH: ch, charset };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log ?? "compile");
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram();
  if (!p) throw new Error("program");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "link");
  }
  return p;
}

const VS = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0); }
`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform sampler2D uIndex;
uniform sampler2D uSource;
uniform vec2 uGrid;
uniform vec2 uRes;
uniform vec2 uAtlasSize;
uniform vec2 uCellPx;
uniform vec3 uBg;
uniform vec3 uFg;
uniform float uTime;
uniform float uHold;
uniform float uMode; // 0 wallpaper, 1 image, 2 hero mix
uniform float uFlicker;
uniform float uInvert;
out vec4 fragColor;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  vec2 pixel = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(pixel / uCellPx);
  if (cell.x >= uGrid.x || cell.y >= uGrid.y) { fragColor = vec4(uBg, 1.0); return; }

  vec2 cellUv = (cell + 0.5) / uGrid;
  vec2 local = fract(pixel / uCellPx);

  float idxByte = texture(uIndex, cellUv).r * 255.0;
  float lum = texture(uSource, cellUv).r;
  if (uInvert > 0.5) lum = 1.0 - lum;

  float seed = hash(cell + 17.0);
  float flicker = 0.35 + 0.5 * (0.5 + 0.5 * sin(uTime * 0.004 + seed * 6.28318));
  float flash = step(0.947, fract(seed + floor((uTime + seed * 200.0) / (70.0 + seed * 120.0)) * 0.019));

  float bright;
  float gi;
  if (uMode < 0.5) {
    bright = clamp(lum * 0.28 + 0.12 + (seed - 0.5) * 0.05, 0.04, 0.55);
    gi = idxByte;
  } else if (uMode < 1.5) {
    bright = clamp(lum, 0.0, 1.0);
    gi = floor(lum * (uAtlasSize.x - 1.0) + 0.5);
  } else {
    float phraseB = 0.10 + lum * 0.22 + (seed - 0.5) * 0.04;
    float imageB = clamp(lum * 0.92, 0.0, 1.0);
    bright = mix(phraseB, imageB, uHold);
    gi = mix(idxByte, floor(lum * (uAtlasSize.x - 1.0) + 0.5), uHold);
  }

  bright *= mix(flicker, 1.0, flash * uFlicker);
  int row = int(clamp(floor(bright * 12.0), 0.0, 11.0));
  int col = int(clamp(floor(gi + 0.5), 0.0, uAtlasSize.x - 1.0));

  vec2 atlasUv = (vec2(float(col), float(row)) + local) / uAtlasSize;
  float g = texture(uAtlas, atlasUv).a;
  vec3 colr = mix(uBg, uFg, g);
  fragColor = vec4(colr, 1.0);
}
`;

function tex(gl: WebGL2RenderingContext, img: TexImageSource, filter = gl.NEAREST) {
  const t = gl.createTexture();
  if (!t) throw new Error("tex");
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  return t;
}

function indexTexture(
  gl: WebGL2RenderingContext,
  cols: number,
  rows: number,
  phrase: string,
  atlas: string,
) {
  const data = new Uint8Array(cols * rows * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = phrase[(y * cols + x) % phrase.length] ?? " ";
      let gi = atlas.indexOf(ch);
      if (gi < 0) gi = atlas.indexOf(ch.toUpperCase());
      if (gi < 0) gi = 0;
      const i = (y * cols + x) * 4;
      data[i] = gi;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const t = gl.createTexture();
  if (!t) throw new Error("idx");
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return t;
}

function sourceFromCanvas(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
  return tex(gl, canvas, gl.LINEAR);
}

export function paintNoiseField(w: number, h: number, seed = 1) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < w * h; i++) {
    const n = rnd();
    const v = Math.floor(40 + n * 90);
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function paintFacade(w = 640, h = 800) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, w, h);
  const cols = 9;
  const rows = 14;
  const m = 28;
  const gw = (w - m * 2) / cols;
  const gh = (h - m * 2) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = Math.random() > 0.38;
      const v = lit ? 210 + Math.random() * 40 : 18 + Math.random() * 22;
      ctx.fillStyle = `rgb(${v},${v * 0.96},${v * 0.88})`;
      const pad = 6 + Math.random() * 3;
      ctx.fillRect(m + x * gw + pad, m + y * gh + pad, gw - pad * 2, gh - pad * 2);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  return c;
}

export function paintInterior(w = 960, h = 540) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1a1a1a");
  g.addColorStop(1, "#5a5348");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d8d0c4";
  ctx.fillRect(w * 0.12, h * 0.18, w * 0.76, h * 0.54);
  ctx.fillStyle = "#232323";
  ctx.fillRect(w * 0.18, h * 0.26, w * 0.28, h * 0.38);
  ctx.fillStyle = "#c4b8a6";
  ctx.fillRect(w * 0.52, h * 0.3, w * 0.28, h * 0.12);
  ctx.fillStyle = "#8a8378";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 80, 2);
  }
  return c;
}

type Mode = 0 | 1 | 2;

export type AsciiField = {
  canvas: HTMLCanvasElement;
  setHold: (v: number) => void;
  setSource: (img: TexImageSource) => void;
  destroy: () => void;
};

export function mountAsciiField(
  canvas: HTMLCanvasElement,
  opts: {
    phrase: string;
    atlas?: string;
    fg?: string;
    bg?: string;
    mode?: Mode;
    cellW?: number;
    cellH?: number;
    source?: HTMLCanvasElement;
    flicker?: boolean;
  },
): AsciiField {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 required");

  const atlasStr = opts.atlas ?? PHRASE_ATLAS;
  const fg = opts.fg ?? "#c8c4bc";
  const bg = opts.bg ?? "#232323";
  const mode: Mode = opts.mode ?? 0;
  const cellW = opts.cellW ?? 8;
  const cellH = opts.cellH ?? 14;
  let hold = 0;

  const prog = program(gl, VS, FS);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  gl.useProgram(prog);

  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ] as const;
  };
  const fgv = parse(fg.length === 7 ? fg : "#c8c4bc");
  const bgv = parse(bg.length === 7 ? bg : "#232323");

  let atlasTex: WebGLTexture | null = null;
  let indexTex: WebGLTexture | null = null;
  let sourceTex: WebGLTexture | null = null;
  let cols = 1;
  let rows = 1;
  let atlasMeta = { cellW: 1, cellH: 1, charset: atlasStr, canvas: document.createElement("canvas") };
  let raf = 0;
  let alive = true;

  const sourceCanvas = opts.source ?? paintNoiseField(256, 256, 3);

  const layout = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    cols = Math.max(1, Math.round(w / cellW));
    rows = Math.max(1, Math.round(h / cellH));
    atlasMeta = createGlyphAtlas(atlasStr, fg, w / cols, h / rows, dpr);
    if (atlasTex) gl.deleteTexture(atlasTex);
    if (indexTex) gl.deleteTexture(indexTex);
    if (sourceTex) gl.deleteTexture(sourceTex);
    atlasTex = tex(gl, atlasMeta.canvas);
    indexTex = indexTexture(gl, cols, rows, opts.phrase, atlasStr);
    sourceTex = sourceFromCanvas(gl, sourceCanvas);
  };

  layout();
  const ro = new ResizeObserver(() => layout());
  ro.observe(canvas);

  const draw = (t: number) => {
    if (!alive) return;
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(loc("uAtlas"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, indexTex);
    gl.uniform1i(loc("uIndex"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.uniform1i(loc("uSource"), 2);
    gl.uniform2f(loc("uGrid"), cols, rows);
    gl.uniform2f(loc("uRes"), canvas.width, canvas.height);
    gl.uniform2f(loc("uAtlasSize"), atlasStr.length, 12);
    gl.uniform2f(loc("uCellPx"), canvas.width / cols, canvas.height / rows);
    gl.uniform3f(loc("uBg"), bgv[0], bgv[1], bgv[2]);
    gl.uniform3f(loc("uFg"), fgv[0], fgv[1], fgv[2]);
    gl.uniform1f(loc("uTime"), t);
    gl.uniform1f(loc("uHold"), hold);
    gl.uniform1f(loc("uMode"), mode);
    gl.uniform1f(loc("uFlicker"), opts.flicker === false ? 0 : 1);
    gl.uniform1f(loc("uInvert"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return {
    canvas,
    setHold: (v) => {
      hold = clamp01(v);
    },
    setSource: (img) => {
      if (sourceTex) gl.deleteTexture(sourceTex);
      sourceTex = tex(gl, img, gl.LINEAR);
    },
    destroy: () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}

export function offsetField(cols: number, rows: number) {
  const grid = new Float32Array(35);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const out = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = (x / cols) * 6;
      const u = (y / rows) * 4;
      const d = Math.floor(c);
      const p = Math.floor(u);
      const m = smoothstep(c - d);
      const f = smoothstep(u - p);
      const v = 7 * p + d;
      const g = lerp(grid[v] ?? 0, grid[v + 1] ?? 0, m);
      const w = lerp(grid[v + 7] ?? 0, grid[v + 8] ?? 0, m);
      const s = lerp(g, w, f) + (Math.random() - 0.5) * 0.08;
      out[y * cols + x] = s;
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
  }
  const span = max - min || 1;
  const h = new Float32Array(cols * rows);
  for (let i = 0; i < out.length; i++) h[i] = ((out[i] ?? 0) - min) / span * 0.88;
  return h;
}

export function mountCurtain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { cover: async () => {}, reveal: async () => {}, destroy: () => {} };

  type Grid = ReturnType<typeof build>;
  const build = (): {
    cols: number;
    rows: number;
    cellW: number;
    cellH: number;
    width: number;
    height: number;
    bg: string;
    coverOffsets: Float32Array;
    revealOffsets: Float32Array;
    seeds: Uint16Array;
    flicker: Float32Array;
    atlas: ReturnType<typeof createGlyphAtlas> | null;
  } => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = window.innerWidth;
    const s = window.innerHeight;
    canvas.width = Math.round(r * dpr);
    canvas.height = Math.round(s * dpr);
    canvas.style.width = `${r}px`;
    canvas.style.height = `${s}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.max(1, Math.round(r / 12));
    const rows = Math.max(1, Math.round(s / 17));
    const cellW = r / cols;
    const cellH = s / rows;
    const cs = getComputedStyle(canvas);
    const bg = cs.getPropertyValue("--ascii-transition-bg").trim() || "#000000";
    const fg = cs.getPropertyValue("--ascii-transition-color").trim() || "#ffffff";
    const m = cols * rows;
    const seeds = new Uint16Array(m);
    const flicker = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      seeds[i] = Math.floor(65536 * Math.random());
      flicker[i] = 70 + 120 * Math.random();
    }
    return {
      cols,
      rows,
      cellW,
      cellH,
      width: r,
      height: s,
      bg,
      coverOffsets: offsetField(cols, rows),
      revealOffsets: offsetField(cols, rows),
      seeds,
      flicker,
      atlas: createGlyphAtlas(CURTAIN_ATLAS, fg, cellW, cellH, dpr),
    };
  };

  let grid = build();
  let raf = 0;

  const frame = (phase: "cover" | "reveal", progress: number, now: number) => {
    const { cols, rows, cellW, cellH, width, height, bg, seeds, flicker, atlas } = grid;
    const offsets = phase === "cover" ? grid.coverOffsets : grid.revealOffsets;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    if (phase === "cover" && progress >= 1) {
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.beginPath();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n = clamp01((progress - (offsets[y * cols + x] ?? 0)) * 8.333333333333334);
          const vis = phase === "cover" ? n : 1 - n;
          if (vis >= 0.35) {
            ctx.rect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
          }
        }
      }
      ctx.fill();
    }
    if (!atlas) return;
    const b = CURTAIN_ATLAS.length;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const u = clamp01((progress - (offsets[i] ?? 0)) * 8.333333333333334);
        const d = phase === "cover" ? u : 1 - u;
        if (d <= 0.02) continue;
        const p = seeds[i] ?? 0;
        const m = Math.floor((now + p) / (flicker[i] || 100));
        const f = (p + m) % 19 === 0;
        const R = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(0.004 * now + p));
        let T = Math.floor(clamp01(u > 0 && u < 1 || f ? 1 : R) * clamp01(1.3 * d) * 12);
        if (T <= 0) continue;
        if (T >= 12) T = 11;
        const M = (p + m) % b;
        ctx.drawImage(
          atlas.canvas,
          M * atlas.cellW,
          T * atlas.cellH,
          atlas.cellW,
          atlas.cellH,
          x * cellW,
          y * cellH,
          cellW,
          cellH,
        );
      }
    }
  };

  const run = (phase: "cover" | "reveal", ms: number) =>
    new Promise<void>((resolve) => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = reduced ? 180 : ms;
      const start = performance.now();
      const tick = (now: number) => {
        const t = clamp01((now - start) / dur);
        if (reduced) {
          ctx.globalAlpha = phase === "cover" ? t : 1 - t;
          ctx.fillStyle = grid.bg;
          ctx.clearRect(0, 0, grid.width, grid.height);
          ctx.fillRect(0, 0, grid.width, grid.height);
          ctx.globalAlpha = 1;
        } else {
          frame(phase, t, now);
        }
        if (t >= 1) {
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

  const onResize = () => {
    grid = build();
  };
  window.addEventListener("resize", onResize);

  return {
    cover: () => {
      grid = build();
      return run("cover", 720);
    },
    reveal: () => run("reveal", 720),
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    },
  };
}

export function mountImageAscii(
  wrap: HTMLElement,
  img: HTMLImageElement | HTMLCanvasElement,
  charset = DENSITY_ATLAS,
) {
  const canvas = document.createElement("canvas");
  canvas.className =
    "pointer-events-none absolute inset-0 size-full transition-opacity duration-500 ease-out motion-reduce:transition-none group-hover:opacity-0";
  wrap.appendChild(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#232323";
    ctx.fillRect(0, 0, w, h);

    const cell = 7;
    const cols = Math.max(1, Math.round(w / cell));
    const rows = Math.max(1, Math.round(h / (cell * 1.7)));
    const cw = w / cols;
    const ch = h / rows;

    const sample = document.createElement("canvas");
    sample.width = cols;
    sample.height = rows;
    const sctx = sample.getContext("2d");
    if (!sctx) return;
    sctx.drawImage(img, 0, 0, cols, rows);
    const data = sctx.getImageData(0, 0, cols, rows).data;

    ctx.font = `${Math.round(ch * 0.86)}px "Geist Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e8e4dc";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const lum = ((data[i] ?? 0) * 0.2126 + (data[i + 1] ?? 0) * 0.7152 + (data[i + 2] ?? 0) * 0.0722) / 255;
        const gi = Math.min(charset.length - 1, Math.floor(lum * charset.length));
        ctx.globalAlpha = 0.35 + lum * 0.65;
        ctx.fillText(charset[gi] ?? " ", (x + 0.5) * cw, (y + 0.5) * ch);
      }
    }
    ctx.globalAlpha = 1;
  };

  const ro = new ResizeObserver(draw);
  ro.observe(wrap);
  if (img instanceof HTMLImageElement) {
    if (img.complete) draw();
    else img.addEventListener("load", draw, { once: true });
  } else {
    draw();
  }
  return () => ro.disconnect();
}
