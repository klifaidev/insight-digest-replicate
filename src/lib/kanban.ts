// Kanban — tipos e persistência local
export type Priority = "low" | "med" | "high";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // ISO yyyy-mm-dd
  assignee?: string;
  priority?: Priority;
  tags?: string[];
  checklist?: ChecklistItem[];
  createdAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  accent: string; // hsl color e.g. "220 12% 70%"
  cardIds: string[];
}

export interface KanbanState {
  columns: KanbanColumn[];
  cards: Record<string, KanbanCard>;
}

const STORAGE_KEY = "harald.kanban.v1";

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  med: "Média",
  high: "Alta",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  low: "bg-muted/40 text-muted-foreground border-border/40",
  med: "bg-warning/15 text-warning border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
};

export const COLUMN_ACCENTS = [
  { label: "Cinza", value: "220 12% 65%" },
  { label: "Âmbar", value: "38 92% 60%" },
  { label: "Azul", value: "217 91% 60%" },
  { label: "Verde", value: "158 64% 52%" },
  { label: "Roxo", value: "263 70% 65%" },
  { label: "Vermelho", value: "0 84% 65%" },
  { label: "Ciano", value: "195 70% 60%" },
];

export function defaultState(): KanbanState {
  return {
    columns: [
      { id: col(), title: "A fazer", accent: "220 12% 65%", cardIds: [] },
      { id: col(), title: "Top 3", accent: "38 92% 60%", cardIds: [] },
      { id: col(), title: "Em andamento", accent: "217 91% 60%", cardIds: [] },
      { id: col(), title: "Concluído", accent: "158 64% 52%", cardIds: [] },
    ],
    cards: {},
  };
}

function col() {
  return "c_" + Math.random().toString(36).slice(2, 9);
}
export function newId(prefix = "k") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadState(): KanbanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTop3(defaultState());
    const parsed = JSON.parse(raw) as KanbanState;
    if (!parsed.columns || !parsed.cards) return seedTop3(defaultState());
    return seedTop3(parsed);
  } catch {
    return seedTop3(defaultState());
  }
}

const SEED_FLAG = "harald.kanban.seed.top3.v1";

/** One-time seed: popula "Top 3" com as atividades iniciais se ainda não foi feito. */
function seedTop3(state: KanbanState): KanbanState {
  try {
    if (localStorage.getItem(SEED_FLAG) === "done") return state;
  } catch {
    return state;
  }

  const top3 = state.columns.find(
    (c) => c.title.trim().toLowerCase() === "top 3",
  );
  if (!top3 || top3.cardIds.length > 0) {
    try {
      localStorage.setItem(SEED_FLAG, "done");
    } catch {
      /* noop */
    }
    return state;
  }

  const items: Array<Pick<KanbanCard, "title" | "description">> = [
    {
      title: "Puxar fórum para falar da planilha de SKUs Referência",
    },
    {
      title: "Estruturar plano para continuar com Melken Zero e Vegano",
      description:
        "Avaliar se vale a pena continuar com o Melken Zero e o Vegano: construir uma apresentação, entender DRE, números, quanto tem de lote mínimo (com suprimentos - Reginaldo), ele vai falar de embalagem e Fernando Cândido para terceiros.",
    },
    {
      title: "Direcionar Aline sobre as ordens a serem criadas",
      description: "Alinhar com a Mari.",
    },
    {
      title: "Criar proposta de Gestão de Categoria 2.0",
      description:
        "Estabelecer a divisão de categorias com a nova divisão da base de hierarquias, propor um período para entendimento das 360 categorias e propor um momento para estabelecimento de planos de ação para as principais dores das categorias.",
    },
    {
      title: "Ajustar Dash com nova visão estrutura de dados",
      description: "Projeto Hierarquias.",
    },
  ];

  const now = new Date().toISOString();
  const newCards: Record<string, KanbanCard> = { ...state.cards };
  const newIds: string[] = [];
  items.forEach((it) => {
    const id = newId("card");
    newCards[id] = {
      id,
      title: it.title,
      description: it.description,
      createdAt: now,
    };
    newIds.push(id);
  });

  const columns = state.columns.map((c) =>
    c.id === top3.id ? { ...c, cardIds: [...c.cardIds, ...newIds] } : c,
  );

  try {
    localStorage.setItem(SEED_FLAG, "done");
  } catch {
    /* noop */
  }

  return { cards: newCards, columns };
}


export function saveState(state: KanbanState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

export function initials(name?: string) {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "·";
}

export function avatarHue(name?: string) {
  if (!name) return 220;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function dueStatus(due?: string): "overdue" | "today" | "soon" | "later" | "none" {
  if (!due) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "later";
}

export function formatDueShort(due: string) {
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}
