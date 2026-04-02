import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Gamepad2, X, Edit3, Ban, Trophy, Clock } from "lucide-react";
import { toast } from "sonner";

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };

interface MatchRow {
  id: number; team_a_name: string; team_b_name: string; sport_id: number; match_type: string;
  total_overs: number; status: string; winner: string | null; created_at: string; booking_id: number | null;
}

export default function AdminMatches() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMatch, setEditMatch] = useState<MatchRow | null>(null);
  const [editTeamA, setEditTeamA] = useState("");
  const [editTeamB, setEditTeamB] = useState("");
  const [editOvers, setEditOvers] = useState(20);
  const [overrideMatch, setOverrideMatch] = useState<MatchRow | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("matches").select("id, team_a_name, team_b_name, sport_id, match_type, total_overs, status, winner, created_at, booking_id").order("created_at", { ascending: false }).limit(200);
    setMatches((data || []) as MatchRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  // Realtime subscription instead of polling
  useEffect(() => {
    const channel = supabase.channel("admin-matches-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchMatches())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMatches]);

  const openEdit = (m: MatchRow) => {
    setEditMatch(m); setEditTeamA(m.team_a_name); setEditTeamB(m.team_b_name); setEditOvers(m.total_overs);
  };

  const saveEdit = async () => {
    if (!editMatch) return;
    const { error } = await supabase.from("matches").update({ team_a_name: editTeamA, team_b_name: editTeamB, total_overs: editOvers }).eq("id", editMatch.id);
    if (error) toast.error(error.message);
    else { toast.success("Match updated"); setEditMatch(null); fetchMatches(); }
  };

  const cancelMatch = async (id: number) => {
    const { error } = await supabase.from("matches").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Match cancelled"); fetchMatches(); }
  };

  const overrideResult = async (matchId: number, winner: string) => {
    const { error } = await supabase.from("matches").update({ status: "completed", winner }).eq("id", matchId);
    if (error) toast.error(error.message);
    else { toast.success("Result overridden"); setOverrideMatch(null); fetchMatches(); }
  };

  // Helper to display the correct winner name
  const getWinnerDisplay = (m: MatchRow) => {
    if (!m.winner || m.winner === "tie") return null;
    if (m.winner === "A") return m.team_a_name;
    if (m.winner === "B") return m.team_b_name;
    return m.winner; // fallback for any stored name
  };

  const statusColor = (s: string) =>
    s === "completed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    : s === "ongoing" ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
    : s === "cancelled" ? "border-red-500/20 bg-red-500/10 text-red-400"
    : "border-amber-500/20 bg-amber-500/10 text-amber-400";

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 animate-fade-up">
      <p className="text-xs text-white/30">{matches.length} match{matches.length !== 1 ? "es" : ""} · Real-time sync</p>

      <div className="space-y-2">
        {matches.map(m => {
          const winnerName = getWinnerDisplay(m);
          return (
            <div key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4 hover:bg-white/[0.04] transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-white/30 font-mono text-xs">#{m.id}</span>
                  <span className="font-bold text-white">{m.team_a_name}</span>
                  <span className="text-white/20">vs</span>
                  <span className="font-bold text-white">{m.team_b_name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-white/40">{sportNames[m.sport_id] || "Unknown"}</span>
                  <span className="text-xs text-white/20">·</span>
                  <span className="text-xs text-white/40">{m.match_type} · {m.total_overs}ov</span>
                  <span className="text-xs text-white/20">·</span>
                  <span className="text-xs text-white/40">{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                {winnerName && (
                  <p className="text-xs text-emerald-400/80 mt-1 flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> {winnerName} won
                  </p>
                )}
                {m.winner === "tie" && <p className="text-xs text-amber-400/80 mt-1">Match tied</p>}
              </div>

              <span className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase flex-shrink-0 ${statusColor(m.status)}`}>{m.status}</span>

              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => openEdit(m)} className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/40 hover:text-white hover:bg-white/[0.08] transition-all" title="Edit">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                {m.status !== "cancelled" && m.status !== "completed" && (
                  <button onClick={() => cancelMatch(m.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/20 transition-all" title="Cancel">
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                )}
                {m.status !== "cancelled" && (
                  <button onClick={() => setOverrideMatch(m)} className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-2 text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/20 transition-all" title="Override Result">
                    <Trophy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editMatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[90%] max-w-md rounded-2xl border border-white/[0.1] bg-black p-6 animate-fade-up space-y-4">
            <h3 className="text-sm font-bold text-white">Edit Match #{editMatch.id}</h3>
            <input value={editTeamA} onChange={e => setEditTeamA(e.target.value)} placeholder="Team A Name" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white focus:outline-none" />
            <input value={editTeamB} onChange={e => setEditTeamB(e.target.value)} placeholder="Team B Name" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white focus:outline-none" />
            <input type="number" value={editOvers} onChange={e => setEditOvers(Number(e.target.value))} placeholder="Total Overs" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600">Save</button>
              <button onClick={() => setEditMatch(null)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/50 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideMatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[90%] max-w-sm rounded-2xl border border-white/[0.1] bg-black p-6 animate-fade-up space-y-3">
            <h3 className="text-sm font-bold text-white">Override Result — Match #{overrideMatch.id}</h3>
            <p className="text-xs text-white/40">{overrideMatch.team_a_name} vs {overrideMatch.team_b_name}</p>
            <button onClick={() => overrideResult(overrideMatch.id, "A")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:text-emerald-400 transition-all">
              {overrideMatch.team_a_name} wins
            </button>
            <button onClick={() => overrideResult(overrideMatch.id, "B")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:text-emerald-400 transition-all">
              {overrideMatch.team_b_name} wins
            </button>
            <button onClick={() => overrideResult(overrideMatch.id, "tie")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-amber-400/70 hover:bg-amber-500/20 hover:border-amber-500/30 hover:text-amber-400 transition-all">
              Tie
            </button>
            <button onClick={() => setOverrideMatch(null)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/50 hover:text-white">
              <X className="h-4 w-4 inline mr-1" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
