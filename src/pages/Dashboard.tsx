import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUserRealtimeNotifications } from "@/hooks/useRealtimeSubscription";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import GcuLogo from "@/components/GcuLogo";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Eye,
  Gamepad2,
  MinusCircle,
  Trophy,
  TrendingUp,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const sportMeta: Record<string, { icon: string; description: string; img: string }> = {
  Cricket: {
    icon: "🏏",
    description: "Professional cricket turf with floodlights for day and night play.",
    img: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=400&fit=crop",
  },
  Futsal: {
    icon: "⚽",
    description: "Indoor futsal court with synthetic turf and professional markings.",
    img: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=400&fit=crop",
  },
  Badminton: {
    icon: "🏸",
    description: "Indoor badminton courts with wooden flooring and proper lighting.",
    img: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&h=400&fit=crop",
  },
};

interface Sport {
  id: number;
  name: string;
}

interface MatchRecord {
  id: number;
  team_a_name: string;
  team_b_name: string;
  winner: string | null;
  status: string;
  match_type: string;
  total_overs: number;
  created_at: string;
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.name || "Student";

  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [userTeamName, setUserTeamName] = useState("");
  const [pendingRequests, setPendingRequests] = useState<TeamJoinRequest[]>([]);
  const [pendingMatchRequests, setPendingMatchRequests] = useState<MatchRequest[]>([]);
  const [pendingBookingRequests, setPendingBookingRequests] = useState<BookingPlayerRequest[]>([]);
  const [notifications, setNotifications] = useState<PlayerNotification[]>([]);
  const [showRequests, setShowRequests] = useState(false);

  // Refetch functions for realtime updates
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
      .limit(8);

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

  // Realtime subscriptions for instant updates
  useUserRealtimeNotifications(user?.id, {
    onNotification: refetchNotifications,
    onMatchRequest: refetchMatchRequests,
    onBookingRequest: refetchBookingRequests,
    onTeamJoinRequest: refetchTeamJoinRequests,
  });

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const { data: sportsData } = await supabase.from("sports").select("*").order("id");
      if (active && sportsData) {
        setSports(sportsData);
      }

      if (!user) return;

      const [teamNameRes, , teamJoinRes, matchReqRes, bookingSwitchRes, notificationRes] = await Promise.all([
        supabase.from("users").select("team_name").eq("id", user.id).single(),
        Promise.resolve(null), // matches fetched separately below
        supabase
          .from("team_join_requests")
          .select("id, match_id, player_id, from_team, to_team, status, matches(team_a_name, team_b_name)")
          .eq("status", "pending"),
        supabase
          .from("match_requests")
          .select("id, booking_id, from_user_id, to_user_id, status, bookings(id,date,start_time,end_time)")
          .eq("to_user_id", user.id)
          .eq("status", "pending"),
        supabase
          .from("booking_player_requests")
          .select("id, booking_id, team_id, source_team_id, requested_by, status, request_type")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("id, type, title, message, action_url, is_read, created_at, actor_user_id")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (!active) return;

      if (teamNameRes.data?.team_name) {
        setUserTeamName(teamNameRes.data.team_name.toLowerCase().trim());
      } else {
        setUserTeamName("");
      }

      // Fetch only matches the user actually participated in
      const { data: myPlayers } = await supabase.from("players").select("id").eq("user_id", user.id);
      const myPlayerIds = (myPlayers || []).map((p: { id: number }) => p.id);
      if (myPlayerIds.length > 0) {
        const { data: matchPlayerRows } = await supabase
          .from("match_players")
          .select("match_id")
          .in("player_id", myPlayerIds);
        const matchIds = [...new Set((matchPlayerRows || []).map((mp: { match_id: number }) => mp.match_id))];
        if (matchIds.length > 0) {
          const { data: matchesData } = await supabase
            .from("matches")
            .select("id, team_a_name, team_b_name, winner, status, match_type, total_overs, created_at")
            .in("id", matchIds)
            .eq("status", "completed")
            .not("winner", "is", null)
            .order("created_at", { ascending: false });
          if (active) setMatches((matchesData || []) as MatchRecord[]);
        } else {
          if (active) setMatches([]);
        }
      } else {
        if (active) setMatches([]);
      }

      if (teamJoinRes.data) {
        const { data: myPlayers } = await supabase.from("players").select("id").eq("user_id", user.id);
        const myPlayerIds = new Set((myPlayers || []).map((player: { id: number }) => player.id));
        const mine = (teamJoinRes.data || []).filter((request: any) => myPlayerIds.has(request.player_id));
        if (active) {
          setPendingRequests(mine as TeamJoinRequest[]);
        }
      }

      if (matchReqRes.error) {
        toast.error("Failed to load opponent captain requests.");
      } else {
        const rows = (matchReqRes.data || []) as Omit<MatchRequest, "from_user">[];
        const fromIds = Array.from(new Set(rows.map((row) => row.from_user_id)));
        let profileMap: Record<string, { name: string | null; reg_no: string | null; department: string | null }> = {};

        if (fromIds.length > 0) {
          const { data: profiles } = await supabase.from("users").select("id, name, reg_no, department").in("id", fromIds);
          profileMap = Object.fromEntries(
            (profiles || []).map((profile: any) => [
              profile.id,
              {
                name: profile.name,
                reg_no: profile.reg_no,
                department: profile.department,
              },
            ])
          );
        }

        if (active) {
          setPendingMatchRequests(
            rows.map((row) => ({
              ...row,
              from_user: profileMap[row.from_user_id] || null,
            }))
          );
        }
      }

      if (bookingSwitchRes.error) {
        toast.error("Failed to load booking team requests.");
      } else {
        const bookingRows = (bookingSwitchRes.data || []) as Array<{
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
              {
                name: profile.name,
                reg_no: profile.reg_no,
                department: profile.department,
              },
            ])
          );
        }

        if (active) {
          setPendingBookingRequests(
            bookingRows.map((row) => ({
              ...row,
              target_team_name: teamMap.get(row.team_id) || "Requested team",
              source_team_name: row.source_team_id ? teamMap.get(row.source_team_id) || "Current team" : null,
              requested_by_user: requesterMap[row.requested_by] || null,
              request_type: row.request_type || "team_switch",
            }))
          );
        }
      }

      if (notificationRes.data) {
        const actorIds = Array.from(
          new Set(
            (notificationRes.data || [])
              .map((row) => row.actor_user_id)
              .filter((value): value is string => typeof value === "string" && value.length > 0)
          )
        );

        let actorMap: Record<string, string | null> = {};
        if (actorIds.length > 0) {
          const { data: actors } = await supabase.from("users").select("id, name").in("id", actorIds);
          actorMap = Object.fromEntries((actors || []).map((actor: any) => [actor.id, actor.name]));
        }

        if (active) {
          setNotifications(
            (notificationRes.data || []).map((row) => ({
              ...(row as Omit<PlayerNotification, "actor_name">),
              actor_name: row.actor_user_id ? actorMap[row.actor_user_id] || null : null,
            }))
          );
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
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

      if (moveErr) {
        toast.error(moveErr.message || "Failed to join requested team.");
        return;
      }
    }

    const { error: requestError } = await supabase
      .from("team_join_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);

    if (requestError) {
      toast.error(requestError.message || "Failed to update request.");
      return;
    }

    toast.success(decision === "accepted" ? "You joined the new live team." : "Live team request rejected.");
    setPendingRequests((current) => current.filter((item) => item.id !== request.id));
  };

  const handleMatchRequest = async (request: MatchRequest, decision: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("match_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);

    if (error) {
      toast.error(error.message || "Failed to update opponent captain request.");
      return;
    }

    setPendingMatchRequests((current) => current.filter((item) => item.id !== request.id));
    toast.success(
      decision === "accepted"
        ? "Opponent captain request accepted. Build your team now."
        : "Opponent captain request rejected."
    );

    if (decision === "accepted") {
      navigate(`/opponent-team-setup/${request.booking_id}`);
    }
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

        if (leaveErr) {
          toast.error(leaveErr.message || "Failed to leave your current booking team.");
          return;
        }
      }

      const { error: joinErr } = await supabase.from("team_players").upsert(
        {
          team_id: request.team_id,
          user_id: user.id,
          is_captain: false,
        },
        { onConflict: "team_id,user_id" }
      );

      if (joinErr) {
        toast.error(joinErr.message || "Failed to join the requested booking team.");
        return;
      }
    }

    const { error: updateErr } = await supabase
      .from("booking_player_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", request.id);

    if (updateErr) {
      toast.error(updateErr.message || "Failed to update booking team request.");
      return;
    }

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
    if (error) {
      toast.error(error.message || "Failed to update notification.");
      return;
    }

    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
    );

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const totalMatches = matches.length;

  const getMatchResult = (match: MatchRecord) => {
    if (match.winner === "tie") return "tie";
    if (!match.winner) return "unknown";
    return match.winner === "A" ? match.team_a_name : match.team_b_name;
  };

  const isUserWin = (match: MatchRecord) => {
    if (match.winner === "tie" || !match.winner) return false;
    const winnerTeam = match.winner === "A" ? match.team_a_name : match.team_b_name;
    if (userTeamName) {
      return winnerTeam.toLowerCase().trim() === userTeamName;
    }
    return match.winner === "A";
  };

  const isUserLoss = (match: MatchRecord) => {
    if (match.winner === "tie" || !match.winner) return false;
    return !isUserWin(match);
  };

  const wins = matches.filter(isUserWin).length;
  const losses = matches.filter(isUserLoss).length;
  const ties = matches.filter((match) => match.winner === "tie").length;
  const unreadNotifications = notifications.filter((notification) => !notification.is_read).length;
  const totalAlerts =
    pendingRequests.length + pendingMatchRequests.length + pendingBookingRequests.length + unreadNotifications;

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 h-[400px] w-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white">GCU Sports</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setShowRequests((prev) => !prev)}
              className={`relative flex items-center gap-1 text-sm font-medium transition-colors ${
                showRequests ? "text-amber-400" : "text-amber-400/80 hover:text-amber-400"
              }`}
            >
              <Bell className="h-3.5 w-3.5" /> Requests
              {totalAlerts > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">
                  {totalAlerts}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("/my-bookings")}
              className="text-sm font-medium text-white/50 transition-colors hover:text-white"
            >
              My Bookings
            </button>
            <button
              onClick={() => navigate("/matches")}
              className="flex items-center gap-1 text-sm font-medium text-emerald-400/70 transition-colors hover:text-emerald-400"
            >
              <Gamepad2 className="h-3.5 w-3.5" /> Matches
            </button>
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-1 text-sm font-medium text-white/50 transition-colors hover:text-white"
            >
              <User className="h-3.5 w-3.5" /> Profile
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              className="text-sm font-medium text-red-400/70 transition-colors hover:text-red-400"
            >
              Logout
            </button>
          </div>
          {/* Mobile: only show requests bell + logout */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setShowRequests((prev) => !prev)}
              className={`relative flex items-center gap-1 text-sm font-medium transition-colors ${
                showRequests ? "text-amber-400" : "text-amber-400/80 hover:text-amber-400"
              }`}
            >
              <Bell className="h-4 w-4" />
              {totalAlerts > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">
                  {totalAlerts}
                </span>
              )}
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              className="text-sm font-medium text-red-400/70 transition-colors hover:text-red-400"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-6 sm:py-10 md:pb-12 lg:py-12">
        <div className="mb-10 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Welcome back, <span className="text-emerald-400">{userName}</span>!
          </h1>
          <p className="mt-2 text-base text-white/40">Choose a sport and book your slot.</p>
        </div>

        {showRequests && (pendingBookingRequests.length > 0 ||
          pendingMatchRequests.length > 0 ||
          pendingRequests.length > 0 ||
          notifications.length > 0) && (
          <div id="requests-section" className="mb-10 space-y-6 animate-fade-up">
            {pendingBookingRequests.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">Booking Team Requests</h3>
                </div>
                <div className="space-y-3">
                  {pendingBookingRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                      <p className="text-sm text-white/85">
                        {request.request_type === "invite" ? (
                          <>
                            {request.requested_by_user?.name || "A captain"} invited you to join{" "}
                            <span className="font-bold text-emerald-400">{request.target_team_name}</span> for booking    #
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

            {pendingMatchRequests.length > 0 && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-blue-400">Opponent Captain Requests</h3>
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

            {pendingRequests.length > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">Live Match Team Requests</h3>
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

            {notifications.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 animate-fade-up">
                <div className="mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-white/70" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white/70">Team Notifications</h3>
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

        <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((sport, index) => {
            const meta = sportMeta[sport.name] || { icon: "🏅", description: "", img: "" };
            return (
              <li
                key={sport.id}
                className="list-none min-h-[14rem] animate-fade-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                  <button
                    onClick={() => navigate(`/booking/${sport.id}`)}
                    className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1"
                  >
                    {meta.img && (
                      <div
                        className="absolute inset-0 opacity-[0.08]"
                        style={{
                          backgroundImage: `url('${meta.img}')`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    )}
                    <div className="relative flex flex-col gap-5">
                      <div className="inline-block text-5xl transition-transform duration-300 hover:scale-110">{meta.icon}</div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-semibold tracking-[-0.04em] text-white md:text-2xl">{sport.name}</h3>
                        <p className="text-sm text-white/40 md:text-base">{meta.description}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                          Book Now
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {matches.length > 0 && (
          <div className="mt-14 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <div className="mb-6 flex items-center gap-3">
              <Gamepad2 className="h-7 w-7 text-emerald-400" />
              <h2 className="text-2xl font-extrabold tracking-tight">My Matches</h2>
              <span className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 text-sm font-bold text-emerald-400">
                {totalMatches}
              </span>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {[
                { label: "Played", value: totalMatches, icon: TrendingUp, color: "text-white" },
                { label: "Wins", value: wins, icon: CheckCircle2, color: "text-emerald-400" },
                { label: "Losses", value: losses, icon: MinusCircle, color: "text-red-400" },
                { label: "Ties", value: ties, icon: XCircle, color: "text-amber-400" },
              ].map((stat) => (
                <div key={stat.label} className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2">
                  <GlowingEffect spread={30} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                  <div className="relative rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-5 text-center">
                    <stat.icon className={`mx-auto mb-2 h-5 w-5 ${stat.color}`} />
                    <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                    <div className="mt-1 text-xs font-semibold text-white/40">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <div className="grid grid-cols-4 border-b border-white/[0.04] px-5 py-3 text-[10px] font-bold uppercase text-white/30">
                <span className="col-span-1">Teams</span>
                <span className="text-center">Type</span>
                <span className="text-center">Result</span>
                <span className="text-right">Action</span>
              </div>
              {matches.map((match) => {
                const result = getMatchResult(match);
                const winnerName = result === "tie" ? "Tied" : result === "unknown" ? "—" : `${result} won`;
                const date = new Date(match.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                return (
                  <div
                    key={match.id}
                    className="grid grid-cols-4 items-center border-b border-white/[0.02] px-5 py-3.5 transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <div className="col-span-1">
                      <p className="truncate text-sm font-semibold text-white/80">
                        {match.team_a_name} <span className="text-white/30">vs</span> {match.team_b_name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-white/30">{date}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-medium text-white/40">
                        {match.match_type} · {match.total_overs}ov
                      </span>
                    </div>
                    <div className="text-center">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${
                          result === "tie"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                            : isUserWin(match)
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/20 bg-red-500/10 text-red-400"
                        }`}
                      >
                        {winnerName}
                      </span>
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => navigate(`/live/${match.id}`)}
                        className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-400/70 transition-colors hover:text-emerald-400"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {matches.map((match) => {
                const result = getMatchResult(match);
                const winnerName = result === "tie" ? "Tied" : result === "unknown" ? "—" : `${result} won`;
                const date = new Date(match.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

                return (
                  <div
                    key={match.id}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 space-y-3"
                  >
                    {/* Teams */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-white">
                          {match.team_a_name}
                        </p>
                        <p className="text-xs text-white/30 font-medium my-0.5">vs</p>
                        <p className="text-base font-bold text-white">
                          {match.team_b_name}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 inline-block rounded-full border px-3 py-1.5 text-xs font-bold ${
                          result === "tie"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                            : isUserWin(match)
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-red-500/20 bg-red-500/10 text-red-400"
                        }`}
                      >
                        {winnerName}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span className="font-medium">{match.match_type} · {match.total_overs}ov</span>
                      <span>·</span>
                      <span>{date}</span>
                    </div>

                    {/* Action */}
                    <button
                      onClick={() => navigate(`/live/${match.id}`)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 transition-colors active:bg-emerald-500/20"
                    >
                      <Eye className="h-4 w-4" /> View Scorecard
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
