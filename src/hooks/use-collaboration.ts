import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createRoom,
  leaveRoom,
  broadcastEvent,
  onEvent,
  onPresenceChange,
  updateCursor as updateCursorRaw,
  CURSOR_COLORS,
  type CollabUser,
  type CollabEvent,
} from "@/lib/collaboration";
import { useSlidesFlow } from "@/store/slidesFlow";
import type { SlideItem } from "@/lib/slidesFlow";

interface UseCollabReturn {
  collaborators: CollabUser[];
  isConnected: boolean;
  broadcast: (e: CollabEvent) => void;
  updateCursor: (x: number, y: number) => void;
  userId: string | null;
}

export function useCollaboration(
  roomId: string | null,
  userName: string,
): UseCollabReturn {
  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const userId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u_${Math.random().toString(36).slice(2, 10)}`;
    userIdRef.current = userId;
    // Cor estável por hash do userId
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
    const color = CURSOR_COLORS[h % CURSOR_COLORS.length];

    const user: CollabUser = {
      id: userId,
      name: userName || "Convidado",
      color,
      slideId: null,
    };

    const channel = createRoom(roomId, user);
    channelRef.current = channel;

    onPresenceChange(channel, (users) => {
      setCollaborators(users);
      setIsConnected(true);
    });

    onEvent(channel, (event) => {
      if (event.userId === userId) return; // ignora ecos
      const store = useSlidesFlow.getState();
      switch (event.type) {
        case "add_item":
          store.addItemFromCollab(event.payload as SlideItem);
          break;
        case "update_item":
          store.updateItemFromCollab(event.payload as { id: string; patch: Partial<SlideItem> });
          break;
        case "remove_item": {
          const p = event.payload as { id: string };
          store.removeItem(p.id);
          break;
        }
        case "reorder": {
          const p = event.payload as { activeId: string; overId: string };
          store.reorder(p.activeId, p.overId);
          break;
        }
        case "update_transition": {
          const p = event.payload as { transition: Parameters<typeof store.setTransition>[0] };
          store.setTransition(p.transition);
          break;
        }
      }
    });

    return () => {
      setIsConnected(false);
      setCollaborators([]);
      leaveRoom(channel);
      channelRef.current = null;
      userIdRef.current = null;
    };
  }, [roomId, userName]);

  const broadcast = useCallback((e: CollabEvent) => {
    const ch = channelRef.current;
    if (!ch) return;
    broadcastEvent(ch, e);
  }, []);

  const updateCursor = useCallback((x: number, y: number) => {
    const ch = channelRef.current;
    const uid = userIdRef.current;
    if (!ch || !uid) return;
    updateCursorRaw(ch, x, y, uid);
  }, []);

  return {
    collaborators,
    isConnected,
    broadcast,
    updateCursor,
    userId: userIdRef.current,
  };
}
