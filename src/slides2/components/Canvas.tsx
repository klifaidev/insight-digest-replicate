// Canvas area do Slides 2.0 — encapsula dimensionamento, render do slide ativo,
// cursores de colaboradores e grid opcional.
import { useState } from "react";
import { CANVAS_W, CANVAS_H } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import type { CollabUser } from "@/lib/collaboration";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { useEditorPrefs } from "@/components/pricing/custom/editorPrefs";

const PAD = 48;

export interface CanvasAreaProps {
  item: SlideItem | null;
  onItemChange: (patch: Partial<SlideItem>) => void;
  /** Ignorado — calculado internamente para garantir consistência. */
  factor?: number;
  containerWidth: number;
  containerHeight: number;
  collaborators?: CollabUser[];
  onCursorMove?: (x: number, y: number) => void;
}

export function CanvasArea({
  item, onItemChange, containerWidth, containerHeight,
  collaborators, onCursorMove,
}: CanvasAreaProps) {
  const [hovered, setHovered] = useState(false);
  const { gridEnabled } = useEditorPrefs();

  const factor = Math.max(
    0.05,
    Math.min(
      (containerWidth - PAD * 2) / CANVAS_W,
      (containerHeight - PAD * 2) / CANVAS_H,
    ),
  );
  const displayW = Math.floor(CANVAS_W * factor);
  const displayH = Math.floor(CANVAS_H * factor);
  const left = Math.max(0, Math.floor((containerWidth - displayW) / 2));
  const top = Math.max(0, Math.floor((containerHeight - displayH) / 2));

  if (!item) return null;

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        data-canvas-hovered={hovered ? "true" : "false"}
        style={{
          position: "absolute",
          left,
          top,
          width: displayW,
          height: displayH,
          overflow: "hidden",
          borderRadius: 2,
          background: "#fff",
          boxShadow:
            "0 32px 64px -16px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {item.kind === "custom" ? (
          <div
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${factor})`,
              transformOrigin: "top left",
            }}
            onMouseMove={
              onCursorMove
                ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / factor;
                    const y = (e.clientY - rect.top) / factor;
                    onCursorMove(x, y);
                  }
                : undefined
            }
          >
            <CustomSlideEditor
              slideId={item.id}
              config={item.config}
              onChange={(cfg) =>
                onItemChange({ config: cfg } as Partial<SlideItem>)
              }
              collaborators={collaborators}
              onCursorMove={onCursorMove}
            />
          </div>
        ) : (
          <ScaledPreview item={item} targetWidth={displayW} />
        )}

        {/* Grid overlay */}
        {gridEnabled && (
          <svg
            width={displayW}
            height={displayH}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden
          >
            <defs>
              <pattern
                id="slides2-grid-dots"
                x="0" y="0"
                width={Math.max(4, 10 * factor)}
                height={Math.max(4, 10 * factor)}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="0.5" cy="0.5" r="0.5" fill="rgba(255,255,255,0.1)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#slides2-grid-dots)" />
          </svg>
        )}

        {/* Cursores de colaboradores */}
        {collaborators && collaborators.length > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 9999,
            }}
          >
            {collaborators
              .filter(
                (c) =>
                  c.slideId === item.id &&
                  typeof c.cursorX === "number" &&
                  typeof c.cursorY === "number",
              )
              .map((c) => (
                <div
                  key={c.id}
                  style={{
                    position: "absolute",
                    left: (c.cursorX ?? 0) * factor,
                    top: (c.cursorY ?? 0) * factor,
                    transition: "transform 50ms linear, left 50ms linear, top 50ms linear",
                    transform: "translate(-2px, -2px)",
                  }}
                >
                  <div
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: c.color,
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 6,
                      fontSize: 10,
                      lineHeight: 1.2,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: c.color,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}
                  >
                    {c.name}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CanvasArea;
