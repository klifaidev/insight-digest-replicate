// Thumbnails SVG estáticos por tipo de slide (Harald theme).
// Usados no catálogo lateral e nas pré-visualizações de templates.
import type { SlideKind } from "@/lib/slidesFlow";

const RED = "#C8102E";
const BLUE = "#2563EB";
const GRAY = "#94A3B8";
const GRAY_LIGHT = "#E2E8F0";
const BG = "#FFFFFF";

interface Props {
  kind: SlideKind;
  width?: number;
  height?: number;
  className?: string;
}

export function SlideThumbnailSVG({ kind, width = 120, height = 68, className }: Props) {
  const vb = "0 0 160 90";
  const common = {
    viewBox: vb,
    width,
    height,
    className,
    preserveAspectRatio: "xMidYMid meet" as const,
    role: "img" as const,
    "aria-hidden": true,
  };

  if (kind === "bridge_pvm") {
    // Waterfall: barras alternadas positivas (azul) e negativas (vermelho)
    const bars = [
      { x: 14, y: 30, w: 14, h: 44, c: GRAY },        // total inicial
      { x: 32, y: 22, w: 14, h: 12, c: BLUE },        // pos
      { x: 50, y: 40, w: 14, h: 14, c: RED },         // neg
      { x: 68, y: 30, w: 14, h: 10, c: BLUE },        // pos
      { x: 86, y: 42, w: 14, h: 16, c: RED },         // neg
      { x: 104, y: 38, w: 14, h: 8, c: BLUE },        // pos
      { x: 122, y: 24, w: 14, h: 50, c: GRAY },       // total final
    ];
    return (
      <svg {...common}>
        <rect width="160" height="90" fill={BG} />
        <line x1="8" y1="74" x2="152" y2="74" stroke={GRAY_LIGHT} strokeWidth="1" />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.c} rx="1" />
        ))}
      </svg>
    );
  }

  if (kind === "budget_evo") {
    // Duas linhas sobrepostas (real vs orçado) + legenda
    const realPts = "12,52 32,46 52,40 72,44 92,34 112,28 132,30 148,22";
    const budPts  = "12,46 32,48 52,42 72,38 92,40 112,36 132,32 148,28";
    return (
      <svg {...common}>
        <rect width="160" height="90" fill={BG} />
        <line x1="8" y1="68" x2="152" y2="68" stroke={GRAY_LIGHT} strokeWidth="1" />
        <line x1="8" y1="54" x2="152" y2="54" stroke={GRAY_LIGHT} strokeWidth="0.5" />
        <line x1="8" y1="40" x2="152" y2="40" stroke={GRAY_LIGHT} strokeWidth="0.5" />
        <polyline points={budPts} fill="none" stroke={GRAY} strokeWidth="1.5" strokeDasharray="3 2" />
        <polyline points={realPts} fill="none" stroke={RED} strokeWidth="2" />
        {/* Legenda */}
        <rect x="10" y="78" width="8" height="3" fill={RED} rx="0.5" />
        <rect x="40" y="79" width="8" height="2" fill={GRAY} rx="0.5" />
        <rect x="22" y="78" width="14" height="3" fill={GRAY_LIGHT} rx="0.5" />
        <rect x="52" y="78" width="14" height="3" fill={GRAY_LIGHT} rx="0.5" />
      </svg>
    );
  }

  if (kind === "cover") {
    // Retângulo vermelho com 2 linhas de texto brancas
    return (
      <svg {...common}>
        <rect width="160" height="90" fill={RED} />
        <rect x="14" y="36" width="92" height="8" fill="#FFFFFF" rx="1" />
        <rect x="14" y="50" width="60" height="4" fill="#FFFFFF" fillOpacity="0.7" rx="1" />
        {/* Detalhe canto */}
        <rect x="14" y="14" width="20" height="3" fill="#FFFFFF" fillOpacity="0.6" rx="1" />
      </svg>
    );
  }

  // custom — grade 2×2 de blocos cinza com tamanhos variados
  return (
    <svg {...common}>
      <rect width="160" height="90" fill={BG} />
      <rect x="10" y="10" width="68" height="32" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="0.5" rx="2" />
      <rect x="82" y="10" width="68" height="32" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="0.5" rx="2" />
      <rect x="10" y="46" width="44" height="34" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="0.5" rx="2" />
      <rect x="58" y="46" width="92" height="34" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="0.5" rx="2" />
      {/* Micro-conteúdo nos blocos */}
      <rect x="16" y="16" width="20" height="3" fill={RED} rx="0.5" />
      <rect x="16" y="22" width="40" height="2" fill={GRAY} rx="0.5" />
      <rect x="88" y="16" width="20" height="3" fill={BLUE} rx="0.5" />
      <rect x="88" y="22" width="40" height="2" fill={GRAY} rx="0.5" />
    </svg>
  );
}

/** Deriva o tipo de slide "representativo" de uma lista de SlideItem. */
export function pickRepresentativeKind(kinds: SlideKind[]): SlideKind {
  // prioridade: bridge_pvm > budget_evo > custom > cover
  const order: SlideKind[] = ["bridge_pvm", "budget_evo", "custom", "cover"];
  for (const k of order) if (kinds.includes(k)) return k;
  return kinds[0] ?? "custom";
}
