## Diagnóstico — por que a Bridge fica em branco

O botão **"Bridge"** na paleta de gráficos do slide personalizado insere um `ChartBlock` com `chartType: "waterfall"`. O renderer (`WaterfallChart` em `ChartCanvas.tsx`) tem dois caminhos:

1. **Smart columns** — só ativa se `style.waterfall.columns` estiver preenchido (não vem por default).
2. **Fallback genérico** — pega `series[0].values` (uma série única `Total` por período) e gera barras `P1, P2, …` cumulativas.

Problemas que produzem o "branco":

- O default cai sempre no fallback. Se o usuário tem **um único período** filtrado (ou os filtros do bloco zeram todos os meses), `series[0].values` tem 1 valor → 1 barra minúscula sem rótulo coerente, parecendo vazio.
- O fallback rotula como `P1, P2…` e classifica tudo como `positive/negative` em cumulativo, o que **não é uma bridge real** — não separa Volume × Preço × Custo etc.
- Não há base/comparação como no `BridgeBlock` legado, então o usuário não tem o que configurar e a Bridge fica visualmente quebrada antes de qualquer ação.
- Detalhe extra: dentro de `WaterfallChart`, o `dsRows` é refeito a partir de `usePricing` direto e **ignora os cross-filters de entrada** já aplicados pelo `ChartCanvas` pai.

A Bridge da aba `/bridge-pvm` (`calcPVM` em `src/lib/analytics.ts`) é a referência: decompõe ΔContribuição Marginal entre dois períodos em **Base → Volume → Preço → Custo → Frete → Comissão → Outros → Atual**.

---

## Plano

### 1. Tornar a Bridge "PVM-aware" por padrão

`src/components/pricing/custom/chart/types.ts`
- Adicionar campos opcionais ao `WaterfallStyleCfg`:
  - `mode?: "pvm" | "manual"` (default `"pvm"`)
  - `pvm?: { base: string | null; comp: string | null; periodMode: "fy" | "month"; metric?: Metric }` (default `{ base:null, comp:null, periodMode:"month" }`)
  - Manter `columns?` para o modo manual já existente.
- Atualizar `defaultChartStyle()` e `ensureChartStyle()` para preservar esses campos.

`src/lib/customSlide.ts`
- Em `newChartBlock("waterfall", …)`: aplicar `style.waterfall.mode = "pvm"` no objeto criado, título "Bridge PVM", `breakdown: null`, `participatesInCrossFilter: true`.

### 2. Renderizar a PVM dentro do `WaterfallChart`

`src/components/pricing/custom/chart/ChartCanvas.tsx`
- Em `WaterfallChart`, antes do fallback genérico, checar `style.waterfall.mode === "pvm"`:
  - Reutilizar `dsRows` já cross-filtrado vindo do pai (passar como prop em vez de re-`usePricing`). Aplicar `applyFilters` com `block.filters`.
  - Se `pvm.base` e `pvm.comp` estiverem definidos e diferentes:
    - Chamar `calcPVM(filtered, metric, base, comp, periodMode, labels)` com `metric = pvm.metric ?? usePricing.metric`.
    - Montar `items` na ordem: `Base CM`, `Volume`, `Preço`, `Custo`, `Frete`, `Comissão`, `Outros`, `Atual CM`. Tipos: `start | positive/negative (auto pelo sinal de cada efeito) | total`.
    - Labels usam `result.baseLabel` / `result.currentLabel` (que já vêm com `monthLabel`).
  - Se faltar base/comp, retornar **empty state estilizado** ("Configure base e comparação da Bridge") em vez de barras vazias.
- No `ChartCanvas` pai, **não bloquear** a Bridge no `seriesEmpty` quando `mode === "pvm"`; o pivot por período não é necessário.
- Bypassar o `usePricing(s.rows)` dentro de `WaterfallChart` e passar `dsRows` (já com cross-filter) por prop — corrige a inconsistência atual.

### 3. Inspector — pickers de Base/Comparação

`src/components/pricing/custom/chart/ChartInspector.tsx`
- Na seção "Waterfall", quando `mode === "pvm"`:
  - Toggle `Modo: PVM | Manual` (default PVM).
  - Selects de **Modo período** (FY/Mês), **Base**, **Comparação** — reutilizando `useMonthsInfo` / `useFyList` já usados em `BridgeBlockEditor`.
  - Esconder a tabela de "Smart columns" (só aparece em modo Manual).
- Manter as cores positiva/negativa/total e demais opções existentes válidas para ambos os modos.

### 4. Exportação e cross-filter

- `exportCustomSlide.tsx` continua capturando o bloco como PNG via `BlockRenderer` — sem alteração.
- A Bridge PVM **não emite** cross-filter (os "passos" não são uma dimensão real); setar `emitsCrossFilter: false` no `newChartBlock("waterfall")` e ignorar cliques no renderer.
- Ela **continua participando** como receiver: filtros que chegam (categoria, marca, etc.) entram via `dsRows` antes do `calcPVM`.

### 5. QA

- Inserir Bridge num slide novo → mostra empty state pedindo Base/Comparação.
- Definir Base e Comparação → render igual à aba Bridge (mesmas barras, mesmos sinais, mesmos rótulos `monthLabel`).
- Aplicar filtro de Marca em outro bloco → Bridge se recalcula com o subset.
- Exportar slide para PPTX → PNG da Bridge fica idêntico ao preview.
- Modo "Manual" continua funcionando para quem quer columns customizadas.

### Arquivos afetados

- `src/components/pricing/custom/chart/types.ts` — tipo + defaults
- `src/lib/customSlide.ts` — `newChartBlock("waterfall")`
- `src/components/pricing/custom/chart/ChartCanvas.tsx` — `WaterfallChart` PVM + bypass do empty-check
- `src/components/pricing/custom/chart/ChartInspector.tsx` — pickers Base/Comp + toggle de modo
- (Sem mudanças em `BridgeBlock` legado — segue convivendo.)
