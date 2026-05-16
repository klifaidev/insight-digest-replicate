import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right";
  format?: (v: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  searchable?: boolean;
  searchKeys?: (keyof T & string)[];
  maxRows?: number;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  searchable,
  searchKeys,
  maxRows = 300,
  emptyMessage = "Sem dados para exibir.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let out = rows;
    if (query && searchKeys?.length) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const isLeftAligned = col?.align !== "right";
      out = [...out].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        // Coluna textual (esquerda) com valores string → alfabético pt-BR
        if (isLeftAligned && (typeof av === "string" || typeof bv === "string")) {
          const sa = String(av ?? "");
          const sb = String(bv ?? "");
          return sortDir === "asc"
            ? sa.localeCompare(sb, "pt-BR")
            : sb.localeCompare(sa, "pt-BR");
        }
        const numA = typeof av === "number" ? av : parseFloat(String(av)) || 0;
        const numB = typeof bv === "number" ? bv : parseFloat(String(bv)) || 0;
        return sortDir === "asc" ? numA - numB : numB - numA;
      });
    }
    return out;
  }, [rows, query, sortKey, sortDir, searchKeys, columns]);

  const visible = filtered.slice(0, maxRows);

  // Reset da ordenação quando a fonte de dados muda (nova página / novo rows)
  useEffect(() => {
    setSortKey(null);
    setSortDir("desc");
  }, [rows]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-9 border-border/50 bg-secondary/40 pl-9 text-xs"
          />
        </div>
      )}

      <div className="rounded-xl border border-border/40 bg-card/30">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "h-10 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    c.align === "right" && "text-right",
                    (c.sortable ?? true) && "cursor-pointer select-none hover:text-foreground",
                  )}
                  onClick={() => (c.sortable ?? true) && toggleSort(c.key)}
                >
                  <span className={cn("inline-flex items-center gap-1", c.align === "right" && "justify-end w-full")}>
                    {c.label}
                    {sortKey === c.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {visible.map((r, i) => (
              <TableRow key={i} className="border-border/30">
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "py-2.5 text-xs tabular-nums",
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {c.format ? c.format(v, r) : String(v ?? "")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filtered.length > maxRows && (
        <p className="text-center text-[11px] text-muted-foreground">
          Exibindo {maxRows.toLocaleString("pt-BR")} de {filtered.length.toLocaleString("pt-BR")} linhas. Use a busca para refinar.
        </p>
      )}
    </div>
  );
}
