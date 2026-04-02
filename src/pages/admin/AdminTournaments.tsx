import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Trophy, Plus, Play, ChevronDown, ChevronRight, X, Check, Search, Users,
  Swords, Table2, GitBranch, RefreshCw, Zap, Crown,
} from "lucide-react";
import { toast } from "sonner";

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };
const sportEmojis: Record<number, string> = { 1: "🏏", 2: "⚽", 3: "🏸" };

interface Tournament {
  id: number; name: string; sport_id: number; format: string; status: string;
  created_at: string; winner_team_id: number | null;
}
interface TTeam {
  id: number; tournament_id: number; team_name: string; team_id: number | null;
  points: number; wins: number; losses: number; draws: number;
  matches_played: number; nrr: number;
}
interface TMatch {
  id: number; tournament_id: number; round: number; match_number: number;
  team_a_id: number; team_b_id: number; winner_team_id: number | null;
  status: string; match_id: number | null;
}
interface ExistingTeam {
  id: number; name: string; sport_id: number; owner_user_id: string;
}

type TabKey = "teams" | "matches" | "points";

export default function AdminTournaments() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tTeams, setTTeams] = useState<TTeam[]>([]);
  const [tMatches, setTMatches] = useState<TMatch[]>([]);
  const [existingTeams, setExistingTeams] = useState<ExistingTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, TabKey>>({});

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSport, setNewSport] = useState(1);
  const [newFormat, setNewFormat] = useState<"league" | "knockout">("league");
  const [creating, setCreating] = useState(false);

  // Add team
  const [addTeamForId, setAddTeamForId] = useState<number | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [manualTeamName, setManualTeamName] = useState("");

  // Set winner modal
  const [settingWinner, setSettingWinner] = useState<TMatch | null>(null);

  // Knockout config
  const [knockoutConfig, setKnockoutConfig] = useState<{ tournamentId: number; topN: number } | null>(null);

  const fetchAll = useCallback(async () => {
    const [tRes, ttRes, tmRes, etRes] = await Promise.all([
      supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
      supabase.from("tournament_teams").select("*").order("points", { ascending: false }),
      supabase.from("tournament_matches").select("*").order("round").order("match_number"),
      supabase.from("teams").select("id, name, sport_id, owner_user_id"),
    ]);
    if (tRes.data) setTournaments(tRes.data);
    if (ttRes.data) setTTeams(ttRes.data);
    if (tmRes.data) setTMatches(tmRes.data);
    if (etRes.data) setExistingTeams(etRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Realtime subscriptions ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel("tournament-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_teams" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => fetchAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, (payload) => {
        // When a linked match completes, auto-sync the tournament match result
        syncMatchResult(payload.new as any);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // Auto-sync when a real match result updates
  const syncMatchResult = async (match: { id: number; status: string; winner: string | null }) => {
    if (match.status !== "completed" || !match.winner) return;
    // Find tournament_match linked to this match
    const { data: tMatch } = await supabase
      .from("tournament_matches")
      .select("*")
      .eq("match_id", match.id)
      .eq("status", "scheduled")
      .maybeSingle();
    if (!tMatch) return;
    // Determine winner team id from match.winner (A / B)
    const winnerId = match.winner === "A" ? tMatch.team_a_id : match.winner === "B" ? tMatch.team_b_id : null;
    if (winnerId) {
      await recordResult(tMatch, winnerId);
      toast.success("Tournament match auto-synced from match result!");
    }
  };

  // ─── Tab helper ──────────────────────────────────────────────────
  const getTab = (id: number): TabKey => activeTab[id] || "points";
  const setTab = (id: number, tab: TabKey) => setActiveTab(prev => ({ ...prev, [id]: tab }));

  // ─── CRUD ────────────────────────────────────────────────────────
  const createTournament = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.from("tournaments").insert({
      name: newName.trim(), sport_id: newSport, format: newFormat, created_by: user.id,
    }).select("id").single();
    if (error) toast.error(error.message);
    else {
      toast.success("Tournament created!");
      setShowCreate(false); setNewName("");
      if (data) { setExpandedId(data.id); setAddTeamForId(data.id); setTab(data.id, "teams"); }
    }
    setCreating(false);
    fetchAll();
  };

  const addExistingTeam = async (tournamentId: number, team: ExistingTeam) => {
    if (tTeams.some(t => t.tournament_id === tournamentId && t.team_id === team.id)) {
      toast.error("Team already in tournament"); return;
    }
    const { error } = await supabase.from("tournament_teams").insert({
      tournament_id: tournamentId, team_name: team.name, team_id: team.id,
    });
    if (error) toast.error(error.message);
    else toast.success(`${team.name} added!`);
    fetchAll();
  };

  const addManualTeam = async (tournamentId: number) => {
    if (!manualTeamName.trim()) return;
    if (tTeams.some(t => t.tournament_id === tournamentId && t.team_name.toLowerCase() === manualTeamName.trim().toLowerCase())) {
      toast.error("Team already exists"); return;
    }
    const { error } = await supabase.from("tournament_teams").insert({
      tournament_id: tournamentId, team_name: manualTeamName.trim(),
    });
    if (error) toast.error(error.message);
    else { toast.success(`${manualTeamName.trim()} added!`); setManualTeamName(""); }
    fetchAll();
  };

  const removeTeam = async (teamId: number) => {
    await supabase.from("tournament_teams").delete().eq("id", teamId);
    toast.success("Team removed");
    fetchAll();
  };

  // ─── Generate league round-robin ────────────────────────────────
  const generateLeagueMatches = async (tournament: Tournament) => {
    const teams = tTeams.filter(t => t.tournament_id === tournament.id);
    if (teams.length < 2) { toast.error("Need at least 2 teams"); return; }
    const existing = tMatches.filter(m => m.tournament_id === tournament.id);
    if (existing.length > 0) { toast.error("Matches already generated"); return; }

    const newMatches: any[] = [];
    let matchNum = 1;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        // Create a real match in the matches table
        const { data: realMatch } = await supabase.from("matches").insert({
          team_a_name: teams[i].team_name,
          team_b_name: teams[j].team_name,
          sport_id: tournament.sport_id,
          match_type: "T20",
          total_overs: 20,
          status: "scheduled",
        }).select("id").single();

        newMatches.push({
          tournament_id: tournament.id, round: 1, match_number: matchNum++,
          team_a_id: teams[i].id, team_b_id: teams[j].id,
          winner_team_id: null, status: "scheduled",
          match_id: realMatch?.id || null,
        });
      }
    }

    const { error } = await supabase.from("tournament_matches").insert(newMatches);
    if (error) { toast.error(error.message); return; }

    await supabase.from("tournaments").update({
      status: "active", started_at: new Date().toISOString(),
    }).eq("id", tournament.id);

    toast.success(`Generated ${newMatches.length} league match(es)!`);
    setAddTeamForId(null);
    setTab(tournament.id, "matches");
    fetchAll();
  };

  // ─── Generate knockout from top N teams ─────────────────────────
  const generateKnockout = async (tournamentId: number, topN: number) => {
    const teams = tTeams
      .filter(t => t.tournament_id === tournamentId)
      .sort((a, b) => b.points - a.points || (b.wins - b.losses) - (a.wins - a.losses));

    const qualifiedTeams = teams.slice(0, topN);
    if (qualifiedTeams.length < 2) { toast.error("Not enough teams"); return; }

    // Get current max round
    const existingMatches = tMatches.filter(m => m.tournament_id === tournamentId);
    const maxRound = existingMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const maxMatchNum = existingMatches.reduce((max, m) => Math.max(max, m.match_number), 0);

    const tournament = tournaments.find(t => t.id === tournamentId);
    const knockoutMatches: any[] = [];
    let round = maxRound + 1;
    let matchNum = maxMatchNum + 1;
    let currentRoundTeams = [...qualifiedTeams];

    // Generate all rounds: semi-final, final, etc.
    while (currentRoundTeams.length >= 2) {
      const roundLabel = currentRoundTeams.length === 2 ? "Final"
        : currentRoundTeams.length <= 4 ? "Semi-Final" : `Round ${round}`;

      for (let i = 0; i < currentRoundTeams.length; i += 2) {
        if (i + 1 >= currentRoundTeams.length) break;
        const { data: realMatch } = await supabase.from("matches").insert({
          team_a_name: currentRoundTeams[i].team_name,
          team_b_name: currentRoundTeams[i + 1].team_name,
          sport_id: tournament?.sport_id || 1,
          match_type: "T20",
          total_overs: 20,
          status: "scheduled",
        }).select("id").single();

        knockoutMatches.push({
          tournament_id: tournamentId, round, match_number: matchNum++,
          team_a_id: currentRoundTeams[i].id,
          team_b_id: currentRoundTeams[i + 1].id,
          winner_team_id: null, status: "scheduled",
          match_id: realMatch?.id || null,
        });
      }

      // Next round has half the teams (placeholder — actual advancement happens when results come in)
      currentRoundTeams = currentRoundTeams.slice(0, Math.floor(currentRoundTeams.length / 2));
      round++;
    }

    const { error } = await supabase.from("tournament_matches").insert(knockoutMatches);
    if (error) { toast.error(error.message); return; }

    toast.success(`Generated ${knockoutMatches.length} knockout match(es)!`);
    setKnockoutConfig(null);
    setTab(tournamentId, "matches");
    fetchAll();
  };

  // ─── Record result (shared by manual set + auto-sync) ────────────
  const recordResult = async (match: TMatch, winnerId: number) => {
    const loserId = winnerId === match.team_a_id ? match.team_b_id : match.team_a_id;

    // Update tournament match
    await supabase.from("tournament_matches").update({
      winner_team_id: winnerId, status: "completed",
    }).eq("id", match.id);

    // Update linked real match if exists
    if (match.match_id) {
      const winnerSide = winnerId === match.team_a_id ? "A" : "B";
      await supabase.from("matches").update({
        status: "completed", winner: winnerSide,
      }).eq("id", match.match_id);
    }

    // Update team stats
    const winner = tTeams.find(t => t.id === winnerId);
    const loser = tTeams.find(t => t.id === loserId);
    if (winner) {
      await supabase.from("tournament_teams").update({
        wins: winner.wins + 1, points: winner.points + 2,
        matches_played: winner.matches_played + 1,
      }).eq("id", winnerId);
    }
    if (loser) {
      await supabase.from("tournament_teams").update({
        losses: loser.losses + 1,
        matches_played: loser.matches_played + 1,
      }).eq("id", loserId);
    }

    // Check if all matches are completed → mark tournament done
    await checkTournamentCompletion(match.tournament_id, match.id);
  };

  const recordDraw = async (match: TMatch) => {
    await supabase.from("tournament_matches").update({ status: "completed" }).eq("id", match.id);
    if (match.match_id) {
      await supabase.from("matches").update({ status: "completed", winner: "tie" }).eq("id", match.match_id);
    }
    const teamA = tTeams.find(t => t.id === match.team_a_id);
    const teamB = tTeams.find(t => t.id === match.team_b_id);
    if (teamA) {
      await supabase.from("tournament_teams").update({
        draws: teamA.draws + 1, points: teamA.points + 1, matches_played: teamA.matches_played + 1,
      }).eq("id", teamA.id);
    }
    if (teamB) {
      await supabase.from("tournament_teams").update({
        draws: teamB.draws + 1, points: teamB.points + 1, matches_played: teamB.matches_played + 1,
      }).eq("id", teamB.id);
    }
    await checkTournamentCompletion(match.tournament_id, match.id);
  };

  const checkTournamentCompletion = async (tournamentId: number, excludeMatchId: number) => {
    const allMatches = tMatches.filter(m => m.tournament_id === tournamentId);
    const remaining = allMatches.filter(m => m.id !== excludeMatchId && m.status === "scheduled");
    if (remaining.length === 0) {
      const topTeam = tTeams
        .filter(t => t.tournament_id === tournamentId)
        .sort((a, b) => b.points - a.points)[0];

      await supabase.from("tournaments").update({
        status: "completed", completed_at: new Date().toISOString(),
        winner_team_id: topTeam?.id || null,
      }).eq("id", tournamentId);
      toast.success("🏆 Tournament completed!");
    }
  };

  const setMatchWinner = async (match: TMatch, winnerId: number) => {
    await recordResult(match, winnerId);
    setSettingWinner(null);
    toast.success("Result recorded!");
    fetchAll();
  };

  const setMatchDraw = async (match: TMatch) => {
    await recordDraw(match);
    setSettingWinner(null);
    toast.success("Draw recorded!");
    fetchAll();
  };

  const getTeamName = (id: number) => tTeams.find(t => t.id === id)?.team_name || "TBD";

  const getRoundLabel = (round: number, totalRounds: number, format: string) => {
    if (format === "league" && round === 1) return "League Stage";
    const roundsFromEnd = totalRounds - round;
    if (roundsFromEnd === 0) return "🏆 Final";
    if (roundsFromEnd === 1) return "⚔️ Semi-Final";
    if (roundsFromEnd === 2) return "Quarter-Final";
    return `Round ${round}`;
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Tournaments</h3>
          <p className="text-xs text-white/40 mt-0.5">{tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""} · Real-time sync enabled</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 transition-colors">
          <Plus className="h-4 w-4" /> New Tournament
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 space-y-4 animate-fade-up">
          <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2"><Trophy className="h-4 w-4" /> Create Tournament</h4>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. GCU Premier League 2026" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/40 focus:outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-white/30 uppercase font-bold mb-1 block">Sport</label>
              <select value={newSport} onChange={e => setNewSport(Number(e.target.value))} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white focus:outline-none">
                {Object.entries(sportNames).map(([id, name]) => <option key={id} value={id} className="bg-black">{sportEmojis[Number(id)]} {name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/30 uppercase font-bold mb-1 block">Format</label>
              <select value={newFormat} onChange={e => setNewFormat(e.target.value as any)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white focus:outline-none">
                <option value="league" className="bg-black">League (Round Robin)</option>
                <option value="knockout" className="bg-black">Knockout</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createTournament} disabled={creating || !newName.trim()} className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {creating ? "Creating…" : "Create & Add Teams"}
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/50 hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Tournament List */}
      {tournaments.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Trophy className="h-14 w-14 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No tournaments yet</p>
          <p className="text-xs text-white/20 mt-1">Create your first tournament above</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tournaments.map(t => {
            const isExpanded = expandedId === t.id;
            const teams = tTeams.filter(tt => tt.tournament_id === t.id).sort((a, b) => b.points - a.points || (b.wins - b.losses) - (a.wins - a.losses));
            const matches = tMatches.filter(m => m.tournament_id === t.id);
            const completed = matches.filter(m => m.status === "completed").length;
            const rounds = [...new Set(matches.map(m => m.round))];
            const maxRound = Math.max(0, ...rounds);
            const tab = getTab(t.id);
            const statusColor = t.status === "active" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
              : t.status === "completed" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
              : "text-amber-400 border-amber-500/20 bg-amber-500/10";
            const leagueMatchesExist = matches.some(m => m.round === 1);
            const knockoutMatchesExist = matches.some(m => m.round > 1);
            const addedTeamIds = new Set(tTeams.filter(tt => tt.tournament_id === t.id).map(tt => tt.team_id));
            const availableTeams = existingTeams
              .filter(et => et.sport_id === t.sport_id && !addedTeamIds.has(et.id))
              .filter(et => !teamSearch || et.name.toLowerCase().includes(teamSearch.toLowerCase()));
            const winnerTeam = t.winner_team_id ? tTeams.find(tt => tt.id === t.winner_team_id) : teams[0];

            return (
              <div key={t.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                {/* Tournament Header */}
                <button onClick={() => setExpandedId(isExpanded ? null : t.id)} className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg">{sportEmojis[t.sport_id] || "🏆"}</div>
                    <div>
                      <p className="text-sm font-bold text-white">{t.name}</p>
                      <p className="text-xs text-white/40">
                        {sportNames[t.sport_id]} · {t.format === "league" ? "Round Robin" : "Knockout"} · {teams.length} teams
                        {matches.length > 0 && <> · {completed}/{matches.length} played</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {t.status === "active" && <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                    <span className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusColor}`}>{t.status}</span>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-white/30" /> : <ChevronRight className="h-4 w-4 text-white/30" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] animate-fade-up">
                    {/* Champion Banner */}
                    {t.status === "completed" && winnerTeam && (
                      <div className="bg-gradient-to-r from-amber-500/[0.12] via-amber-500/[0.06] to-transparent p-5 flex items-center gap-4 border-b border-amber-500/10">
                        <div className="h-12 w-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                          <Crown className="h-6 w-6 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-xs text-amber-400/60 uppercase font-bold tracking-wider">Champion</p>
                          <p className="text-lg font-black text-amber-400">{winnerTeam.team_name}</p>
                          <p className="text-xs text-white/30">{winnerTeam.wins}W · {winnerTeam.losses}L · {winnerTeam.points} pts</p>
                        </div>
                      </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="flex border-b border-white/[0.06]">
                      {([
                        { key: "teams" as TabKey, label: "Teams", icon: Users, count: teams.length },
                        { key: "matches" as TabKey, label: "Matches", icon: Swords, count: matches.length },
                        { key: "points" as TabKey, label: "Points Table", icon: Table2 },
                      ]).map(item => (
                        <button key={item.key} onClick={() => setTab(t.id, item.key)}
                          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                            tab === item.key
                              ? "text-emerald-400 border-emerald-400"
                              : "text-white/30 border-transparent hover:text-white/60"
                          }`}
                        >
                          <item.icon className="h-3.5 w-3.5" />
                          {item.label}
                          {item.count !== undefined && <span className="text-[10px] bg-white/[0.06] rounded-full px-1.5 py-0.5">{item.count}</span>}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {/* ═══ TEAMS TAB ═══ */}
                      {tab === "teams" && (
                        <div className="space-y-4">
                          {t.status === "draft" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-white/50">Add Teams to Tournament</h4>
                                <button onClick={() => setAddTeamForId(addTeamForId === t.id ? null : t.id)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">
                                  {addTeamForId === t.id ? "Close" : "+ Add"}
                                </button>
                              </div>
                              {addTeamForId === t.id && (
                                <div className="space-y-3 animate-fade-up">
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                                    <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder={`Search ${sportNames[t.sport_id]} teams…`} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
                                  </div>
                                  {availableTeams.length > 0 && (
                                    <div className="max-h-48 overflow-y-auto rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
                                      {availableTeams.slice(0, 15).map(et => (
                                        <button key={et.id} onClick={() => addExistingTeam(t.id, et)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-emerald-500/[0.08] transition-colors">
                                          <span className="text-sm text-white/80">{et.name}</span>
                                          <Plus className="h-3.5 w-3.5 text-emerald-400/60" />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex gap-2 items-center">
                                    <span className="text-[10px] text-white/20 uppercase font-bold">or</span>
                                    <input value={manualTeamName} onChange={e => setManualTeamName(e.target.value)} placeholder="Enter team name manually" className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" onKeyDown={e => e.key === "Enter" && addManualTeam(t.id)} />
                                    <button onClick={() => addManualTeam(t.id)} disabled={!manualTeamName.trim()} className="rounded-xl bg-white/[0.06] border border-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.1] disabled:opacity-30">Add</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Team Cards */}
                          {teams.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {teams.map((tt, i) => (
                                <div key={tt.id} className={`rounded-xl border bg-white/[0.02] p-4 flex items-center gap-3 ${i === 0 && tt.matches_played > 0 ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/[0.06]"}`}>
                                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black ${i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-slate-500/20 text-slate-300" : i === 2 ? "bg-amber-700/20 text-amber-600" : "bg-white/[0.06] text-white/30"}`}>{i + 1}</div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{tt.team_name}</p>
                                    <p className="text-[10px] text-white/30">{tt.matches_played}P · {tt.wins}W · {tt.losses}L · {tt.draws}D · <span className="text-amber-400 font-bold">{tt.points}pts</span></p>
                                  </div>
                                  {t.status === "draft" && (
                                    <button onClick={() => removeTeam(tt.id)} className="text-white/20 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-white/30 text-center py-6">No teams added yet</p>
                          )}

                          {/* Generate Actions */}
                          {t.status === "draft" && teams.length >= 2 && (
                            <button onClick={() => generateLeagueMatches(t)} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 transition-colors">
                              <Play className="h-4 w-4" /> Generate {t.format === "league" ? "Round Robin" : "Knockout"} ({teams.length * (teams.length - 1) / 2} matches)
                            </button>
                          )}

                          {/* Knockout stage trigger */}
                          {t.status === "active" && t.format === "league" && leagueMatchesExist && !knockoutMatchesExist && matches.every(m => m.status === "completed") && teams.length >= 4 && (
                            <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <GitBranch className="h-4 w-4 text-purple-400" />
                                <h4 className="text-sm font-bold text-purple-400">League Complete — Start Knockout Phase?</h4>
                              </div>
                              <p className="text-xs text-white/40">Select how many top teams advance to the knockout stage.</p>
                              <div className="flex gap-2">
                                {[2, 4].filter(n => n <= teams.length).map(n => (
                                  <button key={n} onClick={() => generateKnockout(t.id, n)} className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-sm font-bold text-purple-400 hover:bg-purple-500/20 transition-colors">
                                    Top {n} → {n === 2 ? "Final" : "Semi-Finals + Final"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ═══ MATCHES TAB ═══ */}
                      {tab === "matches" && (
                        <div className="space-y-6">
                          {matches.length === 0 ? (
                            <p className="text-sm text-white/30 text-center py-8">No matches generated yet. Add teams and generate fixtures from the Teams tab.</p>
                          ) : (
                            rounds.sort((a, b) => a - b).map(round => {
                              const roundMatches = matches.filter(m => m.round === round);
                              const label = getRoundLabel(round, maxRound, t.format);
                              const allCompleted = roundMatches.every(m => m.status === "completed");

                              return (
                                <div key={round}>
                                  <div className="flex items-center gap-2 mb-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</h4>
                                    {allCompleted && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                                    <div className="flex-1 h-px bg-white/[0.06]" />
                                    <span className="text-[10px] text-white/20">{roundMatches.filter(m => m.status === "completed").length}/{roundMatches.length}</span>
                                  </div>
                                  <div className="space-y-2">
                                    {roundMatches.map(m => {
                                      const isCompleted = m.status === "completed";
                                      const statusC = isCompleted ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-400";
                                      return (
                                        <div key={m.id} className={`flex items-center justify-between rounded-xl border bg-white/[0.02] px-4 py-3 transition-all ${isCompleted ? "border-white/[0.04] opacity-80" : "border-white/[0.06]"}`}>
                                          <div className="flex items-center gap-3 text-sm min-w-0">
                                            <span className="text-white/15 text-xs font-mono flex-shrink-0 w-6">M{m.match_number}</span>
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className={`font-semibold truncate ${m.winner_team_id === m.team_a_id ? "text-emerald-400" : isCompleted ? "text-white/40" : "text-white/70"}`}>
                                                {getTeamName(m.team_a_id)}
                                              </span>
                                              {m.winner_team_id === m.team_a_id && <Trophy className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
                                              <span className="text-white/15 flex-shrink-0">vs</span>
                                              {m.winner_team_id === m.team_b_id && <Trophy className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
                                              <span className={`font-semibold truncate ${m.winner_team_id === m.team_b_id ? "text-emerald-400" : isCompleted ? "text-white/40" : "text-white/70"}`}>
                                                {getTeamName(m.team_b_id)}
                                              </span>
                                              {isCompleted && !m.winner_team_id && <span className="text-[10px] text-amber-400/50 ml-1">Draw</span>}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            {m.match_id && <span className="text-[10px] text-white/15 font-mono">#{m.match_id}</span>}
                                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusC}`}>{m.status}</span>
                                            {m.status === "scheduled" && t.status === "active" && (
                                              <button onClick={() => setSettingWinner(m)} className="rounded-lg bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/30 transition-colors">
                                                Set Result
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          )}

                          {/* Knockout after league */}
                          {t.status === "active" && t.format === "league" && leagueMatchesExist && !knockoutMatchesExist && matches.every(m => m.status === "completed") && teams.length >= 4 && (
                            <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-purple-400" />
                                <p className="text-sm font-bold text-purple-400">All league matches complete! Generate knockout rounds?</p>
                              </div>
                              <div className="flex gap-2">
                                {[2, 4].filter(n => n <= teams.length).map(n => (
                                  <button key={n} onClick={() => generateKnockout(t.id, n)} className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-sm font-bold text-purple-400 hover:bg-purple-500/20">
                                    Top {n} → {n === 2 ? "Final" : "Semis + Final"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ═══ POINTS TABLE TAB ═══ */}
                      {tab === "points" && (
                        <div>
                          {teams.length > 0 ? (
                            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                              <div className="grid grid-cols-9 border-b border-white/[0.06] px-4 py-2.5 text-[10px] font-bold uppercase text-white/30">
                                <span>#</span><span className="col-span-2">Team</span><span>P</span><span>W</span><span>L</span><span>D</span><span>Pts</span><span>Win%</span>
                              </div>
                              {teams.map((tt, i) => {
                                const winPct = tt.matches_played > 0 ? Math.round((tt.wins / tt.matches_played) * 100) : 0;
                                return (
                                  <div key={tt.id} className={`grid grid-cols-9 items-center px-4 py-3 text-sm border-b border-white/[0.03] last:border-0 transition-colors ${i === 0 && tt.matches_played > 0 ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.02]"}`}>
                                    <span className={`font-bold ${i === 0 && tt.matches_played > 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>
                                      {i === 0 && tt.matches_played > 0 ? "🥇" : i === 1 && tt.matches_played > 0 ? "🥈" : i === 2 && tt.matches_played > 0 ? "🥉" : i + 1}
                                    </span>
                                    <span className="col-span-2 font-semibold text-white/80 truncate">{tt.team_name}</span>
                                    <span className="text-white/50">{tt.matches_played}</span>
                                    <span className="text-emerald-400 font-bold">{tt.wins}</span>
                                    <span className="text-red-400">{tt.losses}</span>
                                    <span className="text-white/50">{tt.draws}</span>
                                    <span className="text-amber-400 font-black text-base">{tt.points}</span>
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1.5 w-12 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${winPct}%` }} />
                                      </div>
                                      <span className="text-[10px] text-white/30">{winPct}%</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-white/30 text-center py-8">No teams yet</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Set Result Modal */}
      {settingWinner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSettingWinner(null)}>
          <div className="w-[90%] max-w-sm rounded-2xl border border-white/[0.1] bg-black/95 p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-1">Match Result</h3>
            <p className="text-xs text-white/40 mb-4">
              M{settingWinner.match_number}: {getTeamName(settingWinner.team_a_id)} vs {getTeamName(settingWinner.team_b_id)}
            </p>
            <div className="space-y-2">
              <button onClick={() => setMatchWinner(settingWinner, settingWinner.team_a_id)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:text-emerald-400 transition-all">
                <Check className="h-4 w-4 inline mr-2" />{getTeamName(settingWinner.team_a_id)} wins
              </button>
              <button onClick={() => setMatchWinner(settingWinner, settingWinner.team_b_id)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:text-emerald-400 transition-all">
                <Check className="h-4 w-4 inline mr-2" />{getTeamName(settingWinner.team_b_id)} wins
              </button>
              <button onClick={() => setMatchDraw(settingWinner)} className="w-full rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm font-semibold text-amber-400/80 hover:bg-amber-500/[0.15] hover:text-amber-400 transition-all">
                Draw (1 pt each)
              </button>
            </div>
            <button onClick={() => setSettingWinner(null)} className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/50 hover:text-white transition-colors">
              <X className="h-4 w-4 inline mr-1" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
