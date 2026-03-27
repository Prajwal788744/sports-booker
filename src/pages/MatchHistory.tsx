import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Trophy, Wifi, Clock, Award, Eye, Gamepad2, Circle } from "lucide-react";

interface MatchRow {
  id: number; match_type: string; total_overs: number; status: string;
  team_a_name: string; team_b_name: string; winner: string | null;
  man_of_match: number | null; created_at: string;
}

export default function MatchHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Step 1: Get user's player IDs
      const { data: myPlayers } = await supabase.from("players").select("id").eq("user_id", user.id);
      if (!myPlayers || myPlayers.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const playerIds = myPlayers.map((p: { id: number }) => p.id);
      // Step 2: Get match IDs where this user played
      const { data: matchPlayerRows } = await supabase
        .from("match_players")
        .select("match_id")
        .in("player_id", playerIds);
      if (!matchPlayerRows || matchPlayerRows.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      const matchIds = [...new Set(matchPlayerRows.map((mp: { match_id: number }) => mp.match_id))];
      // Step 3: Fetch only those matches
      const { data } = await supabase
        .from("matches")
        .select("*")
        .in("id", matchIds)
        .order("created_at", { ascending: false });
      setMatches(data || []);
      setLoading(false);
    })();
  }, [user]);

  const getStatusColor = (s: string) => {
    if (s === "ongoing") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (s === "completed") return "bg-white/5 text-white/40 border-white/10";
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  };

  const liveMatches = matches.filter((m) => m.status === "ongoing");
  const completedMatches = matches.filter((m) => m.status === "completed");
  const upcomingMatches = matches.filter((m) => m.status === "not_started");

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Dashboard
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white hidden sm:inline">Matches</span>
          </div>
          <div />
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-8 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight">🏏 Matches</h1>
          <p className="text-white/40 text-sm mt-1">Live, upcoming, and completed matches</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <Gamepad2 className="h-12 w-12 mb-4 text-white/10" />
            <p className="text-lg text-white/30">No matches yet.</p>
            <p className="text-sm text-white/20 mt-1">Create one from your cricket booking!</p>
          </div>
        ) : (
          <>
            {/* Live Matches */}
            {liveMatches.length > 0 && (
              <div className="mb-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Wifi className="h-3.5 w-3.5 animate-pulse" /> Live Now
                </h3>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {liveMatches.map((m) => (
                    <li key={m.id} className="list-none">
                      <div className="relative rounded-[1.25rem] border-[0.75px] border-emerald-500/20 p-2 md:p-3">
                        <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                        <button
                          onClick={() => navigate(`/live/${m.id}`)}
                          className="relative w-full text-left rounded-xl border-[0.75px] border-emerald-500/10 bg-emerald-500/[0.03] p-5 hover:bg-emerald-500/[0.06] transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Circle className="h-2 w-2 fill-emerald-400" /> LIVE
                            </span>
                            <span className="text-[10px] text-white/30">{m.match_type} · {m.total_overs}ov</span>
                          </div>
                          <p className="text-base font-bold text-white">
                            {m.team_a_name} <span className="text-white/30">vs</span> {m.team_b_name}
                          </p>
                          <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400/70">
                            <Eye className="h-3 w-3" /> Watch Live →
                          </div>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Upcoming */}
            {upcomingMatches.length > 0 && (
              <div className="mb-10 animate-fade-up" style={{ animationDelay: "0.15s" }}>
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4">Upcoming</h3>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {upcomingMatches.map((m) => (
                    <li key={m.id} className="list-none">
                      <button
                        onClick={() => navigate(`/team-setup/${m.id}`)}
                        className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${getStatusColor(m.status)}`}>
                            Not Started
                          </span>
                          <span className="text-[10px] text-white/30">{m.match_type}</span>
                        </div>
                        <p className="text-sm font-bold text-white/70">
                          {m.team_a_name} vs {m.team_b_name}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Completed */}
            {completedMatches.length > 0 && (
              <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
                <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Completed</h3>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {completedMatches.map((m) => {
                    const winnerName = m.winner === "A" ? m.team_a_name : m.winner === "B" ? m.team_b_name : "Tie";
                    return (
                      <li key={m.id} className="list-none">
                        <button
                          onClick={() => navigate(`/live/${m.id}`)}
                          className="w-full text-left rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors opacity-70 hover:opacity-100"
                        >
                          <p className="text-sm font-bold text-white/60">
                            {m.team_a_name} vs {m.team_b_name}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-xs text-white/30">{m.match_type} · {m.total_overs}ov</span>
                            <span className="text-xs font-bold text-emerald-400/70 flex items-center gap-1">
                              <Trophy className="h-3 w-3" /> {winnerName}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
