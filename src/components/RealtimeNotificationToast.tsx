import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Bell, CheckCircle, Swords, UserPlus, Users } from "lucide-react";

interface RealtimeNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  actor_name?: string | null;
}

interface RealtimeNotificationToastProps {
  userId: string | undefined;
  onNavigate?: (url: string) => void;
}

// Notification type to icon mapping
const notificationIcons: Record<string, React.ReactNode> = {
  match_request: <Swords className="h-4 w-4 text-amber-400" />,
  team_invite: <UserPlus className="h-4 w-4 text-blue-400" />,
  team_switch: <Users className="h-4 w-4 text-purple-400" />,
  team_switch_result: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  default: <Bell className="h-4 w-4 text-white/60" />,
};

function getNotificationIcon(type: string) {
  return notificationIcons[type] || notificationIcons.default;
}

/**
 * Component that subscribes to real-time notifications and shows toast popups.
 * Does not render any UI - just subscribes and triggers toasts.
 */
export function RealtimeNotificationListener({
  userId,
  onNavigate,
}: RealtimeNotificationToastProps) {
  useEffect(() => {
    if (!userId) return;

    // Subscribe to new notifications for this user
    const channel = supabase
      .channel(`notification-toast-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        async (payload) => {
          const notification = payload.new as RealtimeNotification;

          // Skip floating toast for team_assignment — Dashboard already shows these
          // in its dedicated "Team Notifications" section
          if (notification.type === "team_assignment") return;

          // Get actor name if available
          let actorName: string | null = null;
          if ((payload.new as any).actor_user_id) {
            const { data } = await supabase
              .from("users")
              .select("name")
              .eq("id", (payload.new as any).actor_user_id)
              .single();
            actorName = data?.name || null;
          }

          // Show toast notification
          toast(notification.title, {
            description: notification.message,
            icon: getNotificationIcon(notification.type),
            duration: 6000,
            action: notification.action_url
              ? {
                label: "View",
                onClick: () => onNavigate?.(notification.action_url!),
              }
              : undefined,
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] notification-toast-${userId} status:`, status, err || '');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNavigate]);

  return null;
}

/**
 * Component that subscribes to real-time match requests and shows toast popups.
 */
export function RealtimeMatchRequestListener({
  userId,
  onNavigate,
}: RealtimeNotificationToastProps) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`match-request-toast-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_requests",
          filter: `to_user_id=eq.${userId}`,
        },
        async (payload) => {
          const request = payload.new as {
            id: number;
            booking_id: number;
            from_user_id: string;
          };

          // Get challenger info
          const { data: fromUser } = await supabase
            .from("users")
            .select("name, reg_no, department")
            .eq("id", request.from_user_id)
            .single();

          // Get booking info
          const { data: booking } = await supabase
            .from("bookings")
            .select("date, start_time, end_time")
            .eq("id", request.booking_id)
            .single();

          const challengerName = fromUser?.name || fromUser?.reg_no || "Someone";
          const bookingInfo = booking
            ? `${new Date(booking.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${booking.start_time?.slice(0, 5)}`
            : "";

          toast.custom(
            () => (
              <div className="flex items-start gap-3 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-4 shadow-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                  <Swords className="h-5 w-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">Match Challenge!</p>
                  <p className="text-sm text-white/70 mt-0.5">
                    <span className="font-medium text-amber-400">{challengerName}</span> challenged
                    you{bookingInfo ? ` for ${bookingInfo}` : ""}
                  </p>
                  <button
                    onClick={() => onNavigate?.("/dashboard")}
                    className="mt-2 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View & Respond →
                  </button>
                </div>
              </div>
            ),
            { duration: 8000 }
          );
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] match-request-toast-${userId} status:`, status, err || '');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNavigate]);

  return null;
}

/**
 * Component that subscribes to booking player requests (team invites) and shows toast.
 */
export function RealtimeTeamInviteListener({
  userId,
  onNavigate,
}: RealtimeNotificationToastProps) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`team-invite-toast-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_player_requests",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const request = payload.new as {
            id: number;
            booking_id: number;
            team_id: number;
            requested_by: string;
            request_type: string;
          };

          // Get requester info
          const { data: requester } = await supabase
            .from("users")
            .select("name, reg_no")
            .eq("id", request.requested_by)
            .single();

          // Get team name
          const { data: team } = await supabase
            .from("teams")
            .select("name")
            .eq("id", request.team_id)
            .single();

          const requesterName = requester?.name || requester?.reg_no || "A captain";
          const teamName = team?.name || "their team";

          toast.custom(
            () => (
              <div className="flex items-start gap-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 p-4 shadow-lg">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                  <UserPlus className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">Team Invite!</p>
                  <p className="text-sm text-white/70 mt-0.5">
                    <span className="font-medium text-blue-400">{requesterName}</span> invited you
                    to join <span className="font-medium">{teamName}</span>
                  </p>
                  <button
                    onClick={() => onNavigate?.("/dashboard")}
                    className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Accept or Decline →
                  </button>
                </div>
              </div>
            ),
            { duration: 8000 }
          );
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] team-invite-toast-${userId} status:`, status, err || '');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNavigate]);

  return null;
}

/**
 * All-in-one component that combines all notification listeners.
 */
export function RealtimeNotificationToast({
  userId,
  onNavigate,
}: RealtimeNotificationToastProps) {
  return (
    <>
      <RealtimeNotificationListener userId={userId} onNavigate={onNavigate} />
      <RealtimeMatchRequestListener userId={userId} onNavigate={onNavigate} />
      <RealtimeTeamInviteListener userId={userId} onNavigate={onNavigate} />
    </>
  );
}

