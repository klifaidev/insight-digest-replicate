# Redesign da página Slides — layout Figma/Keynote

## Objetivo

Substituir completamente o layout atual da página `/slides` (esteira horizontal + catálogo lateral + inspector embutido) por uma estrutura **canvas-céntrica** inspirada em Figma/Keynote: topbar + strip vertical de slides + canvas em destaque + block palette flutuante + inspector contextual à direita.

## Estrutura final

```text
┌──────────────────────────────────────────────────────────────┐
│  TOPBAR  ← Voltar | Slides · 7 | [deck name] | Transition  │
│                                  Templates · Colab · Export │
├──────┬───────────────────────────────────────┬──────────────┤
│STRIP │   ┌─ Block palette (flutuante)        │  INSPECTOR   │
│120px │   │                                   │  300px       │
│      │   │      ┌─────────────────────┐      │  (colapsa    │
│ #1   │   │      │                     │      │   quando    │
│ #2 ◀ │   │      │   SLIDE 16:9        │      │   nada      │
│ #3   │   │      │   (CustomEditor)    │      │   selecio-  │
│ +    │   │      │                     │      │   nado)     │
│      │   │      └─────────────────────┘      │              │
│      │   └─                  ← 2/7 →         │              │
└──────┴───────────────────────────────────────┴──────────────┘
```

## Escopo — o que será feito

### 1. Reescrever `src/pages/SlidesBeta.tsx` (substituição completa)
- Remover `FlowDropZone`, `DraggableCatalogItem`, `EmptyFlow` antigo e painel de Pré-definições embutido na sidebar.
- Manter imports/usos de: `useSlidesFlow`, `useCollaboration`, `usePricing`, `useBudget`, `exportSlideFlow`, `exportToPdf`, `TemplateGallery`, `slideComments`, `slideChangeLog`.
- Novo shell em 3 colunas (`flex h-screen`): `Strip` (120px) + `CanvasArea` (flex-1, relative) + `Inspector` (300px colapsável via `transition-[width]`).
- Todos os slides são criados como `kind: "custom"` (já é a única opção válida após o refactor anterior).

### 2. Topbar customizada (substitui `<Topbar />`)
- Esquerda: `<ArrowLeft />` Voltar + título "Slides" + badge contador.
- Centro: nome do deck inline editável (Input transparente, persistido em `localStorage["slides-deck-name"]`).
- Direita: `Select` de transição, botões Templates (Sparkles), Colaborar (Users2 com badge ao vivo), Pré-definições (Bookmark, dialog), e split-button Exportar (PPTX + dropdown PDF).

### 3. Strip lateral (120px)
- Header: "N slides" + botão "+".
- Lista vertical de `ScaledPreview` (targetWidth ~104) com `@dnd-kit/sortable` (já em uso).
- Slide ativo: borda primary 2px + glow azul; outros: hover eleva +2px.
- Badge numérico no canto superior esquerdo (texto 9-10px).
- Indicadores de colaboradores e comentários (reaproveitar `getUnresolvedCount`).
- Footer: botão "+".

### 4. Block palette flutuante
- Posição `absolute left-[136px] top-1/2 -translate-y-1/2` dentro da CanvasArea.
- Container: `w-12 bg-card/90 backdrop-blur border rounded-2xl p-2 flex flex-col gap-1 shadow-lg`.
- Grupo 1 (Análise): `bridge_pvm_block`, `budget_evo_block`, `cover_block` — ícones GitBranch, Target, BookOpen.
- Separador de 1px.
- Grupo 2 (Conteúdo): title, text, kpi, chart, table, topSku, image, shape — ícones Type, AlignLeft, Hash, BarChart3, Table, Trophy, Image, Square.
- Cada item: 32×32 com tooltip à direita (`TooltipContent side="right"`).
- Clique adiciona o bloco no slide atual via mutação direta do `config.blocks` (usando `newBlock(kind, zTop)`); blocos de análise vão com `x:0,y:0,w:1333,h:665` (já é o default em `newBlock`).
- Só visível quando há slide selecionado.

### 5. Canvas area
- Fundo `bg-muted/30`, padding 40px.
- Wrapper centralizado mantendo 16:9 (1333:750), com `box-shadow: 0 32px 64px -16px rgba(0,0,0,0.5)`.
- Renderiza `<CustomSlideEditor>` com o slide selecionado.
- Setas circulares `left-[152px]` e `right-[308px]` visíveis em hover.
- Badge "N / total" centro-inferior.
- Keyboard ←/→ via `useEffect` em `window`, desativado quando há foco em input/textarea ou bloco selecionado dentro do editor.

### 6. Inspector direito (300px)
- **Não vou extrair o inspector interno do CustomSlideEditor** (são ~600 linhas de `BlockSpecificEditor`/`KpiInspector`/`ChartBlockEditor`/etc. profundamente acopladas ao Zustand interno do editor). Em vez disso:
  - O CustomSlideEditor mantém seu inspector próprio embutido (já funcional).
  - O painel direito da nova shell mostra: header com nome do deck, **Anotações do apresentador** (sempre visível, ligado a `config.speakerNotes`) e atalhos rápidos (duplicar/deletar slide).
  - Sempre visível em 300px (sem colapso) — simplifica e evita o trabalho de extração.
- Se você quiser a extração real do inspector contextual em uma segunda iteração, fazemos depois com um plano dedicado.

### 7. Welcome screen (items.length === 0)
- Substitui o EmptyFlow. Ocupa toda a canvas area.
- Radial gradient sutil centralizado.
- Ícone `Presentation` grande com `animate-ping` no ring externo.
- Título "Seu próximo deck começa aqui" + subtítulo.
- 2 CTAs: "Escolher template" (abre TemplateGallery) e "Slide em branco" (cria custom vazio).
- 4 cards de atalho (Bridge, Budget, KPI, Capa) com SVG esquemático que criam slide pré-configurado.

### 8. Mantido sem alteração
- Store `useSlidesFlow` (add/remove/reorder/duplicate/transition/collab).
- DnD via `@dnd-kit/sortable` na strip.
- `CustomSlideEditor` (canvas) — toda a edição de blocos continua acontecendo lá.
- Lógica de exportação PPTX/PDF.
- Hooks de colaboração e logs.

## Trade-off explícito

O item 6 (inspector contextual à direita exibindo propriedades do bloco selecionado) **não será extraído nesta passagem**. O CustomSlideEditor continua mostrando seu inspector interno enquanto o painel direito da nova shell foca em metadados do deck + speaker notes + ações de slide. Essa decisão evita ~600 linhas de refactor profundo no editor e mantém esta entrega coesa. Posso fazer a extração depois com um plano focado só nisso.

## Arquivos tocados

- `src/pages/SlidesBeta.tsx` — reescrita completa (~600–800 linhas).
- Nenhum outro arquivo modificado.
