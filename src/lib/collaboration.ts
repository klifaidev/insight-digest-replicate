// Realtime collaboration — Supabase Presence + Broadcast.
// O canal por sala faz duas coisas:
//  - Presence: lista de colaboradores conectados (+ posição do cursor)
//  - Broadcast "deck-op": eventos de mutação no deck (add/update/remove/...)
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  slideId: string | null;
  cursorX?: number;
  cursorY?: number;
}

export type CollabEventType =
  | "add_item"
  | "update_item"
  | "remove_item"
  | "reorder"
  | "update_transition";

export interface CollabEvent {
  type: CollabEventType;
  payload: unknown;
  userId: string;
  ts: number;
}

export const CURSOR_COLORS: string[] = [
  "#E63946",
  "#457B9D",
  "#2A9D8F",
  "#E9C46A",
  "#F4A261",
  "#A8DADC",
  "#8338EC",
  "#06D6A0",
  "#FFB703",
  "#FB8500",
  "#3A86FF",
  "#FF006E",
];

export function createRoom(roomId: string, user: CollabUser): RealtimeChannel {
  const channel = supabase.channel(`deck:${roomId}`, {
    config: { presence: { key: user.id } },
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track(user);
    }
  });
  return channel;
}

export function broadcastEvent(channel: RealtimeChannel, event: CollabEvent): void {
  channel.send({ type: "broadcast", event: "deck-op", payload: event });
}

export function onEvent(
  channel: RealtimeChannel,
  handler: (event: CollabEvent) => void,
): void {
  channel.on("broadcast", { event: "deck-op" }, ({ payload }) => {
    handler(payload as CollabEvent);
  });
}

export function onPresenceChange(
  channel: RealtimeChannel,
  handler: (users: CollabUser[]) => void,
): void {
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState<CollabUser>();
    const users = Object.values(state).flat() as CollabUser[];
    handler(users);
  });
}

// Throttle do cursor — 60ms é suficientemente fluido sem saturar o canal.
const cursorState = new WeakMap<RealtimeChannel, { last: number; pending: number | null; nextArgs: { x: number; y: number; userId: string } | null }>();

export function updateCursor(
  channel: RealtimeChannel,
  x: number,
  y: number,
  userId: string,
): void {
  const now = Date.now();
  let s = cursorState.get(channel);
  if (!s) {
    s = { last: 0, pending: null, nextArgs: null };
    cursorState.set(channel, s);
  }
  const send = (xx: number, yy: number) => {
    s!.last = Date.now();
    // mantém o restante do presence; precisamos passar todos os campos
    // pois track substitui o snapshot. Usamos presenceState para pegar.
    const state = channel.presenceState<CollabUser>();
    const mine = (state[userId]?.[0] ?? null) as CollabUser | null;
    const next: CollabUser = mine
      ? { ...mine, cursorX: xx, cursorY: yy }
      : { id: userId, name: "", color: "#888", slideId: null, cursorX: xx, cursorY: yy };
    channel.track(next);
  };
  if (now - s.last >= 60) {
    send(x, y);
    return;
  }
  s.nextArgs = { x, y, userId };
  if (s.pending !== null) return;
  s.pending = window.setTimeout(() => {
    s!.pending = null;
    const args = s!.nextArgs;
    s!.nextArgs = null;
    if (args) send(args.x, args.y);
  }, 60 - (now - s.last));
}

export function leaveRoom(channel: RealtimeChannel): void {
  try {
    channel.untrack();
  } catch {
    /* noop */
  }
  supabase.removeChannel(channel);
}
