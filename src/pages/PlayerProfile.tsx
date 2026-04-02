import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Trophy, User, Gamepad2, Target, Crosshair, Users, Calendar, Award, TrendingUp, Hash, Mail } from "lucide-react";
import GcuLogo from "@/components/GcuLogo";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  reg_no: string;
  department: string;
  avatar_url: string;
  preferred_role: string;
  preferred_sport_id: number | null;
  registration_year: number | null;
  course_code: string;
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
  playerTeam: string; // "A" or "B"
}

interface PlayerStatsRow {
  match_id: number;
  runs_scored: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  wickets_taken: number;
  runs_conceded: number;
}

interface InningsRow {
  match_id: number;
  innings_number: number;
  team: string;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
}

interface TeamRecord {
  id: number;
  name: string;
  booking_id: number;
  role: string;
}

type Tab = "matches" | "stats" | "teams";

export default function PlayerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [allStats, setAllStats] = useState<PlayerStatsRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("matches");

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      // 1. Profile
      const { data: userData } = await supabase
        .from("users")
        .select("id, name, email, reg_no, department, avatar_url, preferred_role, preferred_sport_id, registration_year, course_code")
        .eq("id", userId)
        .single();
      if (userData) setProfile(userData as UserProfile);

      // 2. Player IDs
      const { data: playerRows } = await supabase.from("players").select("id").eq("user_id", userId);
      const playerIds = (playerRows || []).map((p: { id: number }) => p.id);

      if (playerIds.length === 0) {
        setLoading(false);
        return;
      }

      // 3. Match players (to get which team user played on)
      const { data: matchPlayerRows } = await supabase
        .from("match_players")
        .select("match_id, team, player_id")
        .in("player_id", playerIds);
      const matchTeamMap = new Map<number, string>();
      (matchPlayerRows || []).forEach((mp: { match_id: number; team: string }) => {
        matchTeamMap.set(mp.match_id, mp.team);
      });
      const matchIds = [...new Set((matchPlayerRows || []).map((mp: { match_id: number }) => mp.match_id))];

      if (matchIds.length > 0) {
        // 4. Matches
        const { data: matchesData } = await supabase
          .from("matches")
          .select("id, team_a_name, team_b_name, winner, status, match_type, total_overs, created_at")
          .in("id", matchIds)
          .order("created_at", { ascending: false });
        setMatches(
          (matchesData || []).map((m: any) => ({
            ...m,
            playerTeam: matchTeamMap.get(m.id) || "A",
          }))
        );

        // 5. Player stats
        const { data: statsData } = await supabase
          .from("player_stats")
          .select("match_id, runs_scored, balls_faced, fours, sixes, wickets_taken, runs_conceded")
          .in("match_id", matchIds)
          .in("player_id", playerIds);
        setAllStats((statsData || []) as PlayerStatsRow[]);

        // 6. Innings for score display
        const { data: inningsData } = await supabase
          .from("innings")
          .select("match_id, innings_number, team, runs, wickets, overs, balls")
          .in("match_id", matchIds);
        setInnings((inningsData || []) as InningsRow[]);
      }

      // 7. Teams
      const { data: teamPlayerRows } = await supabase
        .from("team_players")
        .select("team_id, role")
        .eq("user_id", userId);
      const teamIds = (teamPlayerRows || []).map((tp: any) => tp.team_id);
      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, name, booking_id")
          .in("id", teamIds);
        setTeams(
          (teamsData || []).map((t: any) => ({
            ...t,
            role: (teamPlayerRows || []).find((tp: any) => tp.team_id === t.id)?.role || "player",
          }))
        );
      }

      setLoading(false);
    };
    load();
  }, [userId]);

  // Aggregate stats
  const totalRuns = allStats.reduce((s, r) => s + r.runs_scored, 0);
  const totalBalls = allStats.reduce((s, r) => s + r.balls_faced, 0);
  const totalFours = allStats.reduce((s, r) => s + r.fours, 0);
  const totalSixes = allStats.reduce((s, r) => s + r.sixes, 0);
  const totalWickets = allStats.reduce((s, r) => s + r.wickets_taken, 0);
  const totalRunsConceded = allStats.reduce((s, r) => s + r.runs_conceded, 0);
  const completedMatches = matches.filter((m) => m.status === "completed");
  const matchesPlayed = completedMatches.length;
  const battingAvg = matchesPlayed > 0 ? (totalRuns / matchesPlayed).toFixed(1) : "0";
  const strikeRate = totalBalls > 0 ? ((totalRuns / totalBalls) * 100).toFixed(1) : "0";
  const bowlingEconomy = totalWickets > 0 ? (totalRunsConceded / totalWickets).toFixed(1) : "-";

  // Wins
  const wins = completedMatches.filter((m) => m.winner === m.playerTeam).length;
  const losses = completedMatches.filter((m) => m.winner && m.winner !== "tie" && m.winner !== m.playerTeam).length;

  const getRoleBadge = (role: string) => {
    const roles: Record<string, { label: string; color: string }> = {
      batsman: { label: "Batsman", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
      batter: { label: "Batter", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
      bowler: { label: "Bowler", color: "bg-red-500/15 text-red-400 border-red-500/25" },
      "all-rounder": { label: "All-Rounder", color: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
      allrounder: { label: "All-Rounder", color: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
      "wicket-keeper": { label: "Wicket Keeper", color: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
    };
    return roles[role?.toLowerCase()] || { label: role || "Player", color: "bg-white/10 text-white/60 border-white/15" };
  };

  const getMatchResult = (m: MatchRecord) => {
    if (m.status !== "completed") return { label: "Upcoming", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    if (m.winner === "tie") return { label: "Tie", color: "text-white/50 bg-white/5 border-white/10" };
    if (m.winner === m.playerTeam) return { label: "Won", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    return { label: "Lost", color: "text-red-400 bg-red-500/10 border-red-500/20" };
  };

  const getMatchScore = (m: MatchRecord) => {
    const matchInnings = innings.filter((i) => i.match_id === m.id);
    const innA = matchInnings.find((i) => i.team === "A");
    const innB = matchInnings.find((i) => i.team === "B");
    return {
      a: innA ? `${innA.runs}/${innA.wickets} (${innA.overs}.${innA.balls})` : "-",
      b: innB ? `${innB.runs}/${innB.wickets} (${innB.overs}.${innB.balls})` : "-",
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex flex-col items-center justify-center">
        <p className="text-white/50 text-lg">Player not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-emerald-400 text-sm hover:underline">Go back</button>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;
  const roleBadge = getRoleBadge(profile.preferred_role);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "matches", label: "Matches", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
    { key: "stats", label: "Stats", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: "teams", label: "Teams", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.03] blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white hidden sm:inline">Player Profile</span>
          </div>
          {isOwnProfile ? (
            <button onClick={() => navigate("/profile")} className="text-sm text-emerald-400 font-medium hover:underline">Edit Profile</button>
          ) : (
            <div />
          )}
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* ===== HEADER CARD ===== */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 mb-8 animate-fade-up">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-emerald-500/30 bg-white/[0.03] flex items-center justify-center">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10 text-white/20" />
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-extrabold tracking-tight text-white">{profile.name || "Unnamed Player"}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                {profile.department && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Hash className="h-3 w-3" /> {profile.department}
                  </span>
                )}
                {profile.reg_no && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {profile.reg_no}
                  </span>
                )}
                {profile.registration_year && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {profile.registration_year}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${roleBadge.color}`}>
                  <Target className="h-3 w-3" /> {roleBadge.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== STATS SUMMARY CARDS ===== */}
        <div className="grid grid-cols-3 gap-4 mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center">
            <Gamepad2 className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-3xl font-black text-white">{matchesPlayed}</p>
            <p className="text-[11px] text-white/40 font-bold uppercase tracking-wider mt-1">Matches</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center">
            <Crosshair className="h-5 w-5 text-blue-400 mx-auto mb-2" />
            <p className="text-3xl font-black text-white">{totalRuns}</p>
            <p className="text-[11px] text-white/40 font-bold uppercase tracking-wider mt-1">Runs</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center">
            <Target className="h-5 w-5 text-red-400 mx-auto mb-2" />
            <p className="text-3xl font-black text-white">{totalWickets}</p>
            <p className="text-[11px] text-white/40 font-bold uppercase tracking-wider mt-1">Wickets</p>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex border-b border-white/[0.08] mb-6 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab.key
                  ? "text-emerald-400 border-emerald-400"
                  : "text-white/40 border-transparent hover:text-white/60"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ===== TAB: MATCHES ===== */}
        {activeTab === "matches" && (
          <div className="space-y-3 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            {matches.length === 0 ? (
              <div className="text-center py-16">
                <Gamepad2 className="h-12 w-12 text-white/10 mx-auto mb-3" />
                <p className="text-white/30">No matches yet</p>
              </div>
            ) : (
              matches.map((m) => {
                const result = getMatchResult(m);
                const score = getMatchScore(m);
                const date = new Date(m.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" });
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/live/${m.id}`)}
                    className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-white/30 font-medium">{m.match_type} · {m.total_overs}ov</span>
                      <span className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${result.color}`}>
                        {result.label}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${m.playerTeam === "A" ? "text-emerald-400" : "text-white/80"}`}>
                          {m.team_a_name}
                        </span>
                        <span className="text-xs text-white/50 font-semibold">{score.a}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${m.playerTeam === "B" ? "text-emerald-400" : "text-white/80"}`}>
                          {m.team_b_name}
                        </span>
                        <span className="text-xs text-white/50 font-semibold">{score.b}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/[0.04]">
                      <span className="text-[10px] text-white/25">{date}</span>
                      {m.status === "completed" && m.winner && m.winner !== "tie" && (
                        <span className="text-[10px] text-white/40 flex items-center gap-1">
                          <Trophy className="h-3 w-3 text-amber-400/70" /> {m.winner === "A" ? m.team_a_name : m.team_b_name} won
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ===== TAB: STATS ===== */}
        {activeTab === "stats" && (
          <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            {matchesPlayed === 0 ? (
              <div className="text-center py-16">
                <TrendingUp className="h-12 w-12 text-white/10 mx-auto mb-3" />
                <p className="text-white/30">No stats yet — play a match!</p>
              </div>
            ) : (
              <>
                {/* Batting */}
                <div className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.03] p-5">
                  <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Crosshair className="h-4 w-4" /> Batting
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Runs", value: totalRuns },
                      { label: "Balls Faced", value: totalBalls },
                      { label: "Average", value: battingAvg },
                      { label: "Strike Rate", value: strikeRate },
                      { label: "Fours", value: totalFours },
                      { label: "Sixes", value: totalSixes },
                      { label: "Wins", value: wins },
                      { label: "Losses", value: losses },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">{s.label}</p>
                        <p className="mt-1.5 text-lg font-bold text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bowling */}
                <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-5">
                  <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Target className="h-4 w-4" /> Bowling
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Wickets", value: totalWickets },
                      { label: "Runs Conceded", value: totalRunsConceded },
                      { label: "Economy", value: bowlingEconomy },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">{s.label}</p>
                        <p className="mt-1.5 text-lg font-bold text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== TAB: TEAMS ===== */}
        {activeTab === "teams" && (
          <div className="space-y-3 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            {teams.length === 0 ? (
              <div className="text-center py-16">
                <Users className="h-12 w-12 text-white/10 mx-auto mb-3" />
                <p className="text-white/30">Not part of any teams yet</p>
              </div>
            ) : (
              teams.map((t) => (
                <div key={t.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t.name}</p>
                      <p className="text-[10px] text-white/30">Booking #{t.booking_id}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${
                    t.role === "captain"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                      : "bg-white/5 text-white/40 border-white/10"
                  }`}>
                    {t.role === "captain" ? "Captain" : "Player"}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
