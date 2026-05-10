## Goal

Transform the current chart block in the slide editor into a PowerPoint-grade chart system: more chart types, a dedicated **Design** panel per chart type with rich, dynamic, real-time controls, and exports that respect every setting.

Given the size of the request, I'll deliver this in **4 phases** so you can validate as we go. We can ship each phase independently.

---

## Phase 1 — Foundation (data model + new editor architecture)

**Files touched:** `src/lib/customSlide.ts`, `src/components/pricing/custom/CustomSlideEditor.tsx`, new `src/components/pricing/custom/chart/*`

1. Extend `ChartBlock` to a discriminated union by `chartType`:
   `line | bar | column | hbar | pie | donut | bubble | area | scatter | combo | waterfall`.
2. Add a shared `ChartStyle` object on every chart block:
   - `general`: title (text, size, color, bold, italic, show), background, border (color, width), padding, legend (show, position).
   - `axes`: x/y `{ show, labelSize, labelColor, titleText, titleSize, titleColor, ticks, lineColor, lineWidth, min, max, format }`, plus `secondaryY` for combo.
   - `gridlines`: `{ show, color, style: solid|dashed }`.
   - `dataLabels`: `{ show, position, size, color, autoContrast, bold, italic, format, showSeries, showCategory, bgColor, bgOpacity, borderColor, borderWidth }`.
   - `series[]`: per-series overrides (color, lineStyle, thickness, marker, fillOpacity, smooth, areaFill, etc.).
3. New right-panel architecture:
   - Replace the current flat **Design** tab with a **chart inspector**: collapsible sections (`General`, `Axes`, `Series`, `Data Labels`, `Type-specific`).
   - Sections render dynamically based on selected `chartType`.
   - Reusable `ColorPicker` (HEX + opacity slider + brand palette from `index.css` tokens), `NumberStepper` (typing + ± buttons), `Toggle`, `Select`.
4. State persisted per block (already the case); migration ensures old blocks get sensible defaults.

**Deliverable:** new chart inspector UI working for the existing `line`/`bar` types, no regressions.

---

## Phase 2 — New chart types in the canvas (renderer)

**Files touched:** `src/components/pricing/custom/BlockRenderer.tsx`, new `src/components/pricing/custom/chart/Renderers.tsx`

Implement each renderer with **Recharts** (already in repo) + a custom Waterfall:

- Pie / Donut (`PieChart`, donut via `innerRadius`).
- Horizontal bar (`BarChart layout="vertical"`).
- Bubble (`ScatterChart` with `ZAxis`).
- Area (`AreaChart`, stacked/overlapping).
- Scatter (`ScatterChart`).
- Combo (line + bar via `ComposedChart`, secondary Y).
- Waterfall (custom: stacked invisible base + colored deltas + connector segments).

All renderers consume the unified `ChartStyle` so design settings apply live.

---

## Phase 3 — Type-specific design controls

For each chart type, expose the controls listed in your spec:

- **Line:** style/thickness/color per series, marker (shape/size/colors), smooth, area fill, hover highlight.
- **Bar / Column:** mode (grouped / stacked / 100%), gap width, overlap, per-category color override, border, corner radius.
- **Pie / Donut:** slice explosion, donut hole size, start angle, per-slice color, label composition (value / % / name).
- **Bubble:** min/max bubble size, fill+opacity, border, show size as label, axis mapping.
- **Area:** fill opacity per series, stacked toggle, line-on-top.
- **Waterfall:** classify each bar (positive/negative/total), color per category, connector lines, running total, label position, gap width.
- **Combo:** per-series choice between bar/line, secondary Y assignment.

---

## Phase 4 — Export parity (PPTX)

**File touched:** `src/lib/exportCustomSlide.tsx`

- Today the export captures the live canvas DOM (good for fidelity).
- Update offscreen renderer to read the same `ChartStyle`, ensuring exports match the canvas exactly for every new chart type.
- For waterfall, keep using the DOM/PNG capture path (PPTX has no native waterfall).
- Where possible, also emit native PPTX charts (`pptxgen` `addChart`) using the style — gives editable charts in PowerPoint. This is a stretch goal; if a setting can't be expressed natively, fall back to PNG.

---

## UX details (apply across phases)

- Collapsible sections via existing `Collapsible` component.
- Real-time updates: every control writes to the block via the existing `update(id, patch)` flow.
- Color picker: HEX text input + opacity slider + 8 brand swatches from `--primary`, `--accent`, etc.
- Number inputs: `<input type="number">` + ± buttons + unit suffix.
- Tab structure stays **Design | Filtros**; chart inspector lives inside Design.

---

## Scope check before I start

This is large (~2-3k new LOC across renderers and controls). I propose to:

1. Ship **Phase 1 + 2** in this turn (foundation + all new renderers wired with sensible defaults).
2. Ship **Phase 3** (rich per-type controls) in the next turn so you can review the inspector UX before we expand it for every type.
3. Ship **Phase 4** (export parity) once the canvas is approved.

If you'd rather I do everything in one go, say so and I'll proceed straight through.