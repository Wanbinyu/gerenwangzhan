import "./styles.css";
import "lenis/dist/lenis.css";
import Lenis from "lenis";
import { mountCurtain } from "./ascii/engine";
import { mountStaticWall, mountImageAscii } from "./ascii/glyphs";
import { mountHeroSpiral } from "./ascii/spiral";
import {
  mountOdometers,
  mountReveals,
  mountFaq,
  mountTerminal,
  mountIde,
  mountCarousel,
  mountNav,
  mountMinimap,
  mountMenu,
} from "./ui";

const WALL_COPY = `
AI APPLICATIONS BUILT TO RUN. RETRIEVAL MEASURED.
EVIDENCE INSPECTED. FAILURES EXPLAINED.
FROM RAG PIPELINES TO PRODUCTION APIS. EVERY RESULT SHOULD BE VERIFIABLE.
BUILD WITH MODELS. TEST WITH DATA. SHIP WITH CONFIDENCE.
`.replace(/\s+/g, " ").trim();

const HERO_COPY = "AI 应用开发 · RAG 检索 · Python · Java · Spring Boot · MySQL · Redis";

function boot() {
  const lenis = new Lenis({
    lerp: 0.12,
    smoothWheel: true,
  });
  const raf = (time: number) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  window.addEventListener("resize", () => lenis.resize());

  mountOdometers();
  mountReveals();
  mountFaq();
  mountTerminal();
  mountIde();
  mountCarousel();
  mountMinimap();
  mountMenu();

  const curtainCanvas = document.querySelector<HTMLCanvasElement>("[data-ascii-curtain]");
  const curtain = curtainCanvas ? mountCurtain(curtainCanvas) : null;
  const showCurtain = (on: boolean) => {
    if (!curtainCanvas) return;
    curtainCanvas.style.opacity = on ? "1" : "0";
    curtainCanvas.style.pointerEvents = on ? "auto" : "none";
  };

  mountNav((href) => {
    const go = () => {
      const el = document.querySelector(href);
      if (el) lenis.scrollTo(el as HTMLElement, { offset: 0, immediate: true });
      history.replaceState(null, "", href);
    };
    if (!curtain) {
      go();
      return;
    }
    showCurtain(true);
    curtain.cover().then(() => {
      go();
      return curtain.reveal();
    }).then(() => showCurtain(false));
  });

  const hero = document.querySelector<HTMLCanvasElement>("[data-ascii-hero]");
  if (hero) mountHeroSpiral(hero, "", HERO_COPY);

  document.querySelectorAll<HTMLCanvasElement>("[data-ascii-wall]").forEach((c) => {
    mountStaticWall(c, c.dataset.phrase || WALL_COPY, "#6a665e", "#232323");
  });

  document.querySelectorAll<HTMLElement>("[data-ascii-photo]").forEach((wrap) => {
    const img = wrap.querySelector("img");
    if (img) mountImageAscii(wrap, img);
  });

  const learn = document.querySelector<HTMLElement>("[data-learn]");
  learn?.addEventListener("click", () => {
    const el = document.getElementById("skills");
    if (el) lenis.scrollTo(el);
  });

  const heroSection = document.querySelector<HTMLElement>("main > section:first-of-type");
  if (learn && heroSection) {
    let learnVisible: boolean | undefined;
    const updateLearnVisibility = () => {
      const visible = heroSection.getBoundingClientRect().bottom > 0;
      if (visible === learnVisible) return;
      learnVisible = visible;
      learn.style.opacity = visible ? "1" : "0";
      learn.style.pointerEvents = visible ? "auto" : "none";
      learn.style.transition = "opacity 200ms ease";
      learn.tabIndex = visible ? 0 : -1;
      learn.setAttribute("aria-hidden", visible ? "false" : "true");
    };
    updateLearnVisibility();
    window.addEventListener("scroll", updateLearnVisibility, { passive: true });
  }

  document.querySelector("[data-next]")?.addEventListener("click", () => {
    const el = document.querySelector("[data-section]:nth-of-type(2)");
    if (el) lenis.scrollTo(el as HTMLElement);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
