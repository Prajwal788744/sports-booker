import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Radio, Users, Activity, Eye } from "lucide-react";

interface LiveMatch {
  id: number; team_a_name: string; team_b_name: string; sport_id: number;
  match_type: string; current_innings: number; batting_team: string;
  inn1_runs: number; inn1_wickets: number; inn1_overs: number; inn1_balls: number;
  inn2_runs: number; inn2_wickets: number; inn2_overs: number; inn2_balls: number;
}

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };

export default function AdminLiveMonitor() {
  const navigate = useNavigate();
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [todayBookingCount, setTodayBookingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLive = useCallback(async () => {
    // Ongoing matches
    const { data: matches } = await supabase.from("matches")
      .select("id, team_a_name, team_b_name, sport_id, match_type, current_innings, batting_team")
      .eq("status", "ongoing");

    const liveRows: LiveMatch[] = [];
    for (const m of (matches || [])) {
      const { data: innings } = await supabase.from("innings").select("innings_number, runs, wickets, overs, balls").eq("match_id", m.id).order("innings_number");
      const inn1 = (innings || []).find((i: any) => i.innings_number === 1);
      const inn2 = (innings || []).find((i: any) => i.innings_number === 2);
      liveRows.push({
        ...m,
        inn1_runs: inn1?.runs || 0, inn1_wickets: inn1?.wickets || 0, inn1_overs: inn1?.overs || 0, inn1_balls: inn1?.balls || 0,
        inn2_runs: inn2?.runs || 0, inn2_wickets: inn2?.wickets || 0, inn2_overs: inn2?.overs || 0, inn2_balls: inn2?.balls || 0,
      });
    }
    setLiveMatches(liveRows);

    // Active users (users with bookings today)
    const today = new Date().toISOString().split("T")[0];
    const { data: todayBookings } = await supabase.from("bookings").select("user_id").eq("date", today);
    const uniqueActive = new Set((todayBookings || []).map((b: any) => b.user_id));
    setActiveUserCount(uniqueActive.size);
    setTodayBookingCount((todayBookings || []).length);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  // Realtime subscription instead of polling
  useEffect(() => {
    const channel = supabase.channel("admin-live-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchLive())
      .on("postgres_changes", { event: "*", schema: "public", table: "innings" }, () => fetchLive())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchLive())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLive]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-rose-500/20 flex items-center justify-center">
            <Radio className="h-6 w-6 text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-rose-400">{liveMatches.length}</p>
            <p className="text-xs text-white/40">Live Matches</p>
          </div>
          <div className="ml-auto">
            <div className="h-3 w-3 rounded-full bg-rose-400 animate-pulse" />
          </div>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-blue-400">{activeUserCount}</p>
            <p className="text-xs text-white/40">Active Users Today</p>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Activity className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-emerald-400">{todayBookingCount}</p>
            <p className="text-xs text-white/40">Today's Bookings</p>
          </div>
        </div>
      </div>

      {/* Live Matches */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-rose-400" /> Ongoing Matches
          <span className="text-[10px] text-emerald-400/60 font-normal ml-2 flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Real-time
          </span>
        </h3>

        {liveMatches.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
            <Radio className="h-10 w-10 mx-auto mb-3 text-white/10" />
            <p className="text-white/30 text-sm">No matches currently live</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {liveMatches.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/live/${m.id}`)}
                className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 hover:-translate-y-0.5 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40">{sportNames[m.sport_id]} · {m.match_type}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
                      <span className="text-[10px] font-bold text-rose-400 uppercase">Live · Inn {m.current_innings}</span>
                    </div>
                    <Eye className="h-3.5 w-3.5 text-white/20 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${m.batting_team === "A" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/[0.03]"}`}>
                    <span className="text-sm font-bold text-white">{m.team_a_name}</span>
                    <span className="text-sm font-extrabold text-emerald-400">{m.inn1_runs}/{m.inn1_wickets} <span className="text-xs text-white/30">({m.inn1_overs}.{m.inn1_balls})</span></span>
                  </div>
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${m.batting_team === "B" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/[0.03]"}`}>
                    <span className="text-sm font-bold text-white">{m.team_b_name}</span>
                    <span className="text-sm font-extrabold text-emerald-400">{m.inn2_runs}/{m.inn2_wickets} <span className="text-xs text-white/30">({m.inn2_overs}.{m.inn2_balls})</span></span>
                  </div>
                </div>

                <p className="text-[10px] text-white/20 mt-3 text-center group-hover:text-emerald-400/50 transition-colors">Click to watch live →</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
