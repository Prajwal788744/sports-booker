import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import {
  CalendarDays, Users, Trophy, TrendingUp, Gamepad2, Clock, Zap, Radio,
  UserPlus,
} from "lucide-react";

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface StatsData {
  totalBookings: number;
  activeUsers: number;
  mostPopularSport: string;
  peakTime: string;
  todayBookings: number;
  ongoingMatches: number;
  newUsersWeek: number;
  bookingsPerSport: { name: string; count: number }[];
}

interface Props {
  onNavigate: (section: string) => void;
}

export default function AdminDashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState<StatsData>({
    totalBookings: 0, activeUsers: 0, mostPopularSport: "—", peakTime: "—",
    todayBookings: 0, ongoingMatches: 0, newUsersWeek: 0, bookingsPerSport: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);

    const [
      { count: totalBookings },
      { data: activeData },
      { data: sportBookings },
      { data: timeData },
      { count: todayBookings },
      { count: ongoingMatches },
      { count: newUsersWeek },
    ] = await Promise.all([
      supabase.from("bookings").select("*", { count: "exact", head: true }),
      supabase.from("bookings").select("user_id"),
      supabase.from("bookings").select("sport_id"),
      supabase.from("bookings").select("start_time"),
      supabase.from("bookings").select("*", { count: "exact", head: true })
        .eq("date", new Date().toISOString().split("T")[0]),
      supabase.from("matches").select("*", { count: "exact", head: true })
        .eq("status", "ongoing"),
      supabase.from("users").select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    const uniqueUsers = new Set((activeData || []).map((b: any) => b.user_id));

    const sportCounts: Record<number, number> = {};
    (sportBookings || []).forEach((b: any) => {
      sportCounts[b.sport_id] = (sportCounts[b.sport_id] || 0) + 1;
    });
    const bookingsPerSport = Object.entries(sportCounts)
      .map(([id, count]) => ({ name: sportNames[Number(id)] || `Sport ${id}`, count }))
      .sort((a, b) => b.count - a.count);

    const timeCounts: Record<string, number> = {};
    (timeData || []).forEach((b: any) => {
      const hour = b.start_time?.slice(0, 5) || "00:00";
      timeCounts[hour] = (timeCounts[hour] || 0) + 1;
    });
    const peakEntry = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0];

    setStats({
      totalBookings: totalBookings || 0,
      activeUsers: uniqueUsers.size,
      mostPopularSport: bookingsPerSport[0]?.name || "—",
      peakTime: peakEntry ? formatTime(peakEntry[0]) : "—",
      todayBookings: todayBookings || 0,
      ongoingMatches: ongoingMatches || 0,
      newUsersWeek: newUsersWeek || 0,
      bookingsPerSport,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => fetchStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchStats())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStats]);

  const statCards = [
    { label: "Total Bookings", value: stats.totalBookings, icon: CalendarDays, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "Active Users", value: stats.activeUsers, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "Most Popular Sport", value: stats.mostPopularSport, icon: Trophy, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { label: "Peak Time", value: stats.peakTime, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
    { label: "Today's Bookings", value: stats.todayBookings, icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    { label: "Ongoing Matches", value: stats.ongoingMatches, icon: Radio, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
    { label: "New Users (7d)", value: stats.newUsersWeek, icon: UserPlus, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  ];

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Stat Cards */}
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card, i) => (
          <li key={card.label} className="list-none min-h-[9rem] animate-fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${card.bg} mb-4`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                {loading ? (
                  <div className="h-8 w-20 rounded-lg bg-white/[0.06] animate-pulse" />
                ) : (
                  <div className={`text-2xl font-extrabold tracking-tight ${card.color}`}>{card.value}</div>
                )}
                <div className="text-xs text-white/40 mt-1 font-medium">{card.label}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => onNavigate("Tournaments")}
          className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-left transition-all hover:bg-emerald-500/[0.12] hover:-translate-y-0.5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <div><p className="text-sm font-bold text-emerald-400">Create Tournament</p><p className="text-xs text-white/40">Set up a new league or knockout</p></div>
        </button>
        <button
          onClick={() => onNavigate("Live Monitor")}
          className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-5 text-left transition-all hover:bg-rose-500/[0.12] hover:-translate-y-0.5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20">
            <Radio className="h-5 w-5 text-rose-400" />
          </div>
          <div><p className="text-sm font-bold text-rose-400">Live Monitor</p><p className="text-xs text-white/40">View ongoing matches & active users</p></div>
        </button>
      </div>

      {/* Sport Breakdown */}
      {stats.bookingsPerSport.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-emerald-400" /> Bookings by Sport
          </h3>
          <div className="space-y-3">
            {stats.bookingsPerSport.map((sport) => {
              const pct = stats.totalBookings > 0 ? Math.round((sport.count / stats.totalBookings) * 100) : 0;
              return (
                <div key={sport.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white/70">{sport.name}</span>
                    <span className="text-sm font-bold text-emerald-400">{sport.count} <span className="text-white/30 text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
