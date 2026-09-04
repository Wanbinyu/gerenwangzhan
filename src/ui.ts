const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789acehinortu#$%&*+";

export function mountOdometers(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-odometer]").forEach((el) => {
    if (el.dataset.ready) return;
    el.dataset.ready = "1";
    const text = el.textContent ?? "";
    el.textContent = "";
    el.setAttribute("aria-label", text);
    const row = document.createElement("span");
    row.className = "flex items-center";
    row.setAttribute("aria-hidden", "true");
    [...text].forEach((ch, i) => {
      if (ch === " ") {
        const sp = document.createElement("span");
        sp.className = "inline-block";
        sp.style.width = "0.4em";
        row.append(sp);
        return;
      }
      const glyphs = [ch];
      for (let k = 0; k < 4; k++) {
        glyphs.push(SCRAMBLE[(ch.charCodeAt(0) * 17 + i * 13 + k * 29) % SCRAMBLE.length] ?? "A");
      }
      glyphs.push(ch);
      const wrap = document.createElement("span");
      wrap.className = "relative inline-block overflow-hidden align-baseline";
      wrap.style.height = "1em";
      wrap.style.lineHeight = "1em";
      const ghost = document.createElement("span");
      ghost.className = "invisible";
      ghost.textContent = ch;
      const col = document.createElement("span");
      col.className = "absolute inset-x-0 top-0 flex flex-col motion-safe:transition-transform";
      col.style.transform = "translateY(calc(var(--odometer-progress, 0) * -5em))";
      col.style.transitionDuration = "520ms";
      col.style.transitionDelay = `calc(var(--odometer-progress, 0) * ${i * 28}ms)`;
      col.style.transitionTimingFunction = "cubic-bezier(0.23, 1, 0.32, 1)";
      glyphs.forEach((g) => {
        const s = document.createElement("span");
        s.className = "block";
        s.style.height = "1em";
        s.style.lineHeight = "1em";
        s.textContent = g;
        col.append(s);
      });
      wrap.append(ghost, col);
      row.append(wrap);
    });
    el.append(row);
  });
}

export function mountReveals() {
  const play = (el: HTMLElement) => {
    if (el.dataset.revealed === "1") return;
    el.dataset.revealed = "1";
    el.querySelectorAll<HTMLElement>(".line").forEach((line, i) => {
      line.style.transition = `transform 0.9s cubic-bezier(0.23, 1, 0.32, 1) ${i * 70}ms`;
      line.style.transform = "translateY(0)";
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        play(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
  );

  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    const html = el.innerHTML;
    const parts = html.split(/<br\s*\/?>|\n/).filter((p) => p.trim().length);
    el.innerHTML = "";
    parts.forEach((part) => {
      const mask = document.createElement("span");
      mask.dataset.animatedTextMask = "";
      mask.style.display = "block";
      mask.style.overflow = "hidden";
      mask.style.paddingBottom = "0.2em";
      mask.style.marginBottom = "calc(-0.2em)";
      const line = document.createElement("span");
      line.className = "line";
      line.style.display = "block";
      line.style.transform = "translateY(120%)";
      line.innerHTML = part;
      mask.append(line);
      el.append(mask);
    });
    io.observe(el);
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) play(el);
    });
  });
}

export function mountFaq() {
  document.querySelectorAll<HTMLButtonElement>("[data-faq-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("aria-controls");
      if (!id) return;
      const panel = document.getElementById(id);
      if (!panel) return;
      const open = btn.getAttribute("aria-expanded") === "true";
      document.querySelectorAll<HTMLButtonElement>("[data-faq-btn]").forEach((other) => {
        other.setAttribute("aria-expanded", "false");
        const p = document.getElementById(other.getAttribute("aria-controls") ?? "");
        if (p) {
          p.style.gridTemplateRows = "0fr";
          const plus = other.querySelector("[data-faq-plus]");
          if (plus instanceof HTMLElement) plus.style.transform = "rotate(0deg)";
        }
      });
      if (!open) {
        btn.setAttribute("aria-expanded", "true");
        panel.style.gridTemplateRows = "1fr";
        const plus = btn.querySelector("[data-faq-plus]");
        if (plus instanceof HTMLElement) plus.style.transform = "rotate(90deg)";
      }
    });
  });
}

export function mountTerminal() {
  const host = document.querySelector<HTMLElement>("[data-terminal]");
  if (!host) return;
  const lines = JSON.parse(host.dataset.lines || "[]") as string[];
  const out = host.querySelector("[data-terminal-out]");
  if (!out) return;
  let i = 0;
  const typeLine = (text: string, done: () => void) => {
    const row = document.createElement("div");
    row.className = "flex gap-16";
    const num = document.createElement("span");
    num.className = "w-36 shrink-0 text-white/35";
    num.textContent = String(i + 1).padStart(3, "0");
    const body = document.createElement("span");
    body.className = "text-white";
    const cur = document.createElement("span");
    cur.className = "inline-block w-8 h-[1em] translate-y-[0.15em] bg-white animate-cursor-blink";
    row.append(num, body, cur);
    out.append(row);
    let c = 0;
    const tick = () => {
      c++;
      body.textContent = text.slice(0, c);
      if (c < text.length) {
        window.setTimeout(tick, 18 + Math.random() * 28);
      } else {
        cur.remove();
        done();
      }
    };
    tick();
  };
  const next = () => {
    if (i >= lines.length) {
      const row = document.createElement("div");
      row.className = "flex gap-16";
      const num = document.createElement("span");
      num.className = "w-36 shrink-0 text-white/35";
      num.textContent = String(i + 1).padStart(3, "0");
      const draft = document.createElement("span");
      draft.className = "text-white";
      draft.textContent = "Draft ";
      const cur = document.createElement("span");
      cur.className = "inline-block w-8 h-[1em] translate-y-[0.15em] bg-white animate-cursor-blink";
      row.append(num, draft, cur);
      out.append(row);
      return;
    }
    typeLine(lines[i] ?? "", () => {
      i++;
      window.setTimeout(next, 240);
    });
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        next();
      }
    },
    { threshold: 0.4 },
  );
  io.observe(host);
}

export function mountIde() {
  const root = document.querySelector("[data-ide]");
  if (!root) return;
  const files: Record<string, { title: string; body: string[] }> = {
    readme: {
      title: "README.MD",
      body: [
        "# RAG LangChain Lab",
        "",
        "Hybrid retrieval with measurable quality and inspectable evidence.",
        "Python + LangChain + ChromaDB + BM25/RRF + Cross-Encoder.",
        "CLI and local web console expose sources, scores and failure traces.",
      ],
    },
    agents: {
      title: "EVALUATION.MD",
      body: [
        "# Evaluation",
        "",
        "Recall@3: 60.00% -> 84.62%",
        "MRR:      0.5231 -> 0.7564",
        "Top-5 Recall: 89.23%",
        "Out-of-scope refusal: 20 / 20",
        "pytest: 47 tests + 11 subtests",
      ],
    },
    schema: {
      title: "PIPELINE.PY",
      body: [
        "def retrieve(query):",
        "  vector_hits = vector.search(query)",
        "  keyword_hits = bm25.search(query)",
        "  fused = rrf(vector_hits, keyword_hits)",
        "  ranked = cross_encoder.rerank(query, fused)",
        "  return grade_evidence(ranked)",
      ],
    },
  };
  const title = root.querySelector("[data-ide-title]");
  const code = root.querySelector("[data-ide-code]");
  root.querySelectorAll<HTMLButtonElement>("[data-ide-file]").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll("[data-ide-file]").forEach((b) => b.classList.remove("text-white"));
      btn.classList.add("text-white");
      const key = btn.dataset.ideFile ?? "readme";
      const file = files[key] ?? files.readme;
      if (title) title.textContent = file.title;
      if (code) {
        code.innerHTML = file.body
          .map((line, i) => {
            const n = `<span class="w-24 shrink-0 text-white/25">${i + 1}</span>`;
            const colored = line
              .replace(/^(#.*)$/g, '<span class="text-[#9cdcfe]">$1</span>')
              .replace(
                /\b(export|const|return)\b/g,
                '<span class="text-[#c586c0]">$1</span>',
              );
            return `<div class="flex gap-16">${n}<span>${colored || "&nbsp;"}</span></div>`;
          })
          .join("");
      }
    });
  });
}

export function mountCarousel() {
  const scroller = document.querySelector<HTMLElement>("[data-carousel]");
  if (!scroller) return;
  let down = false;
  let startX = 0;
  let startScroll = 0;
  scroller.addEventListener("pointerdown", (e) => {
    down = true;
    startX = e.clientX;
    startScroll = scroller.scrollLeft;
    scroller.setPointerCapture(e.pointerId);
  });
  scroller.addEventListener("pointermove", (e) => {
    if (!down) return;
    scroller.scrollLeft = startScroll - (e.clientX - startX);
  });
  const up = () => {
    down = false;
  };
  scroller.addEventListener("pointerup", up);
  scroller.addEventListener("pointercancel", up);
}

export function mountNav(onNavigate?: (href: string) => void) {
  const header = document.querySelector("header");
  const links = [...document.querySelectorAll<HTMLAnchorElement>("header [data-nav]")];
  const sections = links
    .map((a) => {
      const id = a.getAttribute("href")?.replace("#", "");
      return id ? document.getElementById(id) : null;
    })
    .filter((s): s is HTMLElement => !!s);

  const setActive = (id: string) => {
    links.forEach((a) => {
      const on = a.getAttribute("href") === `#${id}`;
      a.classList.toggle("bg-white/10", on);
      a.classList.toggle("text-white", on);
      a.classList.toggle("text-white/55", !on);
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      const vis = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis?.target.id) setActive(vis.target.id);
    },
    { threshold: [0.2, 0.45, 0.7], rootMargin: "-20% 0px -40% 0px" },
  );
  sections.forEach((s) => io.observe(s));

  links.forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href?.startsWith("#")) return;
      e.preventDefault();
      onNavigate?.(href);
    });
  });

  const paintHeader = () => {
    if (!header) return;
    const dark = document
      .elementsFromPoint(window.innerWidth / 2, 48)
      .some((el) => el instanceof HTMLElement && (el.dataset.dark === "1" || el.classList.contains("bg-black")));
    header.dataset.onDark = dark ? "1" : "0";
  };
  window.addEventListener("scroll", paintHeader, { passive: true });
  paintHeader();
}

export function mountMinimap() {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-minimap]");
  const btn = canvas?.closest("button");
  if (!canvas || !btn) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = 72;
    const h = 48;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const doc = document.documentElement.scrollHeight;
    const view = window.innerHeight;
    const y = (window.scrollY / Math.max(1, doc - view)) * h;
    const vh = (view / doc) * h;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(8, 4, w - 16, h - 8);
    const blocks = document.querySelectorAll("main [data-section]");
    blocks.forEach((el, i) => {
      const r = (el as HTMLElement).offsetTop / doc;
      const hh = (el as HTMLElement).offsetHeight / doc;
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,145,0,0.45)";
      ctx.fillRect(12, 6 + r * (h - 12), w - 24, Math.max(3, hh * (h - 12)));
    });
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.strokeRect(6, Math.min(h - vh - 4, Math.max(2, y)), w - 12, Math.max(8, vh));
  };
  draw();
  window.addEventListener("scroll", draw, { passive: true });
  window.addEventListener("resize", draw);
  btn.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const t = (e.clientY - rect.top) / rect.height;
    const doc = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: t * doc, behavior: "smooth" });
  });
}

export function mountMenu() {
  const btn = document.querySelector<HTMLButtonElement>("[data-menu]");
  const panel = document.querySelector<HTMLElement>("[data-menu-panel]");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    const open = panel.dataset.open === "1";
    panel.dataset.open = open ? "0" : "1";
    panel.classList.toggle("pointer-events-none", open);
    panel.classList.toggle("opacity-0", open);
    btn.setAttribute("aria-expanded", open ? "false" : "true");
  });
  panel.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      panel.dataset.open = "0";
      panel.classList.add("pointer-events-none", "opacity-0");
      btn.setAttribute("aria-expanded", "false");
    }),
  );
}
