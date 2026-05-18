// Editor preferences persisted to localStorage (B8.4).
// Grid + manual zoom.

import { useEffect, useState } from "react";

export type GridSize = 4 | 8 | 16 | 32;

interface EditorPrefs {
  gridEnabled: boolean;
  gridSize: GridSize;
  zoom: number; // 0.5 – 1.5, multiplies the fit factor
}

const STORAGE_KEY = "harald.editorPrefs.v1";
const DEFAULT: EditorPrefs = { gridEnabled: false, gridSize: 8, zoom: 1 };

function clampZoom(z: unknown): number {
  const n = typeof z === "number" && Number.isFinite(z) ? z : 1;
  return Math.max(0.5, Math.min(1.5, n));
}

function read(): EditorPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    return {
      gridEnabled: !!parsed.gridEnabled,
      gridSize: ([4, 8, 16, 32] as const).includes(parsed.gridSize as GridSize)
        ? (parsed.gridSize as GridSize)
        : 8,
      zoom: clampZoom(parsed.zoom),
    };
  } catch {
    return DEFAULT;
  }
}

function write(p: EditorPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

let current: EditorPrefs = read();
const subs = new Set<() => void>();

export function getEditorPrefs(): EditorPrefs { return current; }
export function setEditorPrefs(patch: Partial<EditorPrefs>) {
  const next = { ...current, ...patch };
  if (patch.zoom !== undefined) next.zoom = clampZoom(patch.zoom);
  current = next;
  write(current);
  subs.forEach((fn) => fn());
}

export function useEditorPrefs(): EditorPrefs & {
  setGridEnabled: (v: boolean) => void;
  setGridSize: (s: GridSize) => void;
  setZoom: (z: number) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  return {
    ...current,
    setGridEnabled: (v) => setEditorPrefs({ gridEnabled: v }),
    setGridSize: (s) => setEditorPrefs({ gridSize: s }),
    setZoom: (z) => setEditorPrefs({ zoom: z }),
  };
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
