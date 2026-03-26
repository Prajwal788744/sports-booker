import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimeSubscriptionConfig {
  channelName: string;
  table: string;
  schema?: string;
  event?: RealtimeEvent;
  filter?: string;
  onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

/**
 * Generic hook for Supabase Realtime subscriptions.
 * Handles cleanup automatically and prevents duplicate listeners.
 */
export function useRealtimeSubscription(
  config: RealtimeSubscriptionConfig | null,
  deps: React.DependencyList = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!config) return;

    const { channelName, table, schema = "public", event = "*", filter, onPayload } = config;

    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelConfig: {
      event: RealtimeEvent;
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema,
      table,
    };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", channelConfig, onPayload)
      .subscribe((status, err) => {
        console.log(`[Realtime] ${channelName} status:`, status, err || '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [config?.channelName, config?.table, config?.filter, ...deps]);

  return channelRef.current;
}

/**
 * Multi-table subscription hook for subscribing to multiple tables at once.
 */
export interface MultiTableConfig {
  channelName: string;
  subscriptions: Array<{
    table: string;
    schema?: string;
    event?: RealtimeEvent;
    filter?: string;
  }>;
  onPayload: (
    table: string,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ) => void;
}

export function useMultiTableRealtime(
  config: MultiTableConfig | null,
  deps: React.DependencyList = []
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!config) return;

    const { channelName, subscriptions, onPayload } = config;

    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      const { table, schema = "public", event = "*", filter } = sub;
      const channelConfig: {
        event: RealtimeEvent;
        schema: string;
        table: string;
        filter?: string;
      } = { event, schema, table };

      if (filter) {
        channelConfig.filter = filter;
      }

      channel = channel.on("postgres_changes", channelConfig, (payload) =>
        onPayload(table, payload)
      );
    }

    channel.subscribe((status, err) => {
      console.log(`[Realtime] ${channelName} status:`, status, err || '');
    });
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [config?.channelName, JSON.stringify(config?.subscriptions), ...deps]);

  return channelRef.current;
}

/**
 * Hook for subscribing to user-specific notifications and requests.
 */
export function useUserRealtimeNotifications(
  userId: string | undefined,
  callbacks: {
    onNotification?: () => void;
    onMatchRequest?: () => void;
    onBookingRequest?: () => void;
    onTeamJoinRequest?: () => void;
  }
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Clean up existing
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => callbacks.onNotification?.()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_requests",
          filter: `to_user_id=eq.${userId}`,
        },
        () => callbacks.onMatchRequest?.()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_player_requests",
          filter: `user_id=eq.${userId}`,
        },
        () => callbacks.onBookingRequest?.()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_join_requests",
        },
        () => callbacks.onTeamJoinRequest?.()
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] user-notifications-${userId} status:`, status, err || '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [
    userId,
    callbacks.onNotification,
    callbacks.onMatchRequest,
    callbacks.onBookingRequest,
    callbacks.onTeamJoinRequest,
  ]);

  return channelRef.current;
}

/**
 * Hook for match-specific realtime updates (scoring, innings, ball events).
 */
export function useMatchRealtime(matchId: number | undefined, onUpdate: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!matchId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`match-realtime-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ball_events", filter: `match_id=eq.${matchId}` },
        onUpdate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "innings", filter: `match_id=eq.${matchId}` },
        onUpdate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        onUpdate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_stats", filter: `match_id=eq.${matchId}` },
        onUpdate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_players", filter: `match_id=eq.${matchId}` },
        onUpdate
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] match-realtime-${matchId} status:`, status, err || '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [matchId, onUpdate]);

  return channelRef.current;
}

/**
 * Hook for booking lobby realtime (team ready states).
 */
export function useBookingLobbyRealtime(bookingId: number | undefined, onUpdate: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!bookingId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`booking-lobby-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_teams",
          filter: `booking_id=eq.${bookingId}`,
        },
        onUpdate
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_players",
        },
        onUpdate
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] booking-lobby-${bookingId} status:`, status, err || '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [bookingId, onUpdate]);

  return channelRef.current;
}

/**
 * Hook for user's bookings realtime updates.
 */
export function useUserBookingsRealtime(userId: string | undefined, onUpdate: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`user-bookings-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `user_id=eq.${userId}`,
        },
        onUpdate
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_requests",
          filter: `to_user_id=eq.${userId}`,
        },
        onUpdate
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_requests",
          filter: `from_user_id=eq.${userId}`,
        },
        onUpdate
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] user-bookings-${userId} status:`, status, err || '');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, onUpdate]);

  return channelRef.current;
}
