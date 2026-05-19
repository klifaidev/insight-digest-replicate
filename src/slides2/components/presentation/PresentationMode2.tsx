// Slides 2.0 — Premium fullscreen presentation mode.
//
// Redesigned variant of PresentationMode.tsx with auto-hiding floating controls,
// split-screen presenter panel, laser pointer, blackout, and refined transitions.
// Does NOT touch the original PresentationMode.tsx.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, X, StickyNote, Crosshair, Square, Download, Timer,
} from "lucide-react";
import { exportToPdf } from "@/lib/exportPdf";
import { ScaledPreview, SlidePreview } from "@/components/pricing/SlidePreview";
import {
  CANVAS_W, CANVAS_H, FOOTER_H,
  type CustomSlideConfig, type CustomBlock,
} from "@/lib/customSlide";
import { BlockRenderer } from "@/components/pricing/custom/BlockRenderer";
import { SlideFilterProvider } from "@/components/pricing/custom/SlideFilterContext";
import type { SlideItem } from "@/lib/slidesFlow";
import haraldFooterPng from "@/assets/harald-footer-bar.png";

interface PresentationMode2Props {
  items: SlideItem[];
  initialSlideId?: string;
  currentConfig?: CustomSlideConfig;
  onClose: () => void;
}

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export function PresentationMode2({
  items, initialSlideId, currentConfig, onClose,
}: PresentationMode2Props) {
  const slides = useMemo<SlideItem[]>(() => {
    if (items.length > 0) return items;
    if (currentConfig) {
      return [{
        id: initialSlideId ?? "live",
        kind: "custom",
        config: currentConfig,
      } as SlideItem];
    }
    return [];
  }, [items, currentConfig, initialSlideId]);

  const initial = Math.max(0, slides.findIndex((s) => s.id === initialSlideId));
  const [idx, setIdx] = useState(initial < 0 ? 0 : initial);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [presenterMode, setPresenterMode] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [laser, setLaser] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fullscreen on mount
  useEffect(() => {
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* noop */ }
    return () => { try { document.exitFullscreen?.().catch(() => {}); } catch { /* noop */ } };
  }, []);

  // Resize tracking
  useEffect(() => {
    const fn = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Presenter timer
  useEffect(() => {
    startedAtRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-hide controls
  const bumpControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  };
  useEffect(() => {
    bumpControls();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Laser pointer tracking
  useEffect(() => {
    if (!laser) return;
    const onMove = (e: MouseEvent) => setLaserPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [laser]);

  const goto = (n: number) => {
    if (n < 0 || n >= slides.length || n === idx) return;
    setPrevIdx(idx);
    setIdx(n);
    setAnimKey((k) => k + 1);
  };

  useEffect(() => {
    if (prevIdx === null) return;
    const t = setTimeout(() => setPrevIdx(null), 400);
    return () => clearTimeout(t);
  }, [prevIdx, animKey]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blackout && e.key !== "b" && e.key !== "B" && e.key !== "Escape") {
        e.preventDefault();
        setBlackout(false);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goto(idx - 1); return; }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault(); goto(idx + 1); return;
      }
      if (e.key === "b" || e.key === "B") { e.preventDefault(); setBlackout((v) => !v); return; }
      if (e.key === "l" || e.key === "L") { e.preventDefault(); setLaser((v) => !v); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); setThumbsOpen((v) => !v); return; }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); setPresenterMode((v) => !v); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [idx, slides.length, onClose, blackout]);

  const slide = slides[idx] as SlideItem | undefined;
  const nextSlide = slides[idx + 1] as SlideItem | undefined;
  const prevSlide = prevIdx !== null ? slides[prevIdx] : null;

  // Available stage area (split when presenter mode is on)
  const stageW = presenterMode ? screen.w * 0.65 : screen.w;
  const stageH = screen.h;
  const factor = Math.min(stageW / CANVAS_W, stageH / CANVAS_H) * 0.92;
  const displayW = CANVAS_W * factor;
  const displayH = CANVAS_H * factor;

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const handleExportPdf = async () => {
    if (slides.length === 0) return;
    await exportToPdf(slides, "apresentacao.pdf");
  };

  const speakerNotes =
    slide && slide.kind === "custom"
      ? ((slide.config as CustomSlideConfig & { speakerNotes?: string })?.speakerNotes ?? "")
      : "";

  return (
    <div
      onMouseMove={bumpControls}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#000000", color: "#fff",
        userSelect: "none",
        cursor: laser ? "none" : undefined,
        display: "flex",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Stage */}
      <SlideFilterProvider slideKey={slide?.id}>
        <div style={{ position: "relative", width: stageW, height: stageH, overflow: "hidden" }}>
          {/* Slide container */}
          <div
            style={{
              position: "absolute",
              left: (stageW - displayW) / 2,
              top: (stageH - displayH) / 2,
              width: displayW,
              height: displayH,
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.05), 0 48px 100px -24px rgba(0,0,0,0.8)",
              overflow: "hidden",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            {prevSlide && (
              <div
                key={`prev-${animKey}`}
                style={{
                  position: "absolute", inset: 0,
                  animation: `slideExitFade 280ms ${EASE} both`,
                }}
              >
                <SlideArea slide={prevSlide} factor={factor} />
              </div>
            )}
            {slide && (
              <div
                key={`cur-${animKey}`}
                style={{
                  position: "absolute", inset: 0,
                  animation: `slideEnterFade 320ms ${EASE} both`,
                }}
              >
                <SlideArea
                  slide={slide}
                  factor={factor}
                  liveConfig={slide.id === initialSlideId ? currentConfig : undefined}
                />
              </div>
            )}
          </div>

          {/* Laser pointer (within stage) */}
          {laser && laserPos && (
            <div
              style={{
                position: "fixed",
                left: laserPos.x - 8, top: laserPos.y - 8,
                width: 16, height: 16, borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,50,50,0.9) 30%, transparent 70%)",
                boxShadow:
                  "0 0 12px rgba(255,50,50,0.6), 0 0 24px rgba(255,50,50,0.3)",
                pointerEvents: "none", zIndex: 10000,
              }}
            />
          )}

          {/* Floating control bar */}
          <div
            style={{
              position: "absolute", bottom: 20, left: "50%",
              transform: "translateX(-50%)",
              opacity: controlsVisible ? 1 : 0,
              transition: `opacity 300ms ${EASE}`,
              pointerEvents: controlsVisible ? "auto" : "none",
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 16px",
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              zIndex: 30,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CtrlBtn title="Anterior (←)" onClick={() => goto(idx - 1)} disabled={idx === 0}>
              <ChevronLeft size={16} />
            </CtrlBtn>
            <span style={{
              color: "rgba(255,255,255,0.5)", fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              width: 48, textAlign: "center", fontVariantNumeric: "tabular-nums",
            }}>
              {idx + 1} / {slides.length}
            </span>
            <CtrlBtn title="Próximo (→)" onClick={() => goto(idx + 1)} disabled={idx === slides.length - 1}>
              <ChevronRight size={16} />
            </CtrlBtn>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
            <CtrlBtn title="Notas (P)" onClick={() => setPresenterMode((v) => !v)} active={presenterMode}>
              <StickyNote size={14} />
            </CtrlBtn>
            <CtrlBtn title="Laser (L)" onClick={() => setLaser((v) => !v)} active={laser} accent="red">
              <Crosshair size={14} />
            </CtrlBtn>
            <CtrlBtn title="Blackout (B)" onClick={() => setBlackout((v) => !v)} active={blackout}>
              <Square size={14} />
            </CtrlBtn>
            <CtrlBtn title="Exportar PDF" onClick={handleExportPdf}>
              <Download size={14} />
            </CtrlBtn>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
            <CtrlBtn title="Sair (Esc)" onClick={onClose}>
              <X size={14} />
            </CtrlBtn>
          </div>

          {/* Thumbnail strip */}
          {thumbsOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 0, right: 0,
                bottom: controlsVisible ? 80 : 16,
                background: "rgba(0,0,0,0.8)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderTop: "1px solid rgba(255,255,255,0.1)",
                padding: "8px 16px",
                display: "flex", gap: 8, overflowX: "auto",
                zIndex: 25,
                animation: `stripSlideUp 200ms ${EASE} both`,
                transition: `bottom 300ms ${EASE}`,
              }}
            >
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => goto(i)}
                  style={{
                    flex: "0 0 auto",
                    width: 100, height: Math.round(100 * (CANVAS_H / CANVAS_W)),
                    borderRadius: 4, overflow: "hidden", padding: 0,
                    background: "#fff", cursor: "pointer",
                    boxShadow: i === idx ? "0 0 0 2px #fff" : "0 0 0 1px rgba(255,255,255,0.15)",
                  }}
                >
                  <ScaledPreview item={s} targetWidth={100} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Presenter panel */}
        {presenterMode && (
          <div
            style={{
              width: screen.w * 0.35, height: stageH,
              background: "#111",
              borderLeft: "1px solid rgba(255,255,255,0.05)",
              display: "flex", flexDirection: "column",
              padding: 16, gap: 12, overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
              color: "rgba(255,255,255,0.4)",
            }}>
              Atual
            </div>
            {slide && (
              <div style={{
                width: "100%",
                borderRadius: 4, overflow: "hidden", background: "#fff",
              }}>
                <ScaledPreview item={slide} targetWidth={screen.w * 0.35 - 32} />
              </div>
            )}

            <div style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
              color: "rgba(255,255,255,0.4)", marginTop: 4,
            }}>
              Próximo
            </div>
            {nextSlide ? (
              <div style={{
                width: "70%", opacity: 0.6,
                borderRadius: 4, overflow: "hidden", background: "#fff",
              }}>
                <ScaledPreview item={nextSlide} targetWidth={(screen.w * 0.35 - 32) * 0.7} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                Fim da apresentação
              </div>
            )}

            <div style={{
              marginTop: 8,
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <div style={{
                fontSize: 48, lineHeight: 1, fontWeight: 300,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                color: "rgba(255,255,255,0.8)",
                fontVariantNumeric: "tabular-nums",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <Timer size={20} className="opacity-50" />
                {mmss}
              </div>
              <div style={{
                marginTop: 4,
                fontSize: 11, color: "rgba(255,255,255,0.3)",
              }}>
                Slide {idx + 1} de {slides.length}
              </div>
            </div>

            <div style={{
              flex: 1, minHeight: 0,
              marginTop: 8,
              padding: 16, borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              overflowY: "auto",
              fontSize: 14, lineHeight: 1.6,
              color: "rgba(255,255,255,0.8)",
              whiteSpace: "pre-wrap",
            }}>
              {speakerNotes.trim()
                ? speakerNotes
                : <span style={{ opacity: 0.4, fontStyle: "italic" }}>Sem anotações.</span>}
            </div>
          </div>
        )}

        {/* Blackout overlay */}
        {blackout && (
          <div
            onClick={() => setBlackout(false)}
            style={{
              position: "fixed", inset: 0, background: "#000",
              zIndex: 9998, cursor: "pointer",
              animation: `blackoutFade 150ms ${EASE} both`,
            }}
          />
        )}
      </SlideFilterProvider>

      {laser && <style>{`* { cursor: none !important; }`}</style>}
    </div>
  );
}

function CtrlBtn({
  children, onClick, title, disabled, active, accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  accent?: "red";
}) {
  const color = active
    ? (accent === "red" ? "#f87171" : "#fff")
    : "rgba(255,255,255,0.7)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 999,
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        border: "none", color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.3 : 1,
        transition: `color 150ms ${EASE}, background 150ms ${EASE}`,
      }}
      onMouseEnter={(e) => { if (!disabled && !active) e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { if (!disabled && !active) e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
    >
      {children}
    </button>
  );
}

type DeckSlide = SlideItem;

function SlideArea({
  slide, factor, liveConfig,
}: { slide: DeckSlide; factor: number; liveConfig?: CustomSlideConfig }) {
  if (slide.kind === "custom") {
    const cfg = liveConfig ?? (slide.config as CustomSlideConfig);
    if (!cfg) return null;
    return (
      <div style={{
        width: CANVAS_W * factor, height: CANVAS_H * factor,
        background: cfg.background === "transparent" ? "#FFFFFF" : `#${cfg.background}`,
        overflow: "hidden", position: "relative",
      }}>
        <div style={{
          width: CANVAS_W, height: CANVAS_H,
          transform: `scale(${factor})`, transformOrigin: "top left",
          position: "relative",
        }}>
          <CustomCanvas config={cfg} />
        </div>
      </div>
    );
  }
  return (
    <div style={{
      width: CANVAS_W * factor, height: CANVAS_H * factor,
      background: "#fff", overflow: "hidden", position: "relative",
    }}>
      <div style={{
        width: CANVAS_W, height: CANVAS_H,
        transform: `scale(${factor})`, transformOrigin: "top left",
        position: "relative",
      }}>
        <SlidePreview item={slide} />
      </div>
    </div>
  );
}

function CustomCanvas({ config }: { config: CustomSlideConfig }) {
  const sorted = [...config.blocks].sort((a, b) => a.z - b.z);
  return (
    <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
      {sorted.map((blk: CustomBlock, i) => {
        const anim = blk.enterAnimation ?? "none";
        const delay = i * 60;
        const animation =
          anim === "fade" ? `blkFade 320ms ${EASE} ${delay}ms both` :
          anim === "slide-up" ? `blkSlideUp 350ms ${EASE} ${delay}ms both` :
          anim === "pop" ? `blkPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both` :
          undefined;
        return (
          <div
            key={blk.id}
            style={{
              position: "absolute",
              left: blk.x, top: blk.y, width: blk.w, height: blk.h,
              zIndex: blk.z,
              pointerEvents: blk.kind === "chart" ? "auto" : "none",
              animation,
            }}
          >
            <BlockRenderer block={blk} />
          </div>
        );
      })}
      {config.showHaraldFooter && (
        <img src={haraldFooterPng} alt=""
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

const KEYFRAMES = `
@keyframes slideEnterFade { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes slideExitFade  { from { opacity: 1; } to { opacity: 0; } }
@keyframes stripSlideUp   { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes blackoutFade   { from { opacity: 0; } to { opacity: 1; } }
@keyframes blkFade        { from { opacity: 0; } to { opacity: 1; } }
@keyframes blkSlideUp     { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes blkPop         { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
`;
