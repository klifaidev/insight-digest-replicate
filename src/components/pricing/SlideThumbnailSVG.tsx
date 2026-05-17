// Thumbnails SVG estáticos por tipo de slide (Harald theme).
// O SVG sempre preenche 100% do container externo (que define o tamanho real
// via aspect-ratio + overflow:hidden). viewBox 16:9 (1333x750) para casar com
// o canvas de slides do app.
import { cn } from "@/lib/utils";
import type { SlideKind } from "@/lib/slidesFlow";

const RED = "#C8102E";
const BLUE = "#2563EB";
const GRAY = "#94A3B8";
const GRAY_LIGHT = "#E2E8F0";
const BG = "#FFFFFF";

const VB_W = 1333;
const VB_H = 750;

interface Props {
  kind: SlideKind;
  /** @deprecated container externo controla o tamanho. */
  width?: number;
  /** @deprecated container externo controla o tamanho. */
  height?: number;
  className?: string;
}

export function SlideThumbnailSVG({ kind, className }: Props) {
  const common = {
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: "xMidYMid meet" as const,
    role: "img" as const,
    "aria-hidden": true,
    className: cn("block h-full w-full", className),
  };

  if (kind === "bridge_pvm") {
    // Waterfall: barras alternadas positivas (azul) e negativas (vermelho)
    const baseY = 620;
    const bars = [
      { x: 110, y: 240, w: 110, h: 380, c: GRAY },
      { x: 260, y: 170, w: 110, h: 110, c: BLUE },
      { x: 410, y: 330, w: 110, h: 120, c: RED },
      { x: 560, y: 250, w: 110, h: 90, c: BLUE },
      { x: 710, y: 340, w: 110, h: 140, c: RED },
      { x: 860, y: 310, w: 110, h: 70, c: BLUE },
      { x: 1010, y: 190, w: 110, h: 430, c: GRAY },
    ];
    return (
      <svg {...common}>
        <rect width={VB_W} height={VB_H} fill={BG} />
        <line x1="60" y1={baseY} x2={VB_W - 60} y2={baseY} stroke={GRAY_LIGHT} strokeWidth="2" />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.c} rx="6" />
        ))}
      </svg>
    );
  }

  if (kind === "budget_evo") {
    const realPts = "100,440 260,380 420,330 580,360 740,270 900,210 1060,230 1230,150";
    const budPts  = "100,380 260,400 420,340 580,300 740,330 900,290 1060,250 1230,210";
    return (
      <svg {...common}>
        <rect width={VB_W} height={VB_H} fill={BG} />
        <line x1="60" y1="560" x2={VB_W - 60} y2="560" stroke={GRAY_LIGHT} strokeWidth="2" />
        <line x1="60" y1="430" x2={VB_W - 60} y2="430" stroke={GRAY_LIGHT} strokeWidth="1" />
        <line x1="60" y1="300" x2={VB_W - 60} y2="300" stroke={GRAY_LIGHT} strokeWidth="1" />
        <polyline points={budPts} fill="none" stroke={GRAY} strokeWidth="10" strokeDasharray="20 14" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={realPts} fill="none" stroke={RED} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        {/* Legenda */}
        <rect x="80" y="660" width="60" height="20" fill={RED} rx="3" />
        <rect x="150" y="664" width="160" height="12" fill={GRAY_LIGHT} rx="3" />
        <rect x="340" y="660" width="60" height="20" fill={GRAY} rx="3" />
        <rect x="410" y="664" width="160" height="12" fill={GRAY_LIGHT} rx="3" />
      </svg>
    );
  }

  if (kind === "cover") {
    return (
      <svg {...common}>
        <rect width={VB_W} height={VB_H} fill={RED} />
        <rect x="120" y="120" width="160" height="22" fill="#FFFFFF" fillOpacity="0.7" rx="4" />
        <rect x="120" y="300" width="780" height="70" fill="#FFFFFF" rx="6" />
        <rect x="120" y="410" width="520" height="36" fill="#FFFFFF" fillOpacity="0.75" rx="4" />
        <rect x="120" y="620" width="120" height="10" fill="#FFFFFF" fillOpacity="0.5" rx="2" />
      </svg>
    );
  }

  // custom — grade de blocos cinza com tamanhos variados
  return (
    <svg {...common}>
      <rect width={VB_W} height={VB_H} fill={BG} />
      <rect x="80" y="80" width="560" height="260" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="3" rx="14" />
      <rect x="680" y="80" width="570" height="260" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="3" rx="14" />
      <rect x="80" y="380" width="370" height="290" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="3" rx="14" />
      <rect x="490" y="380" width="760" height="290" fill={GRAY_LIGHT} stroke={GRAY} strokeWidth="3" rx="14" />
      {/* micro-conteúdo */}
      <rect x="120" y="120" width="200" height="22" fill={RED} rx="3" />
      <rect x="120" y="170" width="380" height="14" fill={GRAY} rx="3" />
      <rect x="120" y="200" width="320" height="14" fill={GRAY} rx="3" />
      <rect x="720" y="120" width="200" height="22" fill={BLUE} rx="3" />
      <rect x="720" y="170" width="380" height="14" fill={GRAY} rx="3" />
      <rect x="720" y="200" width="340" height="14" fill={GRAY} rx="3" />
      <rect x="120" y="420" width="180" height="18" fill={GRAY} rx="3" />
      <rect x="530" y="420" width="220" height="18" fill={RED} rx="3" />
    </svg>
  );
}

/** Deriva o tipo de slide "representativo" de uma lista de SlideItem. */
export function pickRepresentativeKind(kinds: SlideKind[]): SlideKind {
  const order: SlideKind[] = ["bridge_pvm", "budget_evo", "custom", "cover"];
  for (const k of order) if (kinds.includes(k)) return k;
  return kinds[0] ?? "custom";
}
