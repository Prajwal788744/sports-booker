import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useBookingLobbyRealtime } from "@/hooks/useRealtimeSubscription";
import { Button } from "@/components/ui/button";
import { ensureBookingMatchStarted } from "@/lib/booking-match";
import { ArrowLeft, CheckCircle2, Loader2, Shield, Swords, Trophy, Users } from "lucide-react";
import GcuLogo from "@/components/GcuLogo";
import { toast } from "sonner";

interface BookingTeamRow {
  id: number;
  booking_id: number;
  user_id: string;
  team_id: number;
  is_owner: boolean;
  team_ready: boolean;
  teams: { id: number; name: string } | { id: number; name: string }[] | null;
}

interface TeamPlayerDisplay {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  is_captain: boolean;
}

function getTeamName(teams: BookingTeamRow["teams"]): string {
  if (Array.isArray(teams)) return teams[0]?.name || "Unnamed Team";
  return teams?.name || "Unnamed Team";
}

function PlayerAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || "Player"} className="h-10 w-10 rounded-full object-cover border border-white/10" />;
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-bold text-white/60">
      {(name || "P").slice(0, 2).toUpperCase()}
    </div>
  );
}

function TeamReadyPulse() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
      </div>
      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Ready</span>
    </div>
  );
}

function TeamLoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
          <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/[0.06]" />
            <div className="h-2 w-16 rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MatchLobby() {
  const { bookingId } = useParams();
  const numBookingId = Number(bookingId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bookingTeams, setBookingTeams] = useState<BookingTeamRow[]>([]);
  const [ownerPlayers, setOwnerPlayers] = useState<TeamPlayerDisplay[]>([]);
  const [opponentPlayers, setOpponentPlayers] = useState<TeamPlayerDisplay[]>([]);
  const [startingMatch, setStartingMatch] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [goingIn, setGoingIn] = useState(false);

  const ownerTeam = useMemo(() => bookingTeams.find((t) => t.is_owner) || null, [bookingTeams]);
  const opponentTeam = useMemo(() => bookingTeams.find((t) => !t.is_owner) || null, [bookingTeams]);
  const currentUserTeam = useMemo(() => bookingTeams.find((t) => t.user_id === user?.id) || null, [bookingTeams, user]);

  const ownerReady = ownerTeam?.team_ready ?? false;
  const opponentReady = opponentTeam?.team_ready ?? false;
  const bothReady = ownerReady && opponentReady;
  const currentUserReady = currentUserTeam?.team_ready ?? false;

  const fetchTeamPlayers = useCallback(async (teamId: number): Promise<TeamPlayerDisplay[]> => {
    const { data: tpRows, error: tpError } = await supabase
      .from("team_players")
      .select("user_id, is_captain")
      .eq("team_id", teamId);

    if (tpError || !tpRows || tpRows.length === 0) return [];

    const userIds = tpRows.map((row) => row.user_id);
    const { data: userRows } = await supabase
      .from("users")
      .select("id, name, avatar_url")
      .in("id", userIds);

    const userMap = new Map((userRows || []).map((u) => [u.id, u]));

    return tpRows.map((row) => {
      const userInfo = userMap.get(row.user_id);
      return {
        user_id: row.user_id,
        name: userInfo?.name ?? null,
        avatar_url: userInfo?.avatar_url ?? null,
        is_captain: !!row.is_captain,
      };
    });
  }, []);

  const loadLobbyState = useCallback(async () => {
    if (!numBookingId || !user) return;

    const { data: teams, error } = await supabase
      .from("booking_teams")
      .select("id, booking_id, user_id, team_id, is_owner, team_ready, teams(id, name)")
      .eq("booking_id", numBookingId);

    if (error) {
      toast.error("Failed to load lobby state.");
      return;
    }

    const rows = (teams || []) as BookingTeamRow[];
    setBookingTeams(rows);

    // Check ownership
    const { data: booking } = await supabase.from("bookings").select("user_id").eq("id", numBookingId).single();
    setIsOwner(booking?.user_id === user.id);

    // Check if match already exists for this booking — auto-redirect if ongoing
    const { data: existingMatch } = await supabase
      .from("matches")
      .select("id, status, created_by")
      .eq("booking_id", numBookingId)
      .in("status", ["ongoing", "not_started"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existingMatch && existingMatch.status === "ongoing") {
      // If user is NOT the match creator, redirect to live view
      // If user IS the creator, redirect to scoring
      if (existingMatch.created_by === user.id) {
        navigate(`/scoring/${existingMatch.id}`, { replace: true });
      } else {
        navigate(`/live/${existingMatch.id}`, { replace: true });
      }
      return;
    }

    // If both ready, fetch players
    const owner = rows.find((t) => t.is_owner);
    const opponent = rows.find((t) => !t.is_owner);

    if (owner?.team_ready) {
      const players = await fetchTeamPlayers(owner.team_id);
      setOwnerPlayers(players);
    }
    if (opponent?.team_ready) {
      const players = await fetchTeamPlayers(opponent.team_id);
      setOpponentPlayers(players);
    }

    setLoading(false);
  }, [numBookingId, user, fetchTeamPlayers]);

  // Initial load
  useEffect(() => {
    loadLobbyState();
  }, [loadLobbyState]);

  // Realtime subscription for lobby state changes using enhanced hook
  useBookingLobbyRealtime(numBookingId, loadLobbyState);

  const handleGoIn = async () => {
    if (!user || !currentUserTeam) {
      toast.error("You must save your team first.");
      return;
    }

    setGoingIn(true);
    const { error } = await supabase
      .from("booking_teams")
      .update({ team_ready: true })
      .eq("id", currentUserTeam.id);

    if (error) {
      toast.error("Failed to mark team as ready.");
    } else {
      toast.success("You're in! Waiting for the match to begin...");
    }
    setGoingIn(false);
  };

  const handleStartMatch = async () => {
    if (!user || !bothReady) return;

    setStartingMatch(true);
    try {
      const result = await ensureBookingMatchStarted(numBookingId, user.id);
      toast.success(result.created ? "Match started!" : "Opening the match.");
      navigate(result.route);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start the match.");
    } finally {
      setStartingMatch(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-white/40 text-sm">Loading match lobby...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-blue-500/[0.04] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate("/my-bookings")} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> My Bookings
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white hidden sm:inline">Match Lobby</span>
          </div>
          <div />
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-10 pb-28 sm:px-6 md:pb-10">
        {/* Header */}
        <div className="mb-8 text-center animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            ⚔️ Match Lobby
          </h1>
          <p className="mt-2 text-white/40">Booking #{numBookingId}</p>
        </div>

        {/* Status Banner */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.05s" }}>
          {bothReady ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-5 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-lg font-bold text-emerald-400">Both Teams Ready!</p>
              <p className="mt-1 text-sm text-white/50">The match can now begin.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-center">
              <Loader2 className="mx-auto mb-2 h-8 w-8 text-amber-400 animate-spin" />
              <p className="text-lg font-bold text-amber-400">Waiting for {!ownerReady && !opponentReady ? "both teams" : "opponent"}...</p>
              <p className="mt-1 text-sm text-white/50">Each team captain must click "Go In" to confirm readiness.</p>
            </div>
          )}
        </div>

        {/* Team Cards */}
        <div className="grid gap-6 sm:grid-cols-2 mb-8">
          {/* Owner Team */}
          <div className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className={`rounded-2xl border p-5 transition-all duration-300 ${
              ownerReady
                ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                : "border-white/[0.08] bg-white/[0.03]"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className={`h-5 w-5 ${ownerReady ? "text-emerald-400" : "text-blue-400"}`} />
                  <h3 className="text-lg font-bold text-white">
                    {ownerTeam ? getTeamName(ownerTeam.teams) : "Owner Team"}
                  </h3>
                </div>
                {ownerReady ? (
                  <TeamReadyPulse />
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wider text-white/30">Not Ready</span>
                )}
              </div>

              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-white/30">
                {ownerTeam?.is_owner && ownerTeam?.user_id === user?.id ? "Your Team (Owner)" : "Booking Owner's Team"}
              </div>

              {ownerReady ? (
                <div className="mt-3 space-y-2">
                  {ownerPlayers.length > 0 ? (
                    ownerPlayers.map((p) => (
                      <div key={p.user_id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                        <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{p.name || "Unnamed"}</div>
                        </div>
                        {p.is_captain && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400">
                            Captain
                          </span>
                        )}
                        {p.user_id === user?.id && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                            You
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/30 text-center py-3">No players loaded yet.</p>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <TeamLoadingSkeleton />
                  <p className="mt-3 text-center text-xs text-white/30">Waiting for team to go in...</p>
                </div>
              )}

              {/* Go In button for owner */}
              {ownerTeam?.user_id === user?.id && !ownerReady && (
                <Button
                  onClick={handleGoIn}
                  disabled={goingIn}
                  className="mt-4 w-full rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold py-5 text-sm shadow-lg shadow-blue-500/20"
                >
                  {goingIn ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Going In...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" /> Go In
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Opponent Team */}
          <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <div className={`rounded-2xl border p-5 transition-all duration-300 ${
              opponentReady
                ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                : "border-white/[0.08] bg-white/[0.03]"
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className={`h-5 w-5 ${opponentReady ? "text-emerald-400" : "text-orange-400"}`} />
                  <h3 className="text-lg font-bold text-white">
                    {opponentTeam ? getTeamName(opponentTeam.teams) : "Opponent Team"}
                  </h3>
                </div>
                {opponentReady ? (
                  <TeamReadyPulse />
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wider text-white/30">Not Ready</span>
                )}
              </div>

              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-white/30">
                {opponentTeam && !opponentTeam.is_owner && opponentTeam.user_id === user?.id ? "Your Team (Opponent)" : "Opponent Captain's Team"}
              </div>

              {opponentReady ? (
                <div className="mt-3 space-y-2">
                  {opponentPlayers.length > 0 ? (
                    opponentPlayers.map((p) => (
                      <div key={p.user_id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                        <PlayerAvatar name={p.name} avatarUrl={p.avatar_url} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{p.name || "Unnamed"}</div>
                        </div>
                        {p.is_captain && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-400">
                            Captain
                          </span>
                        )}
                        {p.user_id === user?.id && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">
                            You
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-white/30 text-center py-3">No players loaded yet.</p>
                  )}
                </div>
              ) : opponentTeam ? (
                <div className="mt-3">
                  <TeamLoadingSkeleton />
                  <p className="mt-3 text-center text-xs text-white/30">Waiting for team to go in...</p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center">
                  <Users className="mx-auto mb-2 h-6 w-6 text-white/15" />
                  <p className="text-sm text-white/30">No opponent team yet.</p>
                  <p className="mt-1 text-xs text-white/20">The booking owner must choose an opponent captain first.</p>
                </div>
              )}

              {/* Go In button for opponent */}
              {opponentTeam?.user_id === user?.id && !opponentReady && (
                <Button
                  onClick={handleGoIn}
                  disabled={goingIn}
                  className="mt-4 w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold py-5 text-sm shadow-lg shadow-orange-500/20"
                >
                  {goingIn ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Going In...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" /> Go In
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* VS Divider */}
        <div className="flex items-center justify-center mb-8 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <span className="mx-4 text-xl font-black text-white/20">VS</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>

        {/* Start Match Button */}
        <div className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
          {bothReady ? (
            <Button
              onClick={handleStartMatch}
              disabled={startingMatch}
              className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-7 text-lg shadow-xl shadow-emerald-500/20 transition-all duration-300"
            >
              {startingMatch ? (
                <span className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" /> Starting Match...
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <Trophy className="h-5 w-5" /> Start Match
                </span>
              )}
            </Button>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-7 text-center">
              <Loader2 className="mx-auto mb-2 h-5 w-5 text-white/20 animate-spin" />
              <p className="text-sm font-semibold text-white/30">
                {!currentUserTeam ? "Save your team first" : currentUserReady ? "Waiting for opponent..." : "Click 'Go In' when ready"}
              </p>
            </div>
          )}

          {!currentUserTeam && (
            <Button
              onClick={() => navigate(`/booking-team/${numBookingId}`)}
              variant="outline"
              className="mt-3 w-full rounded-2xl border-white/[0.1] bg-transparent py-5 text-sm font-semibold text-white/60 hover:text-white hover:border-white/20"
            >
              Go to Team Setup →
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
