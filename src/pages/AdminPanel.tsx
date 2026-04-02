import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, CalendarDays, Trophy, BarChart3, LogOut,
  Menu, X, Users, Gamepad2, Clock, ArrowRight, Radio, Medal,
} from "lucide-react";

// Section components
import AdminDashboard from "./admin/AdminDashboard";
import AdminUsers from "./admin/AdminUsers";
import AdminMatches from "./admin/AdminMatches";
import AdminLiveMonitor from "./admin/AdminLiveMonitor";
import AdminAnalytics from "./admin/AdminAnalytics";

const sidebarItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Tournaments", icon: Trophy },
  { label: "Users", icon: Users },
  { label: "Matches", icon: Gamepad2 },
  { label: "Live Monitor", icon: Radio },
  { label: "Leaderboard", icon: Medal },
  { label: "Analytics", icon: BarChart3 },
  { label: "All Bookings", icon: CalendarDays },
];

interface BookingRow {
  id: number; user_id: string; sport_id: number; date: string;
  start_time: string; end_time: string; status: string; user_name?: string;
}

const sportNames: Record<number, string> = { 1: "Cricket Turf", 2: "Futsal", 3: "Badminton" };
const sportIcons: Record<number, string> = { 1: "🏏", 2: "⚽", 3: "🏸" };

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Coming Soon placeholder
function ComingSoon({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 animate-fade-up">
      <div className="h-20 w-20 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-white/15" />
      </div>
      <h3 className="text-xl font-bold text-white/60 mb-2">{title}</h3>
      <p className="text-sm text-white/25">Coming Soon</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2">
        <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs font-semibold text-amber-400">Under Development</span>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [active, setActive] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // All Bookings data
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingSportFilter, setBookingSportFilter] = useState<number | 0>(0);

  const fetchAllBookings = useCallback(async () => {
    setLoadingBookings(true);
    const { data } = await supabase
      .from("bookings")
      .select("id, user_id, sport_id, date, start_time, end_time, status")
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(200);
    const rows = (data || []) as BookingRow[];
    const userIds = Array.from(new Set(rows.map(b => b.user_id)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("users").select("id, name").in("id", userIds);
      const nameMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.name]));
      rows.forEach(b => { b.user_name = nameMap[b.user_id] || "Unknown"; });
    }
    setAllBookings(rows);
    setLoadingBookings(false);
  }, []);

  useEffect(() => { if (active === "All Bookings") fetchAllBookings(); }, [active, fetchAllBookings]);

  const handleNavigate = (section: string) => { setActive(section); setSidebarOpen(false); };

  const filteredBookings = bookingSportFilter === 0
    ? allBookings
    : allBookings.filter(b => b.sport_id === bookingSportFilter);

  // Group bookings by sport for section view
  const bookingsBySport = allBookings.reduce<Record<number, BookingRow[]>>((acc, b) => {
    if (!acc[b.sport_id]) acc[b.sport_id] = [];
    acc[b.sport_id].push(b);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-black text-white">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.06] bg-black backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between px-6 border-b border-white/[0.06]">
          <span className="font-extrabold text-lg flex items-center gap-2.5 tracking-tight">
            <img src="/gcu-logo.png" alt="GCU" className="h-8 w-8 rounded-lg object-cover" />
            Admin Panel
          </span>
          <button className="lg:hidden text-white/40 hover:text-white transition-colors" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {sidebarItems.map(item => (
            <button
              key={item.label}
              onClick={() => handleNavigate(item.label)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                active === item.label
                  ? "bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 shadow-sm"
                  : "text-white/50 hover:bg-white/[0.05] hover:text-white border border-transparent"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
              {item.label === "Live Monitor" && (
                <div className="ml-auto h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
              )}
              {(item.label === "Tournaments" || item.label === "Leaderboard") && (
                <span className="ml-auto text-[9px] font-bold text-amber-400/60 border border-amber-500/15 bg-amber-500/[0.06] rounded-full px-1.5 py-0.5">SOON</span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-4 pb-6 space-y-1">
          <button onClick={() => navigate("/dashboard")} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white/40 hover:bg-white/[0.05] hover:text-white transition-all duration-200">
            <ArrowRight className="h-4 w-4" /> Dashboard
          </button>
          <button onClick={async () => { await signOut(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/[0.06] bg-black backdrop-blur-xl px-4 sm:px-8">
          <button className="lg:hidden text-white/40 hover:text-white transition-colors rounded-xl hover:bg-white/[0.05] p-2" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-white tracking-tight">{active}</h2>
        </header>

        <main className="flex-1 p-5 sm:p-8 lg:p-10">
          {active === "Dashboard" && <AdminDashboard onNavigate={handleNavigate} />}
          {active === "Tournaments" && <ComingSoon title="Tournaments" icon={Trophy} />}
          {active === "Users" && <AdminUsers />}
          {active === "Matches" && <AdminMatches />}
          {active === "Live Monitor" && <AdminLiveMonitor />}
          {active === "Leaderboard" && <ComingSoon title="Leaderboard" icon={Medal} />}
          {active === "Analytics" && <AdminAnalytics />}

          {/* All Bookings - with sport sections */}
          {active === "All Bookings" && (
            <div className="animate-fade-up">
              {loadingBookings ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
                </div>
              ) : allBookings.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-white/40"><p className="text-lg">No bookings found.</p></div>
              ) : (
                <div className="space-y-8">
                  {/* Sport filter tabs */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setBookingSportFilter(0)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all ${bookingSportFilter === 0 ? "bg-emerald-500 text-white border-emerald-500" : "bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white"}`}>
                      All ({allBookings.length})
                    </button>
                    {Object.entries(bookingsBySport).sort(([a], [b]) => Number(a) - Number(b)).map(([sportId, bookings]) => (
                      <button key={sportId} onClick={() => setBookingSportFilter(Number(sportId))} className={`rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all ${bookingSportFilter === Number(sportId) ? "bg-emerald-500 text-white border-emerald-500" : "bg-white/[0.03] text-white/50 border-white/[0.06] hover:text-white"}`}>
                        {sportIcons[Number(sportId)]} {sportNames[Number(sportId)] || `Sport ${sportId}`} ({bookings.length})
                      </button>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                    <div className="grid grid-cols-6 border-b border-white/[0.06] px-5 py-3 text-[10px] font-bold uppercase text-white/30">
                      <span>#</span><span>Sport</span><span>Date</span><span>Time</span><span>User</span><span className="text-center">Status</span>
                    </div>
                    {filteredBookings.map(booking => (
                      <div key={booking.id} className="grid grid-cols-6 items-center border-b border-white/[0.02] px-5 py-3.5 transition-colors last:border-0 hover:bg-white/[0.02]">
                        <span className="text-sm text-white/40 font-mono">#{booking.id}</span>
                        <span className="text-sm text-white/70 font-medium">{sportIcons[booking.sport_id] || "🏅"} {sportNames[booking.sport_id] || `Sport ${booking.sport_id}`}</span>
                        <span className="text-sm text-white/50">{new Date(booking.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span className="text-sm text-white/50 flex items-center gap-1"><Clock className="h-3 w-3 text-white/30" />{formatTime(booking.start_time)} – {formatTime(booking.end_time)}</span>
                        <span className="text-sm text-white/60 font-medium truncate">{booking.user_name || "—"}</span>
                        <div className="text-center">
                          <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${booking.status === "booked" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : booking.status === "cancelled" ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-amber-500/20 bg-amber-500/10 text-amber-400"}`}>{booking.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
