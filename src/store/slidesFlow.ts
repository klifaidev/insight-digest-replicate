// Slides Flow store — itens em construção + presets persistidos em localStorage.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SlideItem, SlideKind } from "@/lib/slidesFlow";
import { defaultItem, newId } from "@/lib/slidesFlow";

export interface SlidesPreset {
  id: string;
  name: string;
  description?: string;
  items: SlideItem[];
  createdAt: number;
  updatedAt: number;
}

export type SlideTransition = "none" | "fade" | "slide-left" | "slide-up" | "zoom";

interface SlidesFlowState {
  items: SlideItem[];
  presets: SlidesPreset[];
  selectedId: string | null;
  transition: SlideTransition;

  // Itens
  addItem: (kind: SlideKind) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<SlideItem> | ((s: SlideItem) => SlideItem)) => void;
  reorder: (sourceId: string, targetId: string) => void;
  clearItems: () => void;
  duplicateDeck: () => void;
  select: (id: string | null) => void;
  setTransition: (t: SlideTransition) => void;

  // Presets
  savePreset: (name: string, description?: string) => SlidesPreset;
  overwritePreset: (id: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string, description?: string) => void;
}

export const useSlidesFlow = create<SlidesFlowState>()(
  persist(
    (set, get) => ({
      items: [],
      presets: [],
      selectedId: null,
      transition: "fade",

      setTransition: (t) => set({ transition: t }),

      addItem: (kind) =>
        set((s) => {
          const item = defaultItem(kind);
          return { items: [...s.items, item], selectedId: item.id };
        }),

      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      duplicateItem: (id) =>
        set((s) => {
          const idx = s.items.findIndex((i) => i.id === id);
          if (idx < 0) return {};
          const orig = s.items[idx];
          const clone = JSON.parse(JSON.stringify(orig)) as SlideItem;
          clone.id = newId();
          if (clone.label) clone.label = `${clone.label} (cópia)`;
          const items = [...s.items];
          items.splice(idx + 1, 0, clone);
          return { items, selectedId: clone.id };
        }),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.id !== id) return i;
            return typeof patch === "function" ? patch(i) : ({ ...i, ...patch } as SlideItem);
          }),
        })),

      reorder: (sourceId, targetId) =>
        set((s) => {
          const from = s.items.findIndex((i) => i.id === sourceId);
          const to = s.items.findIndex((i) => i.id === targetId);
          if (from < 0 || to < 0 || from === to) return {};
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved);
          return { items };
        }),

      clearItems: () => set({ items: [], selectedId: null }),

      duplicateDeck: () =>
        set((s) => {
          if (s.items.length === 0) return {};
          const clones = s.items.map((i) => {
            const c = JSON.parse(JSON.stringify(i)) as SlideItem;
            c.id = newId();
            return c;
          });
          return { items: [...s.items, ...clones], selectedId: clones[0]?.id ?? s.selectedId };
        }),
      select: (id) => set({ selectedId: id }),

      savePreset: (name, description) => {
        const now = Date.now();
        const preset: SlidesPreset = {
          id: newId(),
          name: name.trim() || "Pré-definição sem nome",
          description: description?.trim(),
          // deep clone para evitar mutações futuras vazarem para o preset
          items: JSON.parse(JSON.stringify(get().items)),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ presets: [...s.presets, preset] }));
        return preset;
      },

      overwritePreset: (id) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id
              ? { ...p, items: JSON.parse(JSON.stringify(s.items)), updatedAt: Date.now() }
              : p,
          ),
        })),

      loadPreset: (id) => {
        const p = get().presets.find((x) => x.id === id);
        if (!p) return;
        // Deep clone + regenera ids dos itens para evitar conflito com a sessão atual
        const items = p.items.map((i) => ({
          ...JSON.parse(JSON.stringify(i)),
          id: newId(),
        })) as SlideItem[];
        set({ items, selectedId: items[0]?.id ?? null });
      },

      deletePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      renamePreset: (id, name, description) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id
              ? { ...p, name: name.trim() || p.name, description: description?.trim(), updatedAt: Date.now() }
              : p,
          ),
        })),
    }),
    {
      name: "pricing.slidesFlow.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, presets: s.presets, transition: s.transition }),
    },
  ),
);
