import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUserBookingsRealtime } from "@/hooks/useRealtimeSubscription";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ensureBookingMatchStarted, getBookingMatchRoute } from "@/lib/booking-match";
import { toast } from "sonner";
import { X, ArrowRightLeft, Clock, CalendarCheck, Trophy, ArrowLeft, AlertTriangle, Gamepad2, Eye, Gamepad, Search, Users, Swords } from "lucide-react";
import GcuLogo from "@/components/GcuLogo";
import { format, addDays } from "date-fns";

const sportNames: Record<number, { name: string; icon: string }> = {
  1: { name: "Cricket Turf", icon: "🏏" },
  2: { name: "Futsal", icon: "⚽" },
  3: { name: "Badminton", icon: "🏸" },
};

interface BookingRow {
  id: number;
  user_id: string;
  sport_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
}

interface FreeSlot {
  start: string;
  end: string;
  label: string;
}
interface OpponentUserOption {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
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

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Generate all possible 1-hour slots in 30-min intervals (7:00-8:00, 7:30-8:30, ... 5:00-6:00)
function generateAllSlots(): FreeSlot[] {
  const slots: FreeSlot[] = [];
  for (let h = 7; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m === 30) break;
      const startH = h, startM = m;
      const endH = startH + 1;
      const endM = startM; // 1 hour later: 7:00→8:00, 7:30→8:30
      if (endH > 18 || (endH === 18 && endM > 0)) continue;
      const start = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
      const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      slots.push({ start, end, label: `${formatTime(start)} – ${formatTime(end)}` });
    }
  }
  return slots;
}

const ALL_SLOTS = generateAllSlots();

export default function MyBookings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchStatuses, setMatchStatuses] = useState<Record<number, { matchId: number; status: string; teamA: string; teamB: string; winner: string | null }>>({});

  const [allCompletedMatches, setAllCompletedMatches] = useState<{ id: number; teamA: string; teamB: string; winner: string | null; matchType: string; totalOvers: number; createdAt: string }[]>([]);
  const [bookingTeamsCount, setBookingTeamsCount] = useState<Record<number, number>>({});
  const [opponentBookingIds, setOpponentBookingIds] = useState<Set<number>>(new Set());


  // Postpone modal state
  const [postponeBooking, setPostponeBooking] = useState<BookingRow | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeDates, setPostponeDates] = useState<{ value: string; label: string }[]>([]);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [postponing, setPostponing] = useState(false);

  const fetchBookings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    // Also fetch bookings where user is accepted opponent captain
    const { data: opponentMatchReqs } = await supabase
      .from("match_requests")
      .select("booking_id")
      .eq("to_user_id", user.id)
      .eq("status", "accepted");

    const opponentBIds = new Set((opponentMatchReqs || []).map((r: { booking_id: number }) => r.booking_id));
    let opponentBookings: BookingRow[] = [];
    if (opponentBIds.size > 0) {
      const existingIds = new Set((data || []).map((b: BookingRow) => b.id));
      const missingIds = Array.from(opponentBIds).filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        const { data: oppData } = await supabase
          .from("bookings")
          .select("*")
          .in("id", missingIds)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true });
        opponentBookings = (oppData || []) as BookingRow[];
      }
    }
    setOpponentBookingIds(opponentBIds);

    const allBookings = [...(data || []), ...opponentBookings] as BookingRow[];
    if (allBookings.length > 0) {
      setBookings(allBookings);

      // Fetch match statuses for cricket bookings
      const cricketBookingIds = data.filter(b => b.sport_id === 1).map(b => b.id);
      if (cricketBookingIds.length > 0) {
        const { data: matches } = await supabase
          .from("matches")
          .select("id, booking_id, status, team_a_name, team_b_name, winner")
          .in("booking_id", cricketBookingIds);
        if (matches) {
          const statusMap: Record<number, { matchId: number; status: string; teamA: string; teamB: string; winner: string | null }> = {};
          for (const m of matches) {
            if (m.booking_id) {
              if (!statusMap[m.booking_id] || m.status === "completed" || m.status === "ongoing") {
                statusMap[m.booking_id] = { matchId: m.id, status: m.status, teamA: m.team_a_name, teamB: m.team_b_name, winner: m.winner };
              }
            }
          }
          setMatchStatuses(statusMap);
        }

        const { data: bookingTeams } = await supabase
          .from("booking_teams")
          .select("booking_id, user_id")
          .in("booking_id", cricketBookingIds);
        if (bookingTeams) {
          const countMap: Record<number, number> = {};
          for (const bt of bookingTeams as Array<{ booking_id: number; user_id: string }>) {
            countMap[bt.booking_id] = (countMap[bt.booking_id] || 0) + 1;
          }
          setBookingTeamsCount(countMap);
        }

        const { data: acceptedReqs } = await supabase
          .from("match_requests")
          .select("booking_id, to_user_id, status")
          .in("booking_id", cricketBookingIds)
          .eq("status", "accepted");
        void acceptedReqs;
      }
    }

    // Fetch ALL completed matches (regardless of who booked)
    const { data: completedMatches } = await supabase
      .from("matches")
      .select("id, team_a_name, team_b_name, winner, match_type, total_overs, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    if (completedMatches) {
      setAllCompletedMatches(completedMatches.map(m => ({
        id: m.id, teamA: m.team_a_name, teamB: m.team_b_name, winner: m.winner,
        matchType: m.match_type, totalOvers: m.total_overs, createdAt: m.created_at,
      })));
    }

    setLoading(false);
  };

  // Memoized fetch for realtime callback
  const handleRealtimeUpdate = useCallback(() => {
    fetchBookings();
  }, [user]);

  // Realtime subscription for bookings and match requests
  useUserBookingsRealtime(user?.id, handleRealtimeUpdate);



  const startMatchFromSavedTeams = async (booking: BookingRow) => {
    if (!user) return;
    if (booking.user_id !== user.id) return toast.error("Only booking owner can start match");
    try {
      const result = await ensureBookingMatchStarted(booking.id, user.id);
      toast.success(result.created ? "Match started with saved teams." : "Opening the existing booking match.");
      navigate(result.route);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start the booking match.");
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  const handleCancel = async (bookingId: number) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);
    if (error) return toast.error("Failed to cancel booking");
    toast.success("Booking cancelled.");
    fetchBookings();
  };

  // Open postpone modal
  const openPostpone = (booking: BookingRow) => {
    // Show the booked day + next day
    const d1 = new Date(booking.date + "T00:00:00");
    const d2 = addDays(d1, 1);
    const dates = [
      { value: format(d1, "yyyy-MM-dd"), label: formatDate(booking.date) + " (Same day)" },
      { value: format(d2, "yyyy-MM-dd"), label: format(d2, "EEE, MMM d") + " (Next day)" },
    ];
    setPostponeBooking(booking);
    setPostponeDates(dates);
    setPostponeDate(dates[0].value);
    setFreeSlots([]);
  };

  // Fetch free slots for a given date
  useEffect(() => {
    if (!postponeBooking || !postponeDate) return;

    const fetchFree = async () => {
      setLoadingSlots(true);
      const sportId = postponeBooking.sport_id;
      const isSharedTurf = sportId === 1 || sportId === 2;

      let query = supabase
        .from("bookings")
        .select("start_time, end_time")
        .eq("date", postponeDate)
        .eq("status", "booked")
        .order("start_time");

      if (isSharedTurf) {
        query = query.in("sport_id", [1, 2]);
      } else {
        query = query.eq("sport_id", sportId);
      }

      const { data: existingBookings } = await query;
      const booked = existingBookings || [];

      // Filter out slots that overlap with existing bookings
      const free = ALL_SLOTS.filter((slot) => {
        return !booked.some((b) => {
          const bStart = b.start_time.slice(0, 5);
          const bEnd = b.end_time.slice(0, 5);
          return bStart < slot.end && bEnd > slot.start;
        });
      });

      setFreeSlots(free);
      setLoadingSlots(false);
    };

    fetchFree();
  }, [postponeBooking, postponeDate]);

  // Postpone to a new slot
  const handlePostpone = async (slot: FreeSlot) => {
    if (!postponeBooking || !user) return;
    setPostponing(true);

    // 1. Mark old booking as postponed
    const { error: cancelErr } = await supabase
      .from("bookings")
      .update({ status: "postponed" })
      .eq("id", postponeBooking.id);

    if (cancelErr) {
      toast.error("Failed to postpone");
      setPostponing(false);
      return;
    }

    // 2. Create new booking at the new slot
    const { error: insertErr } = await supabase.from("bookings").insert({
      user_id: user.id,
      sport_id: postponeBooking.sport_id,
      date: postponeDate,
      start_time: slot.start,
      end_time: slot.end,
      status: "booked",
    });

    setPostponing(false);

    if (insertErr) {
      // Revert the old booking
      await supabase.from("bookings").update({ status: "booked" }).eq("id", postponeBooking.id);
      if (insertErr.message?.includes("Time slot already booked")) {
        toast.error("That slot just got booked. Try another.");
      } else {
        toast.error(insertErr.message || "Failed to create new booking");
      }
      return;
    }

    toast.success(`Postponed to ${formatDate(postponeDate)} at ${slot.label}!`);
    setPostponeBooking(null);
    fetchBookings();
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "booked": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "cancelled": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "postponed": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default: return "bg-white/5 text-white/40 border-white/10";
    }
  };

  const isMatchCompleted = (bookingId: number) => matchStatuses[bookingId]?.status === "completed";

  const activeBookings = bookings.filter((b) => b.status === "booked" && !isMatchCompleted(b.id));
  const completedBookings = bookings.filter((b) => isMatchCompleted(b.id));
  const pastBookings = bookings.filter((b) => b.status !== "booked" && !isMatchCompleted(b.id));

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
            <GcuLogo />
            <span className="tracking-tight text-white hidden sm:inline">GCU Sports</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/matches")}
              className="text-sm font-medium text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <Gamepad2 className="h-3.5 w-3.5" /> Matches
            </button>
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              className="text-sm font-medium text-red-400/70 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 pb-28 sm:px-6 lg:py-12 md:pb-10">
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
            <Button className="mt-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => navigate("/dashboard")}>
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
                              {opponentBookingIds.has(b.id) && (
                                <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold border border-purple-500/20 bg-purple-500/10 text-purple-400 ml-1">
                                  Opponent Captain
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-1">
                              <CalendarCheck className="h-3.5 w-3.5" />
                              {formatDate(b.date)}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-4">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(b.start_time)} – {formatTime(b.end_time)}
                            </div>
                            <div className="flex flex-wrap gap-2">

                              {b.sport_id === 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 rounded-xl border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30 transition-all duration-200 bg-transparent"
                                  onClick={() => navigate(`/match-lobby/${b.id}`)}
                                >
                                  <Swords className="h-3.5 w-3.5 mr-1" /> Match Lobby
                                </Button>
                              )}

                              {b.sport_id === 1 && b.user_id === user?.id && (bookingTeamsCount[b.id] || 0) >= 2 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 rounded-xl border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30 transition-all duration-200 bg-transparent"
                                  onClick={() => startMatchFromSavedTeams(b)}
                                >
                                  Start Match
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 rounded-xl border-amber-500/20 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-all duration-200 bg-transparent"
                                onClick={() => openPostpone(b)}
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Postpone
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 transition-all duration-200 bg-transparent"
                                onClick={() => handleCancel(b.id)}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Completed Matches */}
            {completedBookings.length > 0 && (
              <div className="mb-10 animate-fade-up" style={{ animationDelay: "0.15s" }}>
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5" /> Completed Matches
                </h3>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {completedBookings.map((b) => {
                    const sportInfo = sportNames[b.sport_id] || { name: "Sport", icon: "🏅" };
                    const matchInfo = matchStatuses[b.id];
                    const winnerName = matchInfo?.winner === "A" ? matchInfo.teamA : matchInfo?.winner === "B" ? matchInfo.teamB : matchInfo?.winner === "tie" ? "Tie" : "";
                    return (
                      <li key={b.id} className="list-none">
                        <div className="relative rounded-[1.25rem] border-[0.75px] border-emerald-500/10 p-2 md:p-3">
                          <GlowingEffect spread={30} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                          <div className="relative rounded-xl border-[0.75px] border-emerald-500/10 bg-emerald-500/[0.02] p-5">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{sportInfo.icon}</span>
                                <span className="font-bold text-white">{sportInfo.name}</span>
                              </div>
                              <span className="inline-block rounded-full px-3 py-1 text-xs font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                Completed
                              </span>
                            </div>
                            {matchInfo && (
                              <div className="mb-3">
                                <p className="text-sm font-bold text-white/80">
                                  {matchInfo.teamA} <span className="text-white/30">vs</span> {matchInfo.teamB}
                                </p>
                                {winnerName && (
                                  <p className="text-xs text-emerald-400/80 mt-1 flex items-center gap-1">
                                    <Trophy className="h-3 w-3" /> {winnerName === "Tie" ? "Match Tied" : `${winnerName} won`}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-1">
                              <CalendarCheck className="h-3.5 w-3.5" />
                              {formatDate(b.date)}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-white/40 mb-3">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime(b.start_time)} – {formatTime(b.end_time)}
                            </div>
                            {matchInfo && (
                              <button
                                onClick={() => navigate(`/live/${matchInfo.matchId}`)}
                                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-semibold"
                              >
                                <Eye className="h-3.5 w-3.5" /> View Scorecard →
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Past / Cancelled / Postponed */}
            {pastBookings.length > 0 && (
              <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
                <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">Past & Cancelled</h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pastBookings.map((b) => {
                    const sportInfo = sportNames[b.sport_id] || { name: "Sport", icon: "🏅" };
                    return (
                      <li key={b.id} className="list-none">
                        <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 opacity-60 hover:opacity-80 transition-opacity">
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

            {/* All Completed Matches (global) */}
            {allCompletedMatches.length > 0 && (
              <div className="mt-10 animate-fade-up" style={{ animationDelay: "0.25s" }}>
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5" /> All Completed Matches
                </h3>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="grid grid-cols-4 text-[10px] font-bold text-white/30 uppercase px-5 py-3 border-b border-white/[0.04]">
                    <span className="col-span-1">Teams</span>
                    <span className="text-center">Type</span>
                    <span className="text-center">Result</span>
                    <span className="text-right">Action</span>
                  </div>
                  {allCompletedMatches.map((m) => {
                    const winnerName = m.winner === "tie" ? "Tied" : m.winner === "A" ? `${m.teamA} won` : m.winner === "B" ? `${m.teamB} won` : "—";
                    const date = new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return (
                      <div key={m.id} className="grid grid-cols-4 items-center px-5 py-3.5 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <div className="col-span-1">
                          <p className="text-sm font-semibold text-white/80 truncate">
                            {m.teamA} <span className="text-white/30">vs</span> {m.teamB}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5">{date}</p>
                        </div>
                        <div className="text-center">
                          <span className="text-xs text-white/40 font-medium">{m.matchType} · {m.totalOvers}ov</span>
                        </div>
                        <div className="text-center">
                          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${
                            m.winner === "tie" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}>
                            {winnerName}
                          </span>
                        </div>
                        <div className="text-right">
                          <button
                            onClick={() => navigate(`/live/${m.id}`)}
                            className="text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors font-semibold flex items-center gap-1 ml-auto"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Postpone Modal */}
      {postponeBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPostponeBooking(null)} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/90 backdrop-blur-xl p-6 shadow-2xl animate-fade-up">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-amber-400" /> Postpone Booking
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  {sportNames[postponeBooking.sport_id]?.icon} {sportNames[postponeBooking.sport_id]?.name} · {formatTime(postponeBooking.start_time)} – {formatTime(postponeBooking.end_time)}
                </p>
              </div>
              <button onClick={() => setPostponeBooking(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date tabs */}
            <div className="flex gap-2 mb-5">
              {postponeDates.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setPostponeDate(d.value)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all border ${
                    postponeDate === d.value
                      ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                      : "bg-white/[0.03] text-white/60 border-white/[0.06] hover:bg-white/[0.06]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Free Slots */}
            {loadingSlots ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              </div>
            ) : freeSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <AlertTriangle className="h-8 w-8 text-amber-400/40 mb-3" />
                <p className="text-sm text-white/40">No free slots on this day.</p>
              </div>
            ) : (
              <div>
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
                  Available Slots ({freeSlots.length})
                </h4>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {freeSlots.map((slot) => (
                    <button
                      key={slot.start}
                      disabled={postponing}
                      onClick={() => handlePostpone(slot)}
                      className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-left hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all disabled:opacity-40"
                    >
                      <Clock className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-white/80">{slot.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}
