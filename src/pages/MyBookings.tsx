import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { toast } from "sonner";
import { X, ArrowRightLeft, Clock, CalendarCheck, Trophy, ArrowLeft } from "lucide-react";

const sportNames: Record<number, { name: string; icon: string }> = {
  1: { name: "Cricket Turf", icon: "🏏" },
  2: { name: "Futsal", icon: "⚽" },
  3: { name: "Badminton", icon: "🏸" },
};

interface BookingRow {
  id: number;
  sport_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function MyBookings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (data) setBookings(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  const handleCancel = async (bookingId: number) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);
    if (error) {
      toast.error("Failed to cancel booking");
      return;
    }
    toast.success("Booking cancelled.");
    fetchBookings();
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "booked":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "postponed":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-white/5 text-white/40 border-white/10";
    }
  };

  const activeBookings = bookings.filter((b) => b.status === "booked");
  const pastBookings = bookings.filter((b) => b.status !== "booked");

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Dashboard
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white hidden sm:inline">GCU Sports</span>
          </div>
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="text-sm font-medium text-red-400/70 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="mb-8 flex items-center gap-3 animate-fade-up">
          <CalendarCheck className="h-8 w-8 text-emerald-400" />
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">My Bookings</h1>
          <span className="ml-2 inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold">
            {activeBookings.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <CalendarCheck className="h-12 w-12 mb-4 text-white/10" />
            <p className="text-lg text-white/30">No bookings yet.</p>
            <Button
              className="mt-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => navigate("/dashboard")}
            >
              Book a Sport
            </Button>
          </div>
        ) : (
          <>
            {/* Active Bookings */}
            {activeBookings.length > 0 && (
              <div className="mb-10 animate-fade-up" style={{ animationDelay: "0.1s" }}>
                <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Active Bookings</h3>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeBookings.map((b, i) => {
                    const sportInfo = sportNames[b.sport_id] || { name: "Sport", icon: "🏅" };
                    return (
                      <li key={b.id} className="list-none">
                        <div className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:rounded-[1.5rem] md:p-3 animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
                          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                          <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{sportInfo.icon}</span>
                                <span className="font-bold text-white">{sportInfo.name}</span>
                              </div>
                              <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold border ${getStatusStyles(b.status)}`}>
                                {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-1">
                              <CalendarCheck className="h-3.5 w-3.5" />
                              {formatDate(b.date)}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-4">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(b.start_time)} – {formatTime(b.end_time)}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all duration-200 bg-transparent"
                              onClick={() => handleCancel(b.id)}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Cancel Booking
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Past / Cancelled Bookings */}
            {pastBookings.length > 0 && (
              <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
                <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Past & Cancelled</h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pastBookings.map((b) => {
                    const sportInfo = sportNames[b.sport_id] || { name: "Sport", icon: "🏅" };
                    return (
                      <li key={b.id} className="list-none">
                        <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 opacity-60">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span>{sportInfo.icon}</span>
                              <span className="font-semibold text-white/60 text-sm">{sportInfo.name}</span>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${getStatusStyles(b.status)}`}>
                              {b.status}
                            </span>
                          </div>
                          <div className="text-xs text-white/30">
                            {formatDate(b.date)} · {formatTime(b.start_time)} – {formatTime(b.end_time)}
                          </div>
                        </div>
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
