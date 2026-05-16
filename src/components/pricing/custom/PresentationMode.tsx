// Presentation Mode (B8.8) — fullscreen viewer of the slide deck.
//
// Renders the full slidesFlow deck. The user can navigate with arrow keys,
// click left/right edges, or use the on-screen arrows. The CURRENT custom
// slide (currentConfig) is rendered with the live editor state when the user
// hasn't switched away from the slide they were editing; for other custom
// slides the saved config from the store is used. Non-custom slides use
// SlidePreview as a fallback (read-only).
//
// Cross-filter: SlideFilterProvider wraps the active slide's blocks so the
// chart blocks emit/respond to filters exactly like in edit mode.
//
// Exit: Escape, ✕ button, or document.exitFullscreen.

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Filter as FunnelIcon, Download } from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { Button } from "@/components/ui/button";
import { useSlidesFlow } from "@/store/slidesFlow";
import { CANVAS_W, CANVAS_H, FOOTER_H, type CustomSlideConfig, type CustomBlock } from "@/lib/customSlide";
import { SlidePreview } from "@/components/pricing/SlidePreview";
import { BlockRenderer } from "./BlockRenderer";
import { SlideFilterProvider, useSlideFilters, dimensionLabel } from "./SlideFilterContext";
import haraldFooterPng from "@/assets/harald-footer-bar.png";

interface Props {
  /** Editor's current slide id — used as initial slide. */
  currentSlideId?: string;
  /** Live config for the slide being edited (so unsaved changes show). */
  currentConfig?: CustomSlideConfig;
  onClose: () => void;
}

export function PresentationMode({ currentSlideId, currentConfig, onClose }: Props) {
  const items = useSlidesFlow((s) => s.items);
  const transition = useSlidesFlow((s) => s.transition);
  // If editor was opened standalone (no items in deck), present just the live slide.
  const standaloneList = useMemo(() => {
    if (items.length > 0) return null;
    if (!currentConfig) return null;
    return [{ id: currentSlideId ?? "live", kind: "custom" as const, config: currentConfig }];
  }, [items.length, currentSlideId, currentConfig]);

  const slides = standaloneList ?? items;
  const initial = Math.max(0, slides.findIndex((s) => s.id === currentSlideId));
  const [idx, setIdx] = useState(initial < 0 ? 0 : initial);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Try fullscreen on mount; non-fatal if blocked (overlay still covers viewport).
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { document.exitFullscreen?.().catch(() => {}); };
  }, []);

  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const goto = (n: number) => {
    if (n < 0 || n >= slides.length || n === idx) return;
    if (transition === "none") {
      setIdx(n);
      setAnimKey((k) => k + 1);
      return;
    }
    setPrevIdx(idx);
    setIdx(n);
    setAnimKey((k) => k + 1);
  };

  // Clear previous slide after transition duration (longest is 350ms).
  useEffect(() => {
    if (prevIdx === null) return;
    const t = setTimeout(() => setPrevIdx(null), 400);
    return () => clearTimeout(t);
  }, [prevIdx, animKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only navigation keys are active. Cmd+Z etc. suppressed.
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goto(idx - 1); return; }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goto(idx + 1); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); goto(0); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); goto(slides.length - 1); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [idx, slides.length, onClose, transition]);

  const slide = slides[idx];
  const prevSlide = prevIdx !== null ? slides[prevIdx] : null;
  const factor = Math.min(screen.w / CANVAS_W, screen.h / CANVAS_H) * 0.95;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#000", color: "#fff",
        userSelect: "none",
      }}
      onClick={(e) => {
        const x = e.clientX;
        const w = window.innerWidth;
        if (x < w * 0.2) goto(idx - 1);
        else if (x > w * 0.8) goto(idx + 1);
      }}
    >
      {/* Keyframes for transitions + block enter animations */}
      <style>{TRANSITION_CSS}</style>
      <SlideFilterProvider slideKey={slide?.id}>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {prevSlide && (
            <div
              key={`prev-${animKey}`}
              style={{
                position: "absolute", display: "flex", alignItems: "center", justifyContent: "center",
                inset: 0, animation: exitAnim(transition),
              }}
            >
              <SlideRenderArea slide={prevSlide} factor={factor} animateBlocks={false} />
            </div>
          )}
          {slide && (
            <div
              key={`cur-${animKey}`}
              style={{
                position: "absolute", display: "flex", alignItems: "center", justifyContent: "center",
                inset: 0, animation: enterAnim(transition),
              }}
            >
              <SlideRenderArea
                slide={slide}
                liveConfig={slide.id === currentSlideId ? currentConfig : undefined}
                factor={factor}
                animateBlocks
                animKey={animKey}
              />
            </div>
          )}
        </div>

        {/* Top-left: download PDF */}
        <button
          onClick={async () => {
            const list = items.length > 0 ? items : (slide ? [slide as unknown as import("@/lib/slidesFlow").SlideItem] : []);
            if (list.length === 0) return;
            await exportToPdf(list as import("@/lib/slidesFlow").SlideItem[], "apresentacao.pdf");
          }}
          aria-label="Baixar PDF"
          title="Baixar PDF"
          style={{
            position: "absolute", top: 16, left: 16,
            height: 36, padding: "0 12px", borderRadius: 18,
            background: "rgba(255,255,255,0.1)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", zIndex: 10, fontSize: 12,
          }}
        >
          <Download className="h-4 w-4" />
          Baixar PDF
        </button>

        {/* Top-right close */}
        <button
          onClick={onClose}
          aria-label="Sair da apresentação"
          style={{
            position: "absolute", top: 16, right: 16,
            width: 36, height: 36, borderRadius: 18,
            background: "rgba(255,255,255,0.1)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 10,
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Slide counter */}
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
          padding: "6px 14px", borderRadius: 999,
          background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 12, fontVariantNumeric: "tabular-nums",
          zIndex: 10,
        }}>
          {idx + 1} / {slides.length}
        </div>

        {/* Nav arrows (always visible, semi-transparent). */}
        <NavArrow side="left"  disabled={idx === 0}                  onClick={() => goto(idx - 1)} />
        <NavArrow side="right" disabled={idx === slides.length - 1}  onClick={() => goto(idx + 1)} />

        {/* Clear filters bar */}
        <ClearFiltersFloater />
      </SlideFilterProvider>
    </div>
  );
}

function NavArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={side === "left" ? "Slide anterior" : "Próximo slide"}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [side]: 16, width: 56, height: 96, borderRadius: 12,
        background: "rgba(255,255,255,0.06)", color: "#fff",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.25 : 0.7,
        transition: "opacity 150ms", zIndex: 10,
      } as React.CSSProperties}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget.style.opacity = "1"); }}
      onMouseLeave={(e) => { if (!disabled) (e.currentTarget.style.opacity = "0.7"); }}
    >
      <Icon className="h-7 w-7" />
    </button>
  );
}

function ClearFiltersFloater() {
  const { filters, clearAll } = useSlideFilters();
  if (filters.length === 0) return null;
  return (
    <div style={{
      position: "absolute", bottom: 18, right: 16,
      padding: "6px 12px", borderRadius: 999,
      background: "rgba(200, 16, 46, 0.85)", color: "#fff",
      display: "flex", alignItems: "center", gap: 8, fontSize: 12,
      zIndex: 10,
    }}>
      <FunnelIcon className="h-3.5 w-3.5" />
      <span>{filters.length} filtro{filters.length > 1 ? "s" : ""} ativo{filters.length > 1 ? "s" : ""}</span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-white hover:bg-white/15"
        onClick={clearAll}>
          Limpar ({filters.length})
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideRenderArea — picks the right renderer for the slide's kind.
// Custom slides get the live block renderer (cross-filter active). Others
// fall back to the read-only SlidePreview SVG.
// ---------------------------------------------------------------------------
type DeckSlide = { id: string; kind: string; config?: unknown };

function SlideRenderArea({
  slide, liveConfig, factor,
}: { slide: DeckSlide; liveConfig?: CustomSlideConfig; factor: number }) {
  const w = CANVAS_W * factor;
  const h = CANVAS_H * factor;

  const inner = (() => {
    if (slide.kind === "custom") {
      const cfg = liveConfig ?? (slide.config as CustomSlideConfig | undefined);
      if (!cfg) return null;
      return (
        <CustomCanvasReadOnly config={cfg} />
      );
    }
    // Non-custom: fall back to SlidePreview (no scaling needed — it's responsive).
    return (
      <div style={{ width: CANVAS_W, height: CANVAS_H, background: "#fff" }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SlidePreview item={slide as any} />
      </div>
    );
  })();

  return (
    <div style={{
      width: w, height: h,
      background: "#fff",
      boxShadow: "0 12px 60px rgba(0,0,0,0.6)",
      overflow: "hidden",
      borderRadius: 4,
    }}>
      <div style={{
        width: CANVAS_W, height: CANVAS_H,
        transform: `scale(${factor})`, transformOrigin: "top left",
        position: "relative",
      }}>
        {inner}
      </div>
    </div>
  );
}

export function CustomCanvasReadOnly({ config }: { config: CustomSlideConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      style={{
        width: CANVAS_W, height: CANVAS_H,
        background: config.background === "transparent" ? "#FFFFFF" : `#${config.background}`,
        position: "relative", overflow: "hidden",
      }}
    >
      {[...config.blocks].sort((a, b) => a.z - b.z).map((blk: CustomBlock) => (
        <div
          key={blk.id}
          style={{
            position: "absolute",
            left: blk.x, top: blk.y, width: blk.w, height: blk.h,
            zIndex: blk.z,
            // Charts handle pointer-events for cross-filter clicks; others passive.
            pointerEvents: blk.kind === "chart" ? "auto" : "none",
          }}
        >
          <BlockRenderer block={blk} />
        </div>
      ))}
      {config.showHaraldFooter && (
        <img
          src={haraldFooterPng}
          alt=""
          style={{
            position: "absolute", left: 0, bottom: 0,
            width: CANVAS_W, height: FOOTER_H,
            pointerEvents: "none", zIndex: 99999,
          }}
        />
      )}
    </div>
  );
}
