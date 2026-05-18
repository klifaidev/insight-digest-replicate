# Redesign visual do CustomSlideEditor

O CustomSlideEditor (2624 linhas) ganha um polimento visual sério inspirado em Figma/Keynote, sem mexer na lógica de undo/redo, grouping, lock nem na renderização interna dos blocos.

## Escopo das mudanças

### 1. Escalonamento do canvas
- Nova prop opcional `factor?: number` e `canvasContainerRef?: RefObject<HTMLDivElement>`.
- Se `factor` não vier, calcular internamente com `ResizeObserver` no container pai: `factor = min(availW / CANVAS_W, availH / CANVAS_H)`.
- Wrapper externo com `width/height = CANVAS_* × factor`, `overflow:hidden`. Canvas interno renderizado com `transform: scale(factor)`, `transformOrigin: "top left"`.
- Zoom do toolbar multiplica esse factor (range 0.5–1.5), armazenado em `editorPrefs.zoom`.

### 2. Réguas + grid + coordenadas
- Régua horizontal (20px) e vertical (20px) com marcações a cada 50/100px, `bg-card/60`, `text-muted-foreground/50`.
- Grid via SVG `<pattern id="dots">` com pontos de 1px em `hsl(var(--muted-foreground)/0.15)`, controlado pelo toggle do toolbar.
- Coordenadas X/Y do cursor no canto inferior do canvas (`text-[10px] text-muted-foreground`).

### 3. Toolbar redesenhada (48px, `bg-card/80 backdrop-blur-xl border-b`)
Grupos: histórico (Undo/Redo) · alinhamento (visível só com seleção) · z-order · lock · grid + snap-select + zoom controls · play + save template + speaker notes.

### 4. Speaker notes colapsável
Barra inferior 72px ↔ 0 com transição, `bg-card/40 border-t`, `Textarea` sem borda + contador de caracteres. Persiste em `config.speakerNotes` via `setSpeakerNotesAction`.

### 5. Refinamentos visuais nos blocos
- Handles de resize: 6×6 brancos com borda `primary` nos 8 pontos.
- Handle de rotação: círculo 8px acima do topo com `RotateCcw`.
- Seleção múltipla: bounding box tracejado `border-primary/60`.
- Locked: ícone de cadeado superior direito, handles escondidos.
- Cursors: `grab` / `grabbing` / `crosshair` / `default` conforme contexto.

### 6. Guias de alinhamento
- Linhas 1px `hsl(var(--primary)/0.8)`, badge minúsculo com distância em px.
- Snap magnético com flash vermelho 100ms + `navigator.vibrate(10)`.

### 7. Context menu
- Ícones em todos os items, separadores entre grupos lógicos, submenu "Adicionar bloco", item "Definir como fundo" para imagens.

### 8. editorPrefs
- Adicionar `zoom: number` (default 1) com setter `setZoom`, persistido em localStorage junto com grid.

## Arquivos
- `src/components/pricing/custom/editorPrefs.ts` — adicionar campo `zoom`.
- `src/components/pricing/custom/CustomSlideEditor.tsx` — implementar todas as mudanças visuais.
- `src/pages/SlidesBeta.tsx` — passar `canvasContainerRef` para o editor (ajuste pequeno).

## Fora de escopo
- Lógica de undo/redo, grouping, lock, drag/resize matemático e renderização dos blocos (BlockRenderer) ficam intactas.
- Inspector contextual e palette flutuante de SlidesBeta seguem como estão.
