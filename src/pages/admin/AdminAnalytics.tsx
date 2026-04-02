import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, TrendingUp, Trophy, Users, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };
const CHART_COLORS = ["#10b981", "#a78bfa", "#f59e0b", "#38bdf8", "#f472b6"];

function formatTime(time: string) {
  const [h] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12} ${ampm}`;
}

interface DailyData { date: string; count: number }
interface HourData { hour: string; count: number }
interface SportData { name: string; value: number }
interface ActiveUser { name: string; email: string; count: number }

export default function AdminAnalytics() {
  const [dailyTrends, setDailyTrends] = useState<DailyData[]>([]);
  const [hourData, setHourData] = useState<HourData[]>([]);
  const [sportDist, setSportDist] = useState<SportData[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [totalBookings, setTotalBookings] = useState(0);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [avgPerUser, setAvgPerUser] = useState("0");
  const [peakTime, setPeakTime] = useState("—");
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, user_id, sport_id, date, start_time");

    const rows = bookings || [];
    setTotalBookings(rows.length);

    const uniqueUsers = new Set(rows.map((b: any) => b.user_id));
    setActiveUserCount(uniqueUsers.size);
    setAvgPerUser(uniqueUsers.size > 0 ? (rows.length / uniqueUsers.size).toFixed(1) : "0");

    // Daily trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyMap = new Map<string, number>();
    for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
      dailyMap.set(d.toISOString().split("T")[0], 0);
    }
    rows.forEach((b: any) => {
      if (dailyMap.has(b.date)) dailyMap.set(b.date, (dailyMap.get(b.date) || 0) + 1);
    });
    setDailyTrends([...dailyMap.entries()].map(([date, count]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count,
    })));

    // Peak times
    const hourCounts = new Map<number, number>();
    rows.forEach((b: any) => {
      const hour = parseInt(b.start_time?.slice(0, 2) || "0");
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    const hourArr: HourData[] = [];
    for (let h = 6; h <= 22; h++) {
      hourArr.push({ hour: formatTime(`${String(h).padStart(2, "0")}:00`), count: hourCounts.get(h) || 0 });
    }
    setHourData(hourArr);
    const peakEntry = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    setPeakTime(peakEntry ? formatTime(`${String(peakEntry[0]).padStart(2, "0")}:00`) : "—");

    // Sport distribution
    const sportCounts: Record<number, number> = {};
    rows.forEach((b: any) => { sportCounts[b.sport_id] = (sportCounts[b.sport_id] || 0) + 1; });
    setSportDist(Object.entries(sportCounts).map(([id, count]) => ({
      name: sportNames[Number(id)] || `Sport ${id}`, value: count,
    })));

    // Most active users
    const userCounts = new Map<string, number>();
    rows.forEach((b: any) => { userCounts.set(b.user_id, (userCounts.get(b.user_id) || 0) + 1); });
    const topUserIds = [...userCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topUserIds.length > 0) {
      const { data: profiles } = await supabase.from("users").select("id, name, email").in("id", topUserIds.map(u => u[0]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      setActiveUsers(topUserIds.map(([id, count]) => {
        const p = profileMap.get(id);
        return { name: p?.name || "Unknown", email: p?.email || "", count };
      }));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("admin-analytics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchAnalytics())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAnalytics]);

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Bookings", value: totalBookings, icon: BarChart3, color: "text-emerald-400" },
          { label: "Unique Players", value: activeUserCount, icon: Users, color: "text-blue-400" },
          { label: "Avg / User", value: avgPerUser, icon: TrendingUp, color: "text-purple-400" },
          { label: "Peak Time", value: peakTime, icon: Clock, color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 flex items-center gap-3">
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <div><p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p><p className="text-[10px] text-white/40">{s.label}</p></div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Trends */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" /> Daily Booking Trends (30d)
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrends}>
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                <Line type="monotone" dataKey="count" stroke="#34d399" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Peak Hours */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" /> Peak Usage Times
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData}>
                <XAxis dataKey="hour" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sport Distribution */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-400" /> Sport Distribution
          </h3>
          <div className="h-52 flex items-center justify-center">
            {sportDist.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sportDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {sportDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-white/30">No data</p>}
          </div>
        </div>

        {/* Most Active Users */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" /> Most Active Users
          </h3>
          <div className="space-y-2">
            {activeUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/30"}`}>{i + 1}</span>
                  <div><p className="text-sm font-semibold text-white/80 truncate">{u.name}</p><p className="text-[10px] text-white/30 truncate">{u.email}</p></div>
                </div>
                <span className="text-sm font-extrabold text-blue-400">{u.count}</span>
              </div>
            ))}
            {activeUsers.length === 0 && <p className="text-center py-4 text-white/30 text-sm">No data</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
