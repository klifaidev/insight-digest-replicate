// Inspector — painel contextual de propriedades do bloco selecionado (Slides 2.0).
import { useMemo } from "react";
import { X, Copy, Trash2, Lock, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import {
  useEditorConfig, useSelection, clearSelection,
  patchBlockAction, duplicateBlockAction, deleteBlockAction, toggleLockAction,
} from "@/components/pricing/custom/editorStore";
import { BLOCK_LABELS } from "@/lib/customSlide";
import type {
  CustomBlock, TitleBlock, TextBlock, KpiBlock, ShapeBlock, ImageBlock,
  ChartBlock, BlockEnterAnimation,
} from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";

import { setSpeakerNotesAction } from "@/components/pricing/custom/editorStore";

export interface InspectorProps {
  currentItem: SlideItem | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// ColorInput — input nativo + preview pill
// ---------------------------------------------------------------------------
function ColorInput({
  value, onChange, label,
}: { value: string; onChange: (hex: string) => void; label?: string }) {
  const hex = value?.startsWith("#") ? value : `#${value || "000000"}`;
  return (
    <div className="flex items-center gap-2">
      {label && <Label className="flex-1 text-[11px] text-muted-foreground">{label}</Label>}
      <div className="flex items-center gap-1.5 rounded border border-border/40 px-1.5 py-0.5">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value.replace(/^#/, "").toUpperCase())}
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          {value?.replace(/^#/, "") || "000000"}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 py-2">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </Label>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-kind property forms
// ---------------------------------------------------------------------------
function patch(id: string, p: Partial<CustomBlock>) {
  patchBlockAction(id, p, "Alterar estilo");
}

function TitleTextProps({ block }: { block: TitleBlock | TextBlock }) {
  const isTitle = block.kind === "title";
  return (
    <Section title="Texto">
      <div className="flex items-center gap-2">
        <Label className="flex-1 text-[11px] text-muted-foreground">Tamanho</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{block.size}</span>
      </div>
      <Slider
        min={8} max={96} step={1}
        value={[block.size]}
        onValueChange={(v) => patch(block.id, { size: v[0] } as Partial<CustomBlock>)}
      />
      {isTitle && (
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Negrito</Label>
          <Switch
            checked={(block as TitleBlock).bold}
            onCheckedChange={(c) => patch(block.id, { bold: c } as Partial<CustomBlock>)}
          />
        </div>
      )}
      <ColorInput
        label="Cor"
        value={block.color}
        onChange={(hex) => patch(block.id, { color: hex } as Partial<CustomBlock>)}
      />
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Alinhamento</Label>
        <ToggleGroup
          type="single"
          size="sm"
          value={block.align}
          onValueChange={(v) => v && patch(block.id, { align: v as "left" | "center" | "right" } as Partial<CustomBlock>)}
        >
          <ToggleGroupItem value="left" className="h-6 w-6 p-0">L</ToggleGroupItem>
          <ToggleGroupItem value="center" className="h-6 w-6 p-0">C</ToggleGroupItem>
          <ToggleGroupItem value="right" className="h-6 w-6 p-0">R</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </Section>
  );
}

function KpiProps({ block }: { block: KpiBlock }) {
  return (
    <Section title="KPI">
      <div>
        <Label className="text-[11px] text-muted-foreground">Label</Label>
        <Input
          value={block.label} className="h-7 text-xs"
          onChange={(e) => patch(block.id, { label: e.target.value } as Partial<CustomBlock>)}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">Origem</Label>
        <Select
          value={block.source}
          onValueChange={(v) => patch(block.id, { source: v as "manual" | "dynamic" } as Partial<CustomBlock>)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="dynamic">Dinâmico</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {block.source === "dynamic" && (
        <>
          <div>
            <Label className="text-[11px] text-muted-foreground">Medida</Label>
            <Select
              value={block.measure ?? "rol"}
              onValueChange={(v) => patch(block.id, { measure: v } as Partial<CustomBlock>)}
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rol">ROL</SelectItem>
                <SelectItem value="volume">Volume</SelectItem>
                <SelectItem value="cm">CM</SelectItem>
                <SelectItem value="mb">MB</SelectItem>
                <SelectItem value="cmPct">CM %</SelectItem>
                <SelectItem value="mbPct">MB %</SelectItem>
                <SelectItem value="precoMedio">Preço médio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Período</Label>
            <Select
              value={block.periodMode ?? "all"}
              onValueChange={(v) => patch(block.id, { periodMode: v as "fy" | "month" | "all" } as Partial<CustomBlock>)}
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o período</SelectItem>
                <SelectItem value="fy">Ano fiscal</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {block.source === "manual" && (
        <div>
          <Label className="text-[11px] text-muted-foreground">Valor</Label>
          <Input
            value={block.manualValue ?? ""} className="h-7 text-xs"
            onChange={(e) => patch(block.id, { manualValue: e.target.value } as Partial<CustomBlock>)}
          />
        </div>
      )}
      <ColorInput
        label="Cor do valor"
        value={block.color}
        onChange={(hex) => patch(block.id, { color: hex } as Partial<CustomBlock>)}
      />
      <div className="flex items-center gap-2">
        <Label className="flex-1 text-[11px] text-muted-foreground">Tamanho</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{block.valueSize}</span>
      </div>
      <Slider
        min={16} max={120} step={2}
        value={[block.valueSize]}
        onValueChange={(v) => patch(block.id, { valueSize: v[0] } as Partial<CustomBlock>)}
      />
    </Section>
  );
}

function ShapeProps({ block }: { block: ShapeBlock }) {
  return (
    <Section title="Forma">
      <ColorInput
        label="Preenchimento"
        value={block.fill}
        onChange={(hex) => patch(block.id, { fill: hex } as Partial<CustomBlock>)}
      />
      <ColorInput
        label="Contorno"
        value={block.strokeColor ?? "CBD5E1"}
        onChange={(hex) => patch(block.id, { strokeColor: hex } as Partial<CustomBlock>)}
      />
      <div className="flex items-center gap-2">
        <Label className="flex-1 text-[11px] text-muted-foreground">Espessura</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{block.strokeWidth ?? 0}</span>
      </div>
      <Slider
        min={0} max={12} step={1}
        value={[block.strokeWidth ?? 0]}
        onValueChange={(v) => patch(block.id, { strokeWidth: v[0] } as Partial<CustomBlock>)}
      />
    </Section>
  );
}

function ImageProps({ block }: { block: ImageBlock }) {
  // opacity é optional / inexistente no tipo — mantemos via cast.
  const opacity = (block as ImageBlock & { opacity?: number }).opacity ?? 100;
  return (
    <Section title="Imagem">
      <div>
        <Label className="text-[11px] text-muted-foreground">Ajuste</Label>
        <Select
          value={block.fit}
          onValueChange={(v) => patch(block.id, { fit: v as "contain" | "cover" } as Partial<CustomBlock>)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="contain">Conter</SelectItem>
            <SelectItem value="cover">Preencher</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="flex-1 text-[11px] text-muted-foreground">Opacidade</Label>
        <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">{opacity}%</span>
      </div>
      <Slider
        min={0} max={100} step={5}
        value={[opacity]}
        onValueChange={(v) => patch(block.id, { opacity: v[0] } as unknown as Partial<CustomBlock>)}
      />
    </Section>
  );
}

function ChartProps({ block }: { block: ChartBlock }) {
  return (
    <Section title="Gráfico">
      <div>
        <Label className="text-[11px] text-muted-foreground">Tipo</Label>
        <Select
          value={block.chartType}
          onValueChange={(v) => patch(block.id, { chartType: v } as Partial<CustomBlock>)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="column">Colunas</SelectItem>
            <SelectItem value="bar">Barras</SelectItem>
            <SelectItem value="line">Linha</SelectItem>
            <SelectItem value="area">Área</SelectItem>
            <SelectItem value="stackedColumn">Colunas empilhadas</SelectItem>
            <SelectItem value="pie">Pizza</SelectItem>
            <SelectItem value="donut">Donut</SelectItem>
            <SelectItem value="waterfall">Waterfall</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Demais propriedades disponíveis no editor inline do bloco.
      </p>
    </Section>
  );
}

function GeometryProps({ block }: { block: CustomBlock }) {
  return (
    <Section title="Posição">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <Label className="text-[10px] text-muted-foreground">X</Label>
          <Input type="number" value={Math.round(block.x)} className="h-7 text-xs"
            onChange={(e) => patch(block.id, { x: Number(e.target.value) } as Partial<CustomBlock>)} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Y</Label>
          <Input type="number" value={Math.round(block.y)} className="h-7 text-xs"
            onChange={(e) => patch(block.id, { y: Number(e.target.value) } as Partial<CustomBlock>)} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">W</Label>
          <Input type="number" value={Math.round(block.w)} className="h-7 text-xs"
            onChange={(e) => patch(block.id, { w: Number(e.target.value) } as Partial<CustomBlock>)} />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">H</Label>
          <Input type="number" value={Math.round(block.h)} className="h-7 text-xs"
            onChange={(e) => patch(block.id, { h: Number(e.target.value) } as Partial<CustomBlock>)} />
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
export function Inspector({ currentItem, onClose }: InspectorProps) {
  const config = useEditorConfig();
  const { selectedIds } = useSelection();
  const selectedBlock = useMemo(
    () => (config?.blocks.find((b) => selectedIds[0] === b.id) ?? null),
    [config, selectedIds],
  );

  const isOpen = selectedBlock !== null;
  const isCustom = currentItem?.kind === "custom";

  const handleClose = () => {
    clearSelection();
    onClose();
  };

  return (
    <div
      className={cn(
        "h-full overflow-hidden border-l border-border/30 bg-card/30 backdrop-blur-sm",
        "transition-[width,opacity] duration-200 ease-out",
      )}
      style={{
        width: isOpen ? 300 : 0,
        opacity: isOpen ? 1 : 0,
      }}
    >
      {isOpen && selectedBlock && (
        <div className="flex h-full w-[300px] flex-col">
          {/* Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/20 px-3">
            <span className="text-xs font-medium">
              {BLOCK_LABELS[selectedBlock.kind] ?? selectedBlock.kind}
            </span>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={handleClose} aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto px-3">
            {(selectedBlock.kind === "title" || selectedBlock.kind === "text") && (
              <TitleTextProps block={selectedBlock as TitleBlock | TextBlock} />
            )}
            {selectedBlock.kind === "kpi" && <KpiProps block={selectedBlock as KpiBlock} />}
            {selectedBlock.kind === "shape" && <ShapeProps block={selectedBlock as ShapeBlock} />}
            {selectedBlock.kind === "image" && <ImageProps block={selectedBlock as ImageBlock} />}
            {selectedBlock.kind === "chart" && <ChartProps block={selectedBlock as ChartBlock} />}

            <GeometryProps block={selectedBlock} />

            {/* Animação */}
            <Section title="Animação de entrada">
              <Select
                value={selectedBlock.enterAnimation ?? "none"}
                onValueChange={(v) =>
                  patch(selectedBlock.id, { enterAnimation: v as BlockEnterAnimation } as Partial<CustomBlock>)
                }
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  <SelectItem value="fade">Fade</SelectItem>
                  <SelectItem value="slide-up">Subir</SelectItem>
                  <SelectItem value="pop">Aparecer</SelectItem>
                </SelectContent>
              </Select>
            </Section>
          </div>

          {/* Ações */}
          <div className="shrink-0 border-t border-border/20 p-2">
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="ghost" size="sm" className="h-7 px-1.5 text-[11px]"
                onClick={() => duplicateBlockAction(selectedBlock.id)}
              >
                <Copy className="h-3 w-3 mr-1" /> Duplicar
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 px-1.5 text-[11px]"
                onClick={() => toggleLockAction(selectedBlock.id)}
              >
                {selectedBlock.locked ? <Unlock className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                {selectedBlock.locked ? "Destravar" : "Travar"}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 px-1.5 text-[11px] text-destructive hover:text-destructive"
                onClick={() => { deleteBlockAction(selectedBlock.id); clearSelection(); }}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Excluir
              </Button>
            </div>
          </div>

          {/* Speaker notes */}
          {isCustom && (
            <div className="shrink-0 border-t border-border/20 p-3">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Notas do apresentador
              </Label>
              <Textarea
                rows={3}
                value={config?.speakerNotes ?? ""}
                onChange={(e) => setSpeakerNotesAction(e.target.value)}
                placeholder="Adicione anotações..."
                className="mt-1 resize-none border-none bg-transparent text-xs focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Inspector;
