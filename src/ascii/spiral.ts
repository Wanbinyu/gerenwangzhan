/** GPU-instanced typographic spiral for the hero. */

const FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TAU = Math.PI * 2;
const RING_COUNT = 30;
const RIPPLE_COUNT = 8;
const BG = "#232323";

type Ring = {
  radius: number;
  speed: number;
};

type Ripple = {
  startedAt: number;
  strength: number;
};

type SceneData = {
  rings: Ring[];
  instances: Float32Array;
  instanceCount: number;
  atlasChars: string[];
  dotIndex: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function smoothstep(from: number, to: number, value: number) {
  if (from === to) return value < from ? 0 : 1;
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function wrapAngle(value: number) {
  return Math.abs(((value + Math.PI) % TAU + TAU) % TAU - Math.PI);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function heroCopy(phrase: string) {
  const firstSentence = phrase.split(".")[0]?.trim() || "HALYARD STUDIO FILE";
  return `${firstSentence}.`.toUpperCase();
}

function makeScene(copy: string): SceneData {
  const random = seededRandom(24071993);
  const alphabet = Array.from(copy).filter((char) => char !== ".");
  if (!alphabet.length) alphabet.push(...Array.from("HALYARD STUDIO FILE"));
  const atlasChars = [...new Set(alphabet)];
  const dotIndex = atlasChars.length;
  const charIndexes = new Map(atlasChars.map((char, index) => [char, index]));
  const rings: Ring[] = [];
  const values: number[] = [];

  for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex++) {
    const ringT = ringIndex / (RING_COUNT - 1);
    const radius = 0.06 + 1.39 * ringT;
    const speed = (ringIndex % 2 === 0 ? 1 : -1) * (0.006 + (1 - ringT) * 0.029);
    const size = 10.5 + 11.5 * ringT;
    const layoutSize = 14 + 16 * ringT;
    const count = Math.max(8, Math.floor(TAU * radius / (0.6 * layoutSize * 0.0018518519)));
    const bandCenter = random() < 0.15 ? random() * TAU : 0.25 + (random() - 0.5) * Math.PI * 0.65;
    const halfWidth = Math.min(
      0.98,
      random() < 0.1 ? 0.05 + random() * 0.15 : 0.25 + 0.35 * ringT + 0.3 * random(),
    ) * Math.PI;
    const softness = Math.PI * (0.07 + 0.13 * random());
    const phase = random() * TAU;
    let letterIndex = 0;
    let gap = 0;

    rings.push({ radius, speed });

    for (let slot = 0; slot < count; slot++) {
      const theta = phase + slot * TAU / count;
      const distance = wrapAngle(theta - bandCenter);
      const weight = 1 - smoothstep(Math.max(0, halfWidth - softness), halfWidth + softness, distance);
      let patternedLetter = false;
      let char = " ";

      if (gap > 0) {
        gap -= 1;
      } else {
        patternedLetter = true;
        char = alphabet[letterIndex] ?? "H";
        letterIndex += 1;
        if (letterIndex >= alphabet.length) {
          letterIndex = 0;
          gap = 1 + Math.floor(random() * 3);
        }
      }

      const isLetter = patternedLetter && (weight > 0.7 || (weight >= 0.3 && random() < weight));
      const charIndex = isLetter ? charIndexes.get(char) ?? 0 : dotIndex;

      // radius, theta, size, character index, ring index, seed, is-letter
      values.push(radius, theta, size, charIndex, ringIndex, random(), isLetter ? 1 : 0);
    }
  }

  return {
    rings,
    instances: new Float32Array(values),
    instanceCount: values.length / 7,
    atlasChars,
    dotIndex,
  };
}

function createAtlas(chars: string[]) {
  const cell = 64;
  const canvas = document.createElement("canvas");
  canvas.width = (chars.length + 1) * cell;
  canvas.height = cell;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return canvas;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = `300 56px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  chars.forEach((char, index) => {
    context.fillText(char, (index + 0.5) * cell, cell * 0.52);
  });
  context.beginPath();
  context.arc((chars.length + 0.5) * cell, cell * 0.5, cell * 0.4, 0, TAU);
  context.fill();
  return canvas;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "WebGL program link failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 aPosition;
in vec2 aUv;
in float aRadius;
in float aTheta;
in float aSize;
in float aCharIndex;
in float aRingIndex;
in float aSeed;
in float aIsLetter;

uniform vec2 uFitScale;
uniform float uPxToDesign;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform float uMouseRadius;
uniform float uDotIndex;
uniform float uAtlasColumns;
uniform float uRingCharge[${RING_COUNT}];
uniform float uRingGather[${RING_COUNT}];
uniform float uRingOffsets[${RING_COUNT}];
uniform float uRingArrival[${RING_COUNT}];
uniform float uRippleStarts[${RIPPLE_COUNT}];
uniform float uRippleStrength[${RIPPLE_COUNT}];

out vec2 vUv;
out float vAlpha;
out float vRingT;
out float vIsDot;

float hash(float value) {
  return fract(sin(value * 12.9898) * 43758.5453);
}

float smooth01(float value) {
  return value * value * (3.0 - 2.0 * value);
}

void main() {
  int ring = int(aRingIndex + 0.5);
  float charge = uRingCharge[ring];
  float gather = uRingGather[ring];
  float rippleInfluence = 0.0;

  for (int index = 0; index < ${RIPPLE_COUNT}; index++) {
    float start = uRippleStarts[index];
    if (start < 0.0) continue;
    float age = uTime - start;
    if (age < 0.0 || age >= 1.8) continue;
    float life = age / 1.8;
    float easedLife = smooth01(clamp(life, 0.0, 1.0));
    float waveRadius = easedLife * 1.6;
    float bell = 1.0 - smoothstep(0.0, 0.425, abs(aRadius - waveRadius));
    float lifeFade = smoothstep(0.0, 0.22, life) * (1.0 - smoothstep(0.78, 1.0, life));
    rippleInfluence = max(rippleInfluence, bell * lifeFade * uRippleStrength[index]);
  }

  float radius = aRadius * (1.0 - gather * 0.12) + rippleInfluence * 0.045;
  float theta = aTheta + uRingOffsets[ring];
  float cosine = cos(theta);
  float sine = sin(theta);
  vec2 center = vec2(cosine, sine) * radius;

  float mouseDistance = length(center - uMouse);
  float hover = (1.0 - smoothstep(0.0, uMouseRadius, mouseDistance)) * uMouseInfluence;
  float dissolve = max(hover * 2.5, rippleInfluence);
  float becomesDot = max(1.0 - aIsLetter, step(hash(aSeed), dissolve));

  float glitchTick = floor(uTime * 9.0);
  float glitchNoise = hash(aSeed * 91.7 + glitchTick * 7.31);
  becomesDot = max(becomesDot, step(glitchNoise, charge * 0.15));

  float charIndex = mix(aCharIndex, uDotIndex, becomesDot);
  float sizePx = mix(aSize, 2.0, becomesDot) * (1.0 + rippleInfluence * 0.5);
  float designSize = sizePx * uPxToDesign;
  vec2 rotated = vec2(
    -aPosition.x * sine - aPosition.y * cosine,
     aPosition.x * cosine - aPosition.y * sine
  ) * designSize;

  float shakeSeed = hash(aSeed * 117.3);
  float shakes = step(shakeSeed, 0.18);
  vec2 tremor = vec2(
    sin(uTime * (38.0 + aSeed * 14.0) + aSeed * 271.0),
    cos(uTime * (34.0 + aSeed * 17.0) + aSeed * 113.0)
  ) * charge * shakes * 0.002;

  vec2 world = (center + rotated + tremor) * uFitScale;
  gl_Position = vec4(world, 0.0, 1.0);
  vUv = vec2((charIndex + aUv.x) / uAtlasColumns, aUv.y);
  vRingT = clamp(aRadius, 0.0, 1.2);
  vIsDot = becomesDot;
  vAlpha = clamp((uTime - uRingArrival[ring]) / 0.5, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform sampler2D uAtlas;
in vec2 vUv;
in float vAlpha;
in float vRingT;
in float vIsDot;
out vec4 fragColor;

void main() {
  float alpha = texture(uAtlas, vUv).a;
  float dim = mix(0.85, 1.0, smoothstep(0.0, 0.85, vRingT));
  float dotOpacity = mix(1.0, 0.19, vIsDot);
  fragColor = vec4(vec3(dim), alpha * vAlpha * dotOpacity);
}
`;

function bindAttribute(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  size: number,
  stride: number,
  offset: number,
  divisor = 0,
) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) throw new Error(`Missing WebGL attribute: ${name}`);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  if (divisor) gl.vertexAttribDivisor(location, divisor);
}

function mountFallback(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = BG;
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "rgba(255,255,255,.45)";
    context.lineWidth = 1;
    const scale = Math.max(rect.width, rect.height) * 0.5;
    for (let index = 0; index < 24; index++) {
      context.beginPath();
      context.arc(rect.width * 0.5, rect.height * 0.5, scale * (0.06 + index / 23 * 1.39), 0, TAU);
      context.stroke();
    }
  };
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  draw();
  return () => observer.disconnect();
}

export function mountHeroSpiral(
  canvas: HTMLCanvasElement,
  _src = "",
  phrase = "BUILT ON THIS WORKING FILE.",
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return mountFallback(canvas);

  const host = canvas.parentElement ?? canvas;
  const scene = makeScene(heroCopy(phrase));
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const quadBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!vao || !quadBuffer || !instanceBuffer || !texture) throw new Error("Unable to allocate WebGL resources");

  const quad = new Float32Array([
    // x, y, u, v
    -0.5, -0.5, 0, 0,
     0.5, -0.5, 1, 0,
    -0.5,  0.5, 0, 1,
    -0.5,  0.5, 0, 1,
     0.5, -0.5, 1, 0,
     0.5,  0.5, 1, 1,
  ]);

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  bindAttribute(gl, program, "aPosition", 2, 16, 0);
  bindAttribute(gl, program, "aUv", 2, 16, 8);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, scene.instances, gl.STATIC_DRAW);
  const instanceStride = 7 * 4;
  bindAttribute(gl, program, "aRadius", 1, instanceStride, 0, 1);
  bindAttribute(gl, program, "aTheta", 1, instanceStride, 4, 1);
  bindAttribute(gl, program, "aSize", 1, instanceStride, 8, 1);
  bindAttribute(gl, program, "aCharIndex", 1, instanceStride, 12, 1);
  bindAttribute(gl, program, "aRingIndex", 1, instanceStride, 16, 1);
  bindAttribute(gl, program, "aSeed", 1, instanceStride, 20, 1);
  bindAttribute(gl, program, "aIsLetter", 1, instanceStride, 24, 1);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uploadAtlas = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createAtlas(scene.atlasChars));
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  uploadAtlas();

  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(35 / 255, 35 / 255, 35 / 255, 1);

  const uniform = (name: string) => {
    const location = gl.getUniformLocation(program, name);
    if (location === null) throw new Error(`Missing WebGL uniform: ${name}`);
    return location;
  };

  const uniforms = {
    fitScale: uniform("uFitScale"),
    pxToDesign: uniform("uPxToDesign"),
    time: uniform("uTime"),
    mouse: uniform("uMouse"),
    mouseInfluence: uniform("uMouseInfluence"),
    mouseRadius: uniform("uMouseRadius"),
    dotIndex: uniform("uDotIndex"),
    atlasColumns: uniform("uAtlasColumns"),
    atlas: uniform("uAtlas"),
    ringCharge: uniform("uRingCharge[0]"),
    ringGather: uniform("uRingGather[0]"),
    ringOffsets: uniform("uRingOffsets[0]"),
    ringArrival: uniform("uRingArrival[0]"),
    rippleStarts: uniform("uRippleStarts[0]"),
    rippleStrength: uniform("uRippleStrength[0]"),
  };

  const ringCharge = new Float32Array(RING_COUNT);
  const ringGather = new Float32Array(RING_COUNT);
  const ringOffsets = new Float32Array(RING_COUNT);
  const ringArrival = new Float32Array(scene.rings.map((ring) => Math.max(0, ring.radius - 0.425) / 1.6 * 1.8));
  const rippleStarts = new Float32Array(RIPPLE_COUNT).fill(-1);
  const rippleStrength = new Float32Array(RIPPLE_COUNT);
  const pointer = { x: 999, y: 999, tx: 999, ty: 999, influence: 0, targetInfluence: 0 };
  const ripples: Ripple[] = [{ startedAt: 0, strength: 1 }];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hint = document.createElement("div");
  let width = 1;
  let height = 1;
  let fitX = 1;
  let fitY = 1;
  let elapsed = reducedMotion.matches ? 2.3 : 0;
  let lastTime = performance.now();
  let lastPaint = 0;
  let raf = 0;
  let intersecting = true;
  let pageVisible = !document.hidden;
  let hovering = false;
  let holding = false;
  let charged = false;
  let holdProgress = 0;
  let deepGather = 0;
  let scrollVelocity = 0;
  let lastScrollY = window.scrollY;

  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "pan-y";
  canvas.setAttribute("aria-label", "Interactive typographic spiral. Move the pointer through it or click and hold.");

  hint.setAttribute("aria-hidden", "true");
  hint.textContent = coarsePointer ? "TAP & HOLD" : "CLICK & HOLD";
  Object.assign(hint.style, {
    position: "absolute",
    left: "0",
    top: "0",
    zIndex: "2",
    padding: "2px 4px",
    background: "#ffffff",
    color: BG,
    fontFamily: FONT,
    fontSize: "12px",
    lineHeight: "1.25",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 150ms ease-out",
    willChange: "transform",
  });
  host.append(hint);

  gl.uniform1i(uniforms.atlas, 0);
  gl.uniform1f(uniforms.mouseRadius, 0.35);
  gl.uniform1f(uniforms.dotIndex, scene.dotIndex);
  gl.uniform1f(uniforms.atlasColumns, scene.atlasChars.length + 1);
  gl.uniform1fv(uniforms.ringArrival, ringArrival);

  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = width / height;
    if (aspect >= 1) {
      fitX = 1;
      fitY = aspect;
    } else {
      fitX = 1 / aspect;
      fitY = 1;
    }
    gl.useProgram(program);
    gl.uniform2f(uniforms.fitScale, fitX, fitY);
    gl.uniform1f(uniforms.pxToDesign, 2 / Math.max(width, height));
  };

  const pointerPosition = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    pointer.tx = (localX / rect.width * 2 - 1) / fitX;
    pointer.ty = (1 - localY / rect.height * 2) / fitY;
    const labelX = Math.min(rect.width - 112, Math.max(4, localX + 20));
    const labelY = Math.min(rect.height - 24, Math.max(4, localY + 20));
    hint.style.transform = `translate(${labelX}px, ${labelY}px)`;
  };

  const setIdleLabel = () => {
    hint.textContent = coarsePointer ? "TAP & HOLD" : "CLICK & HOLD";
  };

  const release = () => {
    if (!holding) return;
    holding = false;
    if (charged) {
      ripples.push({ startedAt: elapsed, strength: 0.7 + deepGather * 0.6 });
      if (ripples.length > RIPPLE_COUNT) ripples.shift();
    }
    charged = false;
    setIdleLabel();
    if (!hovering) hint.style.opacity = "0";
  };

  const onPointerEnter = (event: PointerEvent) => {
    hovering = true;
    pointerPosition(event);
    pointer.x = pointer.tx;
    pointer.y = pointer.ty;
    pointer.targetInfluence = 1;
    hint.style.opacity = "1";
  };
  const onPointerMove = (event: PointerEvent) => pointerPosition(event);
  const onPointerLeave = () => {
    hovering = false;
    pointer.targetInfluence = 0;
    if (!holding) hint.style.opacity = "0";
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerPosition(event);
    holding = true;
    charged = false;
    hint.textContent = "KEEP HOLDING";
    hint.style.opacity = "1";
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    release();
  };
  const onScroll = () => {
    const next = window.scrollY;
    scrollVelocity = next - lastScrollY;
    lastScrollY = next;
  };

  const render = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!reducedMotion.matches) elapsed += dt;

    const pointerEase = 1 - Math.exp(-14 * dt);
    const influenceEase = 1 - Math.exp(-6 * dt);
    pointer.x += (pointer.tx - pointer.x) * pointerEase;
    pointer.y += (pointer.ty - pointer.y) * pointerEase;
    pointer.influence += (pointer.targetInfluence - pointer.influence) * influenceEase;
    scrollVelocity *= Math.exp(-5 * dt);

    if (holding) {
      holdProgress = Math.min(1, holdProgress + dt / 0.9);
      deepGather = 1 - (1 - deepGather) * Math.exp(-dt / 4);
      if (!charged && holdProgress >= 1) {
        charged = true;
        hint.textContent = "RELEASE";
      }
    } else {
      holdProgress *= Math.exp(-10 * dt);
      deepGather *= Math.exp(-10 * dt);
    }

    for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex++) {
      const ring = scene.rings[ringIndex]!;
      const stateEase = 1 - Math.exp(-14 * dt);
      ringCharge[ringIndex] += ((holding ? holdProgress : 0) - (ringCharge[ringIndex] ?? 0)) * stateEase;
      ringGather[ringIndex] += ((holding ? smoothstep(0, 1, holdProgress) * deepGather : 0) - (ringGather[ringIndex] ?? 0)) * stateEase;

      let rippleTurn = 0;
      for (const ripple of ripples) {
        const age = elapsed - ripple.startedAt;
        if (age < 0 || age >= 1.8) continue;
        const life = age / 1.8;
        const radius = smoothstep(0, 1, life) * 1.6;
        const bell = 1 - smoothstep(0, 0.425, Math.abs(ring.radius - radius));
        const fade = smoothstep(0, 0.22, life) * (1 - smoothstep(0.78, 1, life));
        rippleTurn = Math.max(rippleTurn, bell * fade * ripple.strength);
      }
      ringOffsets[ringIndex] += (
        ring.speed * (1 - (ringCharge[ringIndex] ?? 0)) +
        rippleTurn * 0.55 * Math.sign(ring.speed) +
        ring.speed * Math.min(40, Math.abs(scrollVelocity))
      ) * dt;
    }

    while (ripples.length && elapsed - (ripples[0]?.startedAt ?? 0) >= 1.8) ripples.shift();
    rippleStarts.fill(-1);
    rippleStrength.fill(0);
    ripples.slice(-RIPPLE_COUNT).forEach((ripple, index) => {
      rippleStarts[index] = ripple.startedAt;
      rippleStrength[index] = ripple.strength;
    });

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform2f(uniforms.mouse, pointer.x, pointer.y);
    gl.uniform1f(uniforms.mouseInfluence, pointer.influence);
    gl.uniform1fv(uniforms.ringCharge, ringCharge);
    gl.uniform1fv(uniforms.ringGather, ringGather);
    gl.uniform1fv(uniforms.ringOffsets, ringOffsets);
    gl.uniform1fv(uniforms.rippleStarts, rippleStarts);
    gl.uniform1fv(uniforms.rippleStrength, rippleStrength);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, scene.instanceCount);
  };

  const shouldAnimate = () => intersecting && pageVisible && !reducedMotion.matches;
  const loop = (now: number) => {
    if (!shouldAnimate()) {
      raf = 0;
      return;
    }
    const frameInterval = 1000 / 60;
    if (now - lastPaint >= frameInterval) {
      lastPaint = now - ((now - lastPaint) % frameInterval);
      render(now);
    }
    raf = requestAnimationFrame(loop);
  };
  const syncLoop = () => {
    if (shouldAnimate()) {
      if (!raf) {
        lastTime = performance.now();
        raf = requestAnimationFrame(loop);
      }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      render(performance.now());
    }
  };

  const resizeObserver = new ResizeObserver(() => {
    resize();
    render(performance.now());
  });
  const intersectionObserver = new IntersectionObserver((entries) => {
    intersecting = entries[0]?.isIntersecting ?? true;
    syncLoop();
  });
  const onVisibility = () => {
    pageVisible = !document.hidden;
    syncLoop();
  };
  const onReducedMotion = () => syncLoop();
  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  resizeObserver.observe(host);
  intersectionObserver.observe(host);
  canvas.addEventListener("pointerenter", onPointerEnter);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("webglcontextlost", onContextLost);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  reducedMotion.addEventListener("change", onReducedMotion);

  resize();
  render(performance.now());
  document.fonts.ready.then(() => {
    uploadAtlas();
    render(performance.now());
  });
  syncLoop();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener("pointerenter", onPointerEnter);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", release);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    reducedMotion.removeEventListener("change", onReducedMotion);
    hint.remove();
    gl.deleteTexture(texture);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteBuffer(quadBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  };
}
