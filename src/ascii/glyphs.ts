/** Canvas 2D glyph field — same method as the original: fillText on a cell grid. */

export const WALL_ATLAS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-'/+*#";
export const DENSITY_ATLAS = " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

function sample(img: CanvasImageSource, cols: number, rows: number) {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(cols * rows);
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const o = i * 4;
    out[i] = ((data[o] ?? 0) * 0.2126 + (data[o + 1] ?? 0) * 0.7152 + (data[o + 2] ?? 0) * 0.0722) / 255;
  }
  return out;
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dw: number,
  dh: number,
  ax = 0.58,
  ay = 0.48,
) {
  const iw =
    "naturalWidth" in img
      ? (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width
      : (img as HTMLCanvasElement).width;
  const ih =
    "naturalHeight" in img
      ? (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height
      : (img as HTMLCanvasElement).height;
  if (!iw || !ih) {
    ctx.drawImage(img, 0, 0, dw, dh);
    return;
  }
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * ax));
  const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * ay));
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
}

function sampleHero(img: CanvasImageSource, cols: number, rows: number) {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const n = cols * rows;
  const lum = new Float32Array(n);
  const edge = new Float32Array(n);
  const kind = new Uint8Array(n);
  if (!ctx) return { lum, edge, kind };
  ctx.filter = "contrast(1.55) saturate(1.2) brightness(1.12)";
  coverDraw(ctx, img, cols, rows);
  ctx.filter = "none";
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = (data[o] ?? 0) / 255;
    const g = (data[o + 1] ?? 0) / 255;
    const b = (data[o + 2] ?? 0) / 255;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const warm = r - b;
    let mapped = Math.max(0, Math.min(1, (y - 0.04) / 0.78));
    mapped = mapped * mapped * (3 - 2 * mapped);
    raw[i] = y;
    if (y < 0.07) {
      kind[i] = 0;
      lum[i] = 0;
    } else if (warm > 0.11 && y > 0.1) {
      kind[i] = 2;
      lum[i] = 0.5 + mapped * 0.5;
    } else if (y > 0.16) {
      kind[i] = 1;
      lum[i] = 0.62 + mapped * 0.38;
    } else {
      kind[i] = 0;
      lum[i] = mapped * 0.35;
    }
  }
  const src = lum.slice();
  for (let y = 2; y < rows - 2; y++) {
    for (let x = 2; x < cols - 2; x++) {
      const i = y * cols + x;
      if (kind[i] !== 2) continue;
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sum += src[i + dy * cols + dx] ?? 0;
        }
      }
      const avg = sum / 25;
      const cur = src[i] ?? 0;
      const delta = cur - avg;
      if (delta > 0.012) lum[i] = Math.min(1, cur + 0.24);
      else if (delta < -0.018) lum[i] = Math.max(0.04, cur * 0.34);
    }
  }
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const gx =
        -raw[i - cols - 1]! +
        raw[i - cols + 1]! -
        2 * raw[i - 1]! +
        2 * raw[i + 1]! -
        raw[i + cols - 1]! +
        raw[i + cols + 1]!;
      const gy =
        -raw[i - cols - 1]! -
        2 * raw[i - cols]! -
        raw[i - cols + 1]! +
        raw[i + cols - 1]! +
        2 * raw[i + cols]! +
        raw[i + cols + 1]!;
      const mag = Math.min(1, Math.hypot(gx, gy) * 2.1);
      edge[i] = mag;
      if (mag > 0.14 && (kind[i] ?? 0) > 0) lum[i] = Math.max(lum[i] ?? 0, 0.86 + mag * 0.14);
    }
  }
  return { lum, edge, kind };
}

const SCRAMBLE = "01<>[]{}()/\\|=+*#%&$@!?;:.~ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function mountHeroGlyph(
  canvas: HTMLCanvasElement,
  src = "/media/globe.jpg",
  phrase = "A PAGE BUILDER WITH GUARDRAILS. FETCH LAYER SOLVED. CDN BYPASSED IN PRODUCTION. WEBHOOKS INVALIDATE ON PUBLISH. DRAFT MODE WIRED IN. ",
) {
  const WAVE_MS = 2800;
  const LIVE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789*+#@";
  const INK_BG = "#8f8a82";
  const INK_FG = "#ffffff";
  const ALPHA = 0.28;
  const cache = document.createElement("canvas");
  const host = canvas.parentElement ?? canvas;
  let raf = 0;
  let morphTimer = 0;
  let resizeTimer = 0;
  let lum = new Float32Array(0);
  let edge = new Float32Array(0);
  let kind = new Uint8Array(0);
  let seeds = new Uint16Array(0);
  let noise = new Float32Array(0);
  let cols = 0;
  let rows = 0;
  let cw = 1;
  let ch = 1;
  let wave: { start: number; ox: number; oy: number; maxD: number } | null = null;
  let img: HTMLImageElement | null = null;
  const letters = phrase.toUpperCase().replace(/[^A-Z0-9]/g, "") || "HALYARD";
  let live: number[] = [];
  let glyphs: string[] = [];
  let alphas: Float32Array = new Float32Array(0);
  let laidW = 0;
  let laidH = 0;

  const measure = () => ({
    w: Math.max(1, host.clientWidth || canvas.clientWidth),
    h: Math.max(1, host.clientHeight || canvas.clientHeight),
  });

  const layout = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const { w, h } = measure();
    if (w < 2 || h < 2) return;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cache.width = canvas.width;
    cache.height = canvas.height;
    laidW = w;
    laidH = h;
    cols = Math.max(1, Math.round(w / 7.2));
    rows = Math.max(1, Math.round(h / 13));
    cw = w / cols;
    ch = h / rows;
    const n = cols * rows;
    seeds = new Uint16Array(n);
    noise = new Float32Array(n);
    glyphs = new Array(n);
    alphas = new Float32Array(n);
    live = [];
    for (let i = 0; i < n; i++) {
      seeds[i] = Math.floor(65536 * Math.random());
      noise[i] = Math.random();
      if ((seeds[i] ?? 0) % 9 === 0) live.push(i);
    }
    if (img) {
      const fields = sampleHero(img, cols, rows);
      lum = fields.lum;
      edge = fields.edge;
      kind = fields.kind;
    }
  };

  const pickGlyph = (i: number, x: number, y: number) => {
    const len = letters.length;
    let idx = i % len;
    let g = letters[idx] ?? "A";
    const left = x > 0 ? glyphs[i - 1] : "";
    const up = y > 0 ? glyphs[i - cols] : "";
    let step = 0;
    while ((g === left || g === up) && step < 16) {
      step += 1;
      g = letters[(idx + step) % len] ?? "A";
    }
    if (step > 0 && (seeds[i] ?? 0) % 17 === 0) g = letters[idx] ?? g;
    return g;
  };

  const alphaAt = (i: number) => {
    const e = edge[i] ?? 0;
    const L = lum[i] ?? 0;
    const k = kind[i] ?? 0;
    if (k === 0) return ALPHA;
    if (k === 2 && L < 0.28) return 0.1 + L * 0.28;
    if (e > 0.14) return 0.97;
    if (k === 1) return 0.92 + L * 0.08;
    return 0.94 + L * 0.06;
  };

  const inkAt = (i: number) => {
    const k = kind[i] ?? 0;
    const L = lum[i] ?? 0;
    if (k === 0) return INK_BG;
    if (k === 2 && L < 0.28) return INK_BG;
    return INK_FG;
  };

  const paintCache = () => {
    const ctx = cache.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, host.clientWidth || canvas.clientWidth);
    const h = Math.max(1, host.clientHeight || canvas.clientHeight);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    if (!cols || !rows) return;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontBg = `${Math.max(8, Math.round(ch * 0.7))}px ${FONT}`;
    const fontFg = `${Math.max(8, Math.round(ch * 0.96))}px ${FONT}`;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const g = pickGlyph(i, x, y);
        glyphs[i] = g;
        const a = alphaAt(i);
        alphas[i] = a;
        if (g === " ") continue;
        const k = kind[i] ?? 0;
        const L = lum[i] ?? 0;
        const subject = k > 0 && !(k === 2 && L < 0.28);
        ctx.font = subject ? fontFg : fontBg;
        ctx.fillStyle = inkAt(i);
        ctx.globalAlpha = a;
        ctx.fillText(g, (x + 0.5) * cw, (y + 0.5) * ch);
        if (subject) {
          ctx.globalAlpha = Math.min(1, a + 0.08);
          ctx.fillText(g, (x + 0.5) * cw, (y + 0.5) * ch);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  const morphLive = () => {
    const { w, h } = measure();
    if (w !== laidW || h !== laidH) {
      rebuild();
      return;
    }
    if (wave || !live.length) return;
    const ctx = cache.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(8, Math.round(ch * 0.72))}px ${FONT}`;
    const padX = cw * 0.55;
    const padY = ch * 0.55;
    for (const i of live) {
      const x = i % cols;
      const y = Math.floor(i / cols);
      const cx = (x + 0.5) * cw;
      const cy = (y + 0.5) * ch;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(cx - padX, cy - padY, padX * 2, padY * 2);
      const tick = Math.floor(performance.now() / 90);
      const left = x > 0 ? glyphs[i - 1] : "";
      const up = y > 0 ? glyphs[i - cols] : "";
      let next = LIVE[(seeds[i]! + tick) % LIVE.length] ?? "A";
      let k = 0;
      while ((next === left || next === up || next === glyphs[i]) && k < 10) {
        k += 1;
        next = LIVE[(seeds[i]! + tick + k * 7) % LIVE.length] ?? "A";
      }
      glyphs[i] = next;
      ctx.fillStyle = inkAt(i);
      ctx.globalAlpha = alphas[i] ?? ALPHA;
      ctx.fillText(next, cx, cy);
    }
    ctx.globalAlpha = 1;
    blit();
  };

  const blit = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
  };

  const drawWave = (now: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !wave) return;
    blit();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(5, ch * 0.86)}px ${FONT}`;
    ctx.fillStyle = "#e8e4dc";
    const sn = SCRAMBLE.length;
    const t = Math.min(1, (now - wave.start) / WAVE_MS);
    const ease = t * t * (3 - 2 * t);
    const radius = ease * 1.15;
    const pad = cw * 1.2;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const dist = Math.hypot(x - wave.ox, y - wave.oy) / wave.maxD;
        const warped = dist + ((noise[i] ?? 0) - 0.5) * 0.28 + Math.sin(x * 0.35 + y * 0.22) * 0.05;
        const local = radius - warped;
        if (local <= 0 || local >= 0.22) continue;
        const seed = seeds[i] ?? 0;
        const cx = (x + 0.5) * cw;
        const cy = (y + 0.5) * ch;
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(cx - pad, cy - pad, pad * 2, pad * 2);
        const tick = Math.floor((now + seed) / 48);
        ctx.fillStyle = inkAt(i);
        ctx.globalAlpha = Math.max(ALPHA, alphas[i] ?? ALPHA);
        ctx.fillText(SCRAMBLE[(seed + tick * 17) % sn] ?? "0", cx, cy);
      }
    }
    ctx.globalAlpha = 1;
  };

  const loop = (now: number) => {
    if (!wave) {
      blit();
      return;
    }
    if (now - wave.start > WAVE_MS + 200) {
      wave = null;
      blit();
      return;
    }
    drawWave(now);
    raf = requestAnimationFrame(loop);
  };

  const rebuild = () => {
    layout();
    paintCache();
    blit();
  };

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(rebuild));
    }, 32);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(host);
  ro.observe(canvas);
  window.addEventListener("resize", onResize);
  visualViewport?.addEventListener("resize", onResize);

  loadImage(src).then((el) => {
    img = el;
    rebuild();
  });
  rebuild();
  morphTimer = window.setInterval(morphLive, 110);

  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !cols) return;
    const rect = canvas.getBoundingClientRect();
    const ox = ((e.clientX - rect.left) / rect.width) * cols;
    const oy = ((e.clientY - rect.top) / rect.height) * rows;
    wave = {
      start: performance.now(),
      ox,
      oy,
      maxD: Math.hypot(Math.max(ox, cols - ox), Math.max(oy, rows - oy)) || 1,
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(resizeTimer);
    window.clearInterval(morphTimer);
    window.removeEventListener("resize", onResize);
    visualViewport?.removeEventListener("resize", onResize);
    ro.disconnect();
  };
}

export function mountStaticWall(
  canvas: HTMLCanvasElement,
  phrase: string,
  fg = "#6e6a62",
  bg = "#232323",
) {
  const atlas = WALL_ATLAS;
  const paint = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const cellH = 13;
    const cellW = 7.2;
    const cols = Math.max(1, Math.round(w / cellW));
    const rows = Math.max(1, Math.round(h / cellH));
    const cw = w / cols;
    const ch = h / rows;
    const text = phrase.toUpperCase().replace(/\s+/g, " ");
    ctx.font = `${Math.round(ch * 0.78)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fg;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const chs = text[i % text.length] ?? " ";
        if (chs === " ") continue;
        const n = ((x * 13 + y * 31) % 100) / 100;
        ctx.globalAlpha = 0.14 + n * 0.22;
        ctx.fillText(chs, (x + 0.5) * cw, (y + 0.5) * ch);
      }
    }
    ctx.globalAlpha = 1;
  };
  const ro = new ResizeObserver(paint);
  ro.observe(canvas);
  document.fonts?.ready.then(paint);
  paint();
  return () => ro.disconnect();
}

export function mountImageAscii(
  wrap: HTMLElement,
  img: HTMLImageElement,
  charset = DENSITY_ATLAS,
) {
  const canvas = document.createElement("canvas");
  canvas.className =
    "pointer-events-none absolute inset-0 size-full transition-opacity duration-500 ease-out motion-reduce:transition-none group-hover:opacity-0";
  wrap.appendChild(canvas);

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !img.naturalWidth) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#232323";
    ctx.fillRect(0, 0, w, h);
    const cellH = 10;
    const cellW = cellH * 0.55;
    const cols = Math.max(1, Math.round(w / cellW));
    const rows = Math.max(1, Math.round(h / cellH));
    const lum = sample(img, cols, rows);
    const cw = w / cols;
    const ch = h / rows;
    ctx.font = `${Math.round(ch * 0.9)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e6e1d8";
    const n = charset.length - 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const L = lum[y * cols + x] ?? 0;
        if (L < 0.05) continue;
        const gi = Math.min(n, Math.floor(L * charset.length));
        ctx.globalAlpha = 0.25 + L * 0.75;
        ctx.fillText(charset[gi] ?? " ", (x + 0.5) * cw, (y + 0.5) * ch);
      }
    }
    ctx.globalAlpha = 1;
  };

  const ro = new ResizeObserver(draw);
  ro.observe(wrap);
  if (img.complete) draw();
  else img.addEventListener("load", draw, { once: true });
  document.fonts?.ready.then(draw);
  return () => ro.disconnect();
}
