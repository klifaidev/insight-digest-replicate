// Zustand + zundo store for the CustomSlideEditor.
// Wraps the slide config in a temporal store so every mutation is undoable.
//
// Architecture
// ------------
// • Module-level store (only one editor is ever mounted at a time).
// • Editor mounts → calls `bind(config, onChange, slideId)` which:
//     1. Loads the incoming config
//     2. Clears the undo/redo history
//     3. Stores the parent's onChange so subsequent mutations stream out.
// • Every action sets `lastActionLabel` then mutates `config`. zundo
//   snapshots the full state on each mutation. Tooltips read the label
//   from the most recent past/future state.
// • Stack size capped at 50 snapshots (zundo `limit` option).

import { create, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { temporal } from "zundo";
import { useEffect } from "react";
import type {
  BlockGroup,
  CustomBlock,
  CustomBlockKind,
  CustomChartType,
  CustomSlideConfig,
} from "@/lib/customSlide";
import { newBlock, newChartBlock } from "@/lib/customSlide";

export type EditorActionLabel =
  | "Adicionar bloco"
  | "Excluir bloco"
  | "Excluir blocos"
  | "Mover bloco"
  | "Mover blocos"
  | "Redimensionar bloco"
  | "Alterar estilo"
  | "Alterar dados"
  | "Duplicar bloco"
  | "Duplicar blocos"
  | "Alterar ordem"
  | "Bloquear / Desbloquear"
  | "Alterar slide"
  | "Alinhar blocos"
  | "Agrupar blocos"
  | "Desagrupar blocos";

interface EditorState {
  config: CustomSlideConfig | null;
  slideId: string | undefined;
  lastActionLabel: EditorActionLabel | null;
  /** Multi-selection (B8.2). Empty means nothing selected. */
  selectedIds: string[];
  /** Group-edit mode: clicking a member dives into editing that single block. */
  groupEditMemberId: string | null;
}

// Mutations live outside the partialized state so zundo doesn't snapshot them.
let onChangeRef: ((next: CustomSlideConfig) => void) | null = null;
let suppressEmit = false;

const baseStore = create<EditorState>()(
  temporal(
    () => ({
      config: null,
      slideId: undefined,
      lastActionLabel: null,
      selectedIds: [],
      groupEditMemberId: null,
    }),
    {
      limit: 50,
      // Only track the slide config + label. selection / slideId not undoable.
      partialize: (s) => ({ config: s.config, lastActionLabel: s.lastActionLabel }),
      equality: (a, b) => a.config === b.config,
    },
  ),
);

function emit(next: CustomSlideConfig) {
  if (suppressEmit || !onChangeRef) return;
  onChangeRef(next);
}

function mutate(label: EditorActionLabel, updater: (cfg: CustomSlideConfig) => CustomSlideConfig) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const next = updater(cur);
  if (next === cur) return;
  baseStore.setState({ config: next, lastActionLabel: label });
  emit(next);
}

// ----- Public API ----------------------------------------------------------

/**
 * Bind the store to the parent's config + onChange. Called from the editor
 * effect on mount and whenever `slideId` changes.
 */
export function bindEditorStore(
  config: CustomSlideConfig,
  onChange: (next: CustomSlideConfig) => void,
  slideId: string | undefined,
) {
  onChangeRef = onChange;
  const prevSlide = baseStore.getState().slideId;
  // Suppress the emit caused by the initial load.
  suppressEmit = true;
  baseStore.setState({ config, slideId, lastActionLabel: null, selectedIds: [], groupEditMemberId: null });
  // Reset undo history when binding to a new slide (or first mount).
  if (prevSlide !== slideId) {
    baseStore.temporal.getState().clear();
  }
  suppressEmit = false;
}

/** Apply external config changes from parent without polluting the undo stack. */
export function syncFromParent(config: CustomSlideConfig) {
  if (baseStore.getState().config === config) return;
  suppressEmit = true;
  baseStore.setState({ config });
  suppressEmit = false;
}

// ----- Mutations ----------------------------------------------------------

export function setBackground(hex: string) {
  mutate("Alterar slide", (c) => ({ ...c, background: hex }));
}

export function setShowHaraldFooter(v: boolean) {
  mutate("Alterar slide", (c) => ({ ...c, showHaraldFooter: v }));
}

export function addBlockAction(kind: CustomBlockKind): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const blk = newBlock(kind, zTop);
  mutate("Adicionar bloco", (c) => ({ ...c, blocks: [...c.blocks, blk] }));
  return blk.id;
}

export function addChartBlockAction(chartType: CustomChartType): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const blk = newChartBlock(chartType, zTop);
  mutate("Adicionar bloco", (c) => ({ ...c, blocks: [...c.blocks, blk] }));
  return blk.id;
}

export function deleteBlockAction(id: string) {
  mutate("Excluir bloco", (c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
}

export function duplicateBlockAction(id: string): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const orig = cur.blocks.find((b) => b.id === id);
  if (!orig) return null;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const clone = {
    ...JSON.parse(JSON.stringify(orig)),
    id: crypto.randomUUID(),
    x: orig.x + 20,
    y: orig.y + 20,
    z: zTop + 1,
    locked: false,
  } as CustomBlock;
  mutate("Duplicar bloco", (c) => ({ ...c, blocks: [...c.blocks, clone] }));
  return clone.id;
}

/**
 * Generic patch. The `label` decides which undo bucket the change falls into.
 * Move / resize / style / data / lock all funnel through here.
 */
export function patchBlockAction(id: string, patch: Partial<CustomBlock>, label: EditorActionLabel) {
  mutate(label, (c) => ({
    ...c,
    blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as CustomBlock) : b)),
  }));
}

export function bringForwardAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  patchBlockAction(id, { z: zTop + 1 } as Partial<CustomBlock>, "Alterar ordem");
}

export function sendBackAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const minZ = cur.blocks.reduce((m, b) => Math.min(m, b.z), 0);
  patchBlockAction(id, { z: minZ - 1 } as Partial<CustomBlock>, "Alterar ordem");
}

export function bringToFrontAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  patchBlockAction(id, { z: zTop + 1 } as Partial<CustomBlock>, "Alterar ordem");
}

export function sendToBackAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const minZ = cur.blocks.reduce((m, b) => Math.min(m, b.z), 0);
  patchBlockAction(id, { z: minZ - 1 } as Partial<CustomBlock>, "Alterar ordem");
}

export function toggleLockAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const blk = cur.blocks.find((b) => b.id === id);
  if (!blk) return;
  patchBlockAction(id, { locked: !blk.locked } as Partial<CustomBlock>, "Bloquear / Desbloquear");
}

// ----- Undo / redo --------------------------------------------------------

export function undo() {
  const t = baseStore.temporal.getState();
  if (t.pastStates.length === 0) return;
  t.undo();
  const cur = baseStore.getState().config;
  if (cur) emit(cur);
}

export function redo() {
  const t = baseStore.temporal.getState();
  if (t.futureStates.length === 0) return;
  t.redo();
  const cur = baseStore.getState().config;
  if (cur) emit(cur);
}

// ----- Hooks --------------------------------------------------------------

export function useEditorConfig(): CustomSlideConfig | null {
  return useStore(baseStore, (s) => s.config);
}

/** Returns { canUndo, canRedo, undoLabel, redoLabel }. Re-renders on changes. */
export function useUndoRedoState() {
  return useStore(
    baseStore.temporal,
    useShallow((t) => {
      const past = t.pastStates;
      const fut = t.futureStates;
      const undoLabel = past.length > 0
        ? (baseStore.getState().lastActionLabel ?? null)
        : null;
      const redoLabel = fut.length > 0
        ? ((fut[fut.length - 1] as { lastActionLabel?: EditorActionLabel | null })
            .lastActionLabel ?? null)
        : null;
      return {
        canUndo: past.length > 0,
        canRedo: fut.length > 0,
        undoLabel,
        redoLabel,
      };
    }),
  );
}

/** Hook helper: bind store on mount + global Cmd/Ctrl+Z shortcuts. */
export function useEditorBinding(
  config: CustomSlideConfig,
  onChange: (next: CustomSlideConfig) => void,
  slideId: string | undefined,
) {
  useEffect(() => {
    bindEditorStore(config, onChange, slideId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId]);

  // Keep onChange ref fresh.
  useEffect(() => {
    onChangeRef = onChange;
  }, [onChange]);

  // If parent pushes a new config (other than what we just emitted), sync.
  useEffect(() => {
    syncFromParent(config);
  }, [config]);
}
