import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Medal, Trophy, Target } from "lucide-react";

const sportNames: Record<number, string> = { 1: "Cricket", 2: "Futsal", 3: "Badminton" };

interface PlayerLeaderboard {
  player_id: number; name: string; runs: number; wickets: number; matches: number;
  fours: number; sixes: number; balls_faced: number; runs_conceded: number;
  department: string | null;
}

interface TeamLeaderboard {
  team_name: string; wins: number; matches: number; winPct: number;
}

export default function AdminLeaderboard() {
  const [players, setPlayers] = useState<PlayerLeaderboard[]>([]);
  const [teamBoard, setTeamBoard] = useState<TeamLeaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"runs" | "wickets" | "teams">("runs");
  const [filterDept, setFilterDept] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Player stats
    const { data: stats } = await supabase.from("player_stats")
      .select("player_id, runs_scored, balls_faced, fours, sixes, wickets_taken, runs_conceded, match_id");

    // Aggregate by player
    const playerMap = new Map<number, PlayerLeaderboard>();
    (stats || []).forEach((s: any) => {
      const existing = playerMap.get(s.player_id) || {
        player_id: s.player_id, name: "", runs: 0, wickets: 0, matches: 0,
        fours: 0, sixes: 0, balls_faced: 0, runs_conceded: 0, department: null,
      };
      existing.runs += s.runs_scored || 0;
      existing.wickets += s.wickets_taken || 0;
      existing.fours += s.fours || 0;
      existing.sixes += s.sixes || 0;
      existing.balls_faced += s.balls_faced || 0;
      existing.runs_conceded += s.runs_conceded || 0;
      existing.matches += 1;
      playerMap.set(s.player_id, existing);
    });

    // Get player names and departments
    const playerIds = [...playerMap.keys()];
    if (playerIds.length > 0) {
      const { data: playerRows } = await supabase.from("players").select("id, name, user_id").in("id", playerIds);
      const userIds = (playerRows || []).map((p: any) => p.user_id).filter(Boolean);
      let deptMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("users").select("id, department").in("id", userIds);
        deptMap = new Map((users || []).map((u: any) => [u.id, u.department || ""]));
      }
      (playerRows || []).forEach((p: any) => {
        const entry = playerMap.get(p.id);
        if (entry) { entry.name = p.name || "Unknown"; entry.department = deptMap.get(p.user_id) || null; }
      });
    }

    const allPlayers = [...playerMap.values()];
    const depts = [...new Set(allPlayers.map(p => p.department).filter(Boolean))] as string[];
    setDepartments(depts);
    setPlayers(allPlayers);

    // Team leaderboard from matches
    const { data: completedMatches } = await supabase.from("matches").select("team_a_name, team_b_name, winner").eq("status", "completed");
    const teamMap = new Map<string, { wins: number; matches: number }>();
    (completedMatches || []).forEach((m: any) => {
      [m.team_a_name, m.team_b_name].forEach(name => {
        const entry = teamMap.get(name) || { wins: 0, matches: 0 };
        entry.matches += 1;
        if ((m.winner === "A" && name === m.team_a_name) || (m.winner === "B" && name === m.team_b_name)) {
          entry.wins += 1;
        }
        teamMap.set(name, entry);
      });
    });

    setTeamBoard([...teamMap.entries()].map(([team_name, data]) => ({
      team_name, ...data, winPct: data.matches > 0 ? Math.round((data.wins / data.matches) * 100) : 0,
    })).sort((a, b) => b.wins - a.wins));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredPlayers = filterDept ? players.filter(p => p.department === filterDept) : players;
  const topBatsmen = [...filteredPlayers].sort((a, b) => b.runs - a.runs).slice(0, 15);
  const topBowlers = [...filteredPlayers].sort((a, b) => b.wickets - a.wickets).slice(0, 15);

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Tabs + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {(["runs", "wickets", "teams"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${tab === t ? "bg-emerald-500/15 border border-emerald-500/20 text-emerald-400" : "text-white/50 hover:bg-white/[0.05] hover:text-white border border-transparent"}`}>
            {t === "runs" ? "🏏 Top Batsmen" : t === "wickets" ? "🎳 Top Bowlers" : "👥 Top Teams"}
          </button>
        ))}
        {tab !== "teams" && (
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="ml-auto rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/70 focus:outline-none">
            <option value="" className="bg-black">All Depts</option>
            {departments.map(d => <option key={d} value={d} className="bg-black">{d}</option>)}
          </select>
        )}
      </div>

      {/* Batsmen Table */}
      {tab === "runs" && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className="grid grid-cols-8 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-bold uppercase text-white/30">
            <span>#</span><span className="col-span-2">Player</span><span>M</span><span>Runs</span><span>4s</span><span>6s</span><span>SR</span>
          </div>
          {topBatsmen.map((p, i) => {
            const sr = p.balls_faced > 0 ? ((p.runs / p.balls_faced) * 100).toFixed(1) : "0.0";
            return (
              <div key={p.player_id} className={`grid grid-cols-8 items-center px-5 py-3 border-b border-white/[0.03] last:border-0 ${i < 3 ? "bg-emerald-500/[0.04]" : ""}`}>
                <span className={`text-sm font-bold ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>{i + 1}</span>
                <div className="col-span-2"><p className="text-sm font-semibold text-white truncate">{p.name}</p>{p.department && <p className="text-[10px] text-white/30">{p.department}</p>}</div>
                <span className="text-sm text-white/50">{p.matches}</span>
                <span className="text-sm font-extrabold text-emerald-400">{p.runs}</span>
                <span className="text-sm text-blue-400">{p.fours}</span>
                <span className="text-sm text-purple-400">{p.sixes}</span>
                <span className="text-sm text-white/50">{sr}</span>
              </div>
            );
          })}
          {topBatsmen.length === 0 && <p className="text-center py-8 text-white/30 text-sm">No data</p>}
        </div>
      )}

      {/* Bowlers Table */}
      {tab === "wickets" && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className="grid grid-cols-6 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-bold uppercase text-white/30">
            <span>#</span><span className="col-span-2">Player</span><span>M</span><span>Wkts</span><span>Econ</span>
          </div>
          {topBowlers.map((p, i) => {
            const econ = p.runs_conceded > 0 && p.balls_faced > 0 ? (p.runs_conceded / (p.balls_faced / 6)).toFixed(2) : "0.00";
            return (
              <div key={p.player_id} className={`grid grid-cols-6 items-center px-5 py-3 border-b border-white/[0.03] last:border-0 ${i < 3 ? "bg-red-500/[0.04]" : ""}`}>
                <span className={`text-sm font-bold ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>{i + 1}</span>
                <div className="col-span-2"><p className="text-sm font-semibold text-white truncate">{p.name}</p>{p.department && <p className="text-[10px] text-white/30">{p.department}</p>}</div>
                <span className="text-sm text-white/50">{p.matches}</span>
                <span className="text-sm font-extrabold text-red-400">{p.wickets}</span>
                <span className="text-sm text-white/50">{econ}</span>
              </div>
            );
          })}
          {topBowlers.length === 0 && <p className="text-center py-8 text-white/30 text-sm">No data</p>}
        </div>
      )}

      {/* Teams Table */}
      {tab === "teams" && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
          <div className="grid grid-cols-5 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-bold uppercase text-white/30">
            <span>#</span><span className="col-span-2">Team</span><span>W/M</span><span>Win %</span>
          </div>
          {teamBoard.slice(0, 15).map((t, i) => (
            <div key={t.team_name} className={`grid grid-cols-5 items-center px-5 py-3 border-b border-white/[0.03] last:border-0 ${i < 3 ? "bg-blue-500/[0.04]" : ""}`}>
              <span className={`text-sm font-bold ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>{i + 1}</span>
              <span className="col-span-2 text-sm font-semibold text-white truncate">{t.team_name}</span>
              <span className="text-sm text-white/60">{t.wins}/{t.matches}</span>
              <span className="text-sm font-bold text-blue-400">{t.winPct}%</span>
            </div>
          ))}
          {teamBoard.length === 0 && <p className="text-center py-8 text-white/30 text-sm">No match data</p>}
        </div>
      )}
    </div>
  );
}
