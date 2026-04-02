import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUserRealtimeNotifications } from "@/hooks/useRealtimeSubscription";
import GcuLogo from "@/components/GcuLogo";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Gamepad2,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface TeamJoinRequest {
  id: number;
  match_id: number;
  player_id: number;
  from_team: string;
  to_team: string;
  status: string;
  matches: { team_a_name: string; team_b_name: string }[] | null;
}

interface MatchRequest {
  id: number;
  booking_id: number;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected";
  bookings: { id: number; date: string; start_time: string; end_time: string }[] | null;
  from_user: { name: string | null; reg_no: string | null; department: string | null } | null;
}

interface BookingPlayerRequest {
  id: number;
  booking_id: number;
  team_id: number;
  source_team_id: number | null;
  requested_by: string;
  status: "pending" | "accepted" | "rejected";
  request_type: "invite" | "team_switch";
  target_team_name: string;
  source_team_name: string | null;
  requested_by_user: { name: string | null; reg_no: string | null; department: string | null } | null;
}

interface PlayerNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.name || "Student";

  const [pendingRequests, setPendingRequests] = useState<TeamJoinRequest[]>([]);
  const [pendingMatchRequests, setPendingMatchRequests] = useState<MatchRequest[]>([]);
  const [pendingBookingRequests, setPendingBookingRequests] = useState<BookingPlayerRequest[]>([]);
  const [notifications, setNotifications] = useState<PlayerNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refetchMatchRequests = useCallback(async () => {
    if (!user) return;
    const { data: matchReqRes, error } = await supabase
      .from("match_requests")
      .select("id, booking_id, from_user_id, to_user_id, status, bookings(id,date,start_time,end_time)")
      .eq("to_user_id", user.id)
      .eq("status", "pending");

    if (error) return;

    const rows = (matchReqRes || []) as Omit<MatchRequest, "from_user">[];
    const fromIds = Array.from(new Set(rows.map((row) => row.from_user_id)));
    let profileMap: Record<string, { name: string | null; reg_no: string | null; department: string | null }> = {};

    if (fromIds.length > 0) {
      const { data: profiles } = await supabase.from("users").select("id, name, reg_no, department").in("id", fromIds);
      profileMap = Object.fromEntries(
        (profiles || []).map((profile: any) => [
          profile.id,
          { name: profile.name, reg_no: profile.reg_no, department: profile.department },
        ])
      );
    }

    setPendingMatchRequests(
      rows.map((row) => ({
        ...row,
        from_user: profileMap[row.from_user_id] || null,
      }))
    );
  }, [user]);

  const refetchBookingRequests = useCallback(async () => {
    if (!user) return;
    const { data: bookingSwitchRes, error } = await supabase
      .from("booking_player_requests")
      .select("id, booking_id, team_id, source_team_id, requested_by, status, request_type")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) return;

    const bookingRows = (bookingSwitchRes || []) as Array<{
      id: number;
      booking_id: number;
      team_id: number;
      source_team_id: number | null;
      requested_by: string;
      status: "pending" | "accepted" | "rejected";
      request_type: "invite" | "team_switch";
    }>;

    const teamIds = Array.from(
      new Set(
        bookingRows
          .flatMap((row) => [row.team_id, row.source_team_id])
          .filter((value): value is number => typeof value === "number")
      )
    );
    const requesterIds = Array.from(new Set(bookingRows.map((row) => row.requested_by)));

    let teamMap = new Map<number, string>();
    let requesterMap: Record<string, { name: string | null; reg_no: string | null; department: string | null }> = {};

    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      teamMap = new Map((teams || []).map((team) => [Number(team.id), team.name]));
    }

    if (requesterIds.length > 0) {
      const { data: requesterProfiles } = await supabase
        .from("users")
        .select("id, name, reg_no, department")
        .in("id", requesterIds);
      requesterMap = Object.fromEntries(
        (requesterProfiles || []).map((profile: any) => [
          profile.id,
          { name: profile.name, reg_no: profile.reg_no, department: profile.department },
        ])
      );
    }

    setPendingBookingRequests(
      bookingRows.map((row) => ({
        ...row,
        target_team_name: teamMap.get(row.team_id) || "Requested team",
        source_team_name: row.source_team_id ? teamMap.get(row.source_team_id) || "Current team" : null,
        requested_by_user: requesterMap[row.requested_by] || null,
        request_type: row.request_type || "team_switch",
      }))
    );
  }, [user]);

  const refetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data: notificationRes } = await supabase
      .from("notifications")
      .select("id, type, title, message, action_url, is_read, created_at, actor_user_id")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!notificationRes) return;

    const actorIds = Array.from(
      new Set(
        (notificationRes || [])
          .map((row) => row.actor_user_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );

    let actorMap: Record<string, string | null> = {};
    if (actorIds.length > 0) {
      const { data: actors } = await supabase.from("users").select("id, name").in("id", actorIds);
      actorMap = Object.fromEntries((actors || []).map((actor: any) => [actor.id, actor.name]));
    }

    setNotifications(
      (notificationRes || []).map((row) => ({
        ...(row as Omit<PlayerNotification, "actor_name">),
        actor_name: row.actor_user_id ? actorMap[row.actor_user_id] || null : null,
      }))
    );
  }, [user]);

  const refetchTeamJoinRequests = useCallback(async () => {
    if (!user) return;
    const { data: teamJoinRes } = await supabase
      .from("team_join_requests")
      .select("id, match_id, player_id, from_team, to_team, status, matches(team_a_name, team_b_name)")
      .eq("status", "pending");

    if (!teamJoinRes) return;

    const { data: myPlayers } = await supabase.from("players").select("id").eq("user_id", user.id);
    const myPlayerIds = new Set((myPlayers || []).map((player: { id: number }) => player.id));
    const mine = (teamJoinRes || []).filter((request: any) => myPlayerIds.has(request.player_id));
    setPendingRequests(mine as TeamJoinRequest[]);
  }, [user]);

  // Realtime subscriptions
  useUserRealtimeNotifications(user?.id, {
    onNotification: refetchNotifications,
    onMatchRequest: refetchMatchRequests,
    onBookingRequest: refetchBookingRequests,
    onTeamJoinRequest: refetchTeamJoinRequests,
  });

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      await Promise.all([
        refetchMatchRequests(),
        refetchBookingRequests(),
        refetchNotifications(),
        refetchTeamJoinRequests(),
      ]);
      if (active) setLoading(false);
    };
    void loadAll();
    return () => { active = false; };
  }, [user]);

  const getTeamNameBySide = (request: TeamJoinRequest, side: string) => {
    const match = request.matches?.[0];
    if (!match) return side;
    return side === "A" ? match.team_a_name : match.team_b_name;
  };

  const handleTeamRequest = async (request: TeamJoinRequest, decision: "accepted" | "rejected") => {
    if (!user) return;
    if (decision === "accepted") {
      const { error: moveErr } = await supabase
        .from("match_players")
        .update({ team: request.to_team, is_captain: false })
        .eq("match_id", request.match_id)
        .eq("player_id", request.player_id);
      if (moveErr) { toast.error(moveErr.message || "Failed to join requested team."); return; }
    }
    const { error: requestError } = await supabase
      .from("team_join_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);
    if (requestError) { toast.error(requestError.message || "Failed to update request."); return; }
    toast.success(decision === "accepted" ? "You joined the new live team." : "Live team request rejected.");
    setPendingRequests((current) => current.filter((item) => item.id !== request.id));
  };

  const handleMatchRequest = async (request: MatchRequest, decision: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("match_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);
    if (error) { toast.error(error.message || "Failed to update opponent captain request."); return; }
    setPendingMatchRequests((current) => current.filter((item) => item.id !== request.id));
    toast.success(
      decision === "accepted"
        ? "Opponent captain request accepted. Build your team now."
        : "Opponent captain request rejected."
    );
    if (decision === "accepted") { navigate(`/opponent-team-setup/${request.booking_id}`); }
  };

  const handleBookingRequest = async (request: BookingPlayerRequest, decision: "accepted" | "rejected") => {
    if (!user) return;
    if (decision === "accepted") {
      if (request.source_team_id) {
        const { error: leaveErr } = await supabase
          .from("team_players")
          .delete()
          .eq("team_id", request.source_team_id)
          .eq("user_id", user.id);
        if (leaveErr) { toast.error(leaveErr.message || "Failed to leave your current booking team."); return; }
      }
      const { error: joinErr } = await supabase.from("team_players").upsert(
        { team_id: request.team_id, user_id: user.id, is_captain: false },
        { onConflict: "team_id,user_id" }
      );
      if (joinErr) { toast.error(joinErr.message || "Failed to join the requested booking team."); return; }
    }
    const { error: updateErr } = await supabase
      .from("booking_player_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);
    if (updateErr) { toast.error(updateErr.message || "Failed to update booking team request."); return; }

    await supabase.from("notifications").insert({
      recipient_user_id: request.requested_by,
      actor_user_id: user.id,
      booking_id: request.booking_id,
      team_id: request.team_id,
      type: "team_switch_result",
      title: decision === "accepted" ? "Player accepted your request" : "Player rejected your request",
      message:
        decision === "accepted"
          ? `${userName} joined ${request.target_team_name} for booking #${request.booking_id}.`
          : `${userName} stayed with ${request.source_team_name || "their current team"} for booking #${request.booking_id}.`,
      action_url: "/my-bookings",
      metadata: {
        bookingId: request.booking_id,
        targetTeamName: request.target_team_name,
        sourceTeamName: request.source_team_name,
      },
    });

    setPendingBookingRequests((current) => current.filter((item) => item.id !== request.id));
    toast.success(
      decision === "accepted"
        ? `You joined ${request.target_team_name}.`
        : `You stayed with ${request.source_team_name || "your current team"}.`
    );
  };

  const markNotificationRead = async (notification: PlayerNotification) => {
    if (notification.is_read) {
      if (notification.action_url) navigate(notification.action_url);
      return;
    }
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id);
    if (error) { toast.error(error.message || "Failed to update notification."); return; }
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
    );
    if (notification.action_url) { navigate(notification.action_url); }
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false);
    if (error) { toast.error("Failed to mark all as read."); return; }
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    toast.success("All notifications marked as read.");
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read).length;
  const totalAlerts = pendingRequests.length + pendingMatchRequests.length + pendingBookingRequests.length + unreadNotifications;

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 h-[400px] w-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white">GCU Sports</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-sm font-medium text-white/50 hover:text-white transition-colors">
              Dashboard
            </button>
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              className="text-sm font-medium text-red-400/70 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              className="text-sm font-medium text-red-400/70 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-8 pb-28 sm:px-6 md:pb-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Bell className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Notifications</h1>
              <p className="text-sm text-white/40 mt-0.5">
                {totalAlerts > 0 ? `${totalAlerts} pending` : "You're all caught up"}
              </p>
            </div>
          </div>
          {unreadNotifications > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
          </div>
        ) : totalAlerts === 0 && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <Bell className="h-12 w-12 mb-4 text-white/10" />
            <p className="text-lg text-white/30">No notifications yet.</p>
            <p className="text-sm text-white/20 mt-1">You'll see requests and updates here.</p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-up">
            {/* Booking Team Requests */}
            {pendingBookingRequests.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">Booking Team Requests</h3>
                  <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[11px] font-bold text-emerald-400">
                    {pendingBookingRequests.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {pendingBookingRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                      <p className="text-sm text-white/85">
                        {request.request_type === "invite" ? (
                          <>
                            {request.requested_by_user?.name || "A captain"} invited you to join{" "}
                            <span className="font-bold text-emerald-400">{request.target_team_name}</span> for booking #
                            {request.booking_id}.
                          </>
                        ) : (
                          <>
                            {request.requested_by_user?.name || "A player"} wants you to leave{" "}
                            <span className="font-bold">{request.source_team_name || "your current team"}</span> and join{" "}
                            <span className="font-bold text-emerald-400">{request.target_team_name}</span> for booking #
                            {request.booking_id}.
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        {request.requested_by_user?.reg_no || "No reg no"}
                        {request.requested_by_user?.department ? ` • ${request.requested_by_user.department}` : ""}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleBookingRequest(request, "accepted")}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleBookingRequest(request, "rejected")}
                          className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opponent Captain Requests */}
            {pendingMatchRequests.length > 0 && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-blue-400">Opponent Captain Requests</h3>
                  <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500/20 px-1.5 text-[11px] font-bold text-blue-400">
                    {pendingMatchRequests.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {pendingMatchRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                      <p className="text-sm text-white/85">
                        {request.from_user?.name || "A user"} ({request.from_user?.reg_no || "No reg no"}
                        {request.from_user?.department ? ` • ${request.from_user.department}` : ""}) wants you to captain
                        the opponent team for booking #{request.booking_id}.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleMatchRequest(request, "accepted")}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleMatchRequest(request, "rejected")}
                          className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Match Team Requests */}
            {pendingRequests.length > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">Live Match Team Requests</h3>
                  <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[11px] font-bold text-amber-400">
                    {pendingRequests.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                      <p className="text-sm text-white/85">
                        Leave <span className="font-bold">{getTeamNameBySide(request, request.from_team)}</span> and join{" "}
                        <span className="font-bold text-emerald-400">{getTeamNameBySide(request, request.to_team)}</span>?
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleTeamRequest(request, "accepted")}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleTeamRequest(request, "rejected")}
                          className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Notifications */}
            {notifications.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-white/70" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white/70">All Notifications</h3>
                  {unreadNotifications > 0 && (
                    <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[11px] font-bold text-emerald-400">
                      {unreadNotifications} new
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => markNotificationRead(notification)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        notification.is_read
                          ? "border-white/[0.05] bg-white/[0.02] text-white/60"
                          : "border-emerald-500/20 bg-emerald-500/[0.06] text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{notification.title}</p>
                        {!notification.is_read && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-white/70">{notification.message}</p>
                      <p className="mt-2 text-[11px] text-white/35">
                        {notification.actor_name ? `${notification.actor_name} • ` : ""}
                        {formatNotificationDate(notification.created_at)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
