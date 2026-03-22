import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Clock, CalendarCheck, Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

const sportNames: Record<number, { name: string; icon: string }> = {
  1: { name: "Cricket Turf", icon: "🏏" },
  2: { name: "Futsal", icon: "⚽" },
  3: { name: "Badminton", icon: "🏸" },
};

// Generate time slots from 7:00 AM to 5:30 PM (last slot ends at 6:30 PM max)
function generateTimeSlots() {
  const slots: { start: string; end: string; label: string }[] = [];
  for (let h = 7; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m === 30) break; // last slot at 17:00
      const startH = h;
      const startM = m;
      const endH = m === 30 ? h + 1 : h + 1;
      const endM = m === 30 ? 0 : 0;
      const start = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
      const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      const formatTime = (hh: number, mm: number) => {
        const ampm = hh >= 12 ? "PM" : "AM";
        const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
        return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
      };
      slots.push({
        start,
        end,
        label: `${formatTime(startH, startM)} – ${formatTime(endH, endM)}`,
      });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

interface ExistingBooking {
  start_time: string;
  end_time: string;
}

export default function Booking() {
  const { sportId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const numSportId = Number(sportId);
  const sport = sportNames[numSportId];

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return format(today, "yyyy-MM-dd");
  });
  const [bookedSlots, setBookedSlots] = useState<ExistingBooking[]>([]);
  const [bookingInProgress, setBookingInProgress] = useState<string | null>(null);

  // Generate next 7 days for date picker
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "EEE, MMM d") };
  });

  // Fetch existing bookings for this sport + date
  useEffect(() => {
    if (!numSportId || !selectedDate) return;
    const fetchBookings = async () => {
      const { data } = await supabase
        .from("bookings")
        .select("start_time, end_time")
        .eq("sport_id", numSportId)
        .eq("date", selectedDate)
        .eq("status", "booked");
      setBookedSlots(data || []);
    };
    fetchBookings();
  }, [numSportId, selectedDate]);

  const isSlotBooked = (start: string, end: string) => {
    return bookedSlots.some((b) => {
      const bStart = b.start_time.slice(0, 5);
      const bEnd = b.end_time.slice(0, 5);
      return bStart < end && bEnd > start;
    });
  };

  const handleBook = async (slot: { start: string; end: string; label: string }) => {
    if (!user) {
      toast.error("Please log in to book");
      return;
    }
    setBookingInProgress(slot.start);

    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      sport_id: numSportId,
      date: selectedDate,
      start_time: slot.start,
      end_time: slot.end,
      status: "booked",
    });

    if (error) {
      toast.error(error.message || "Booking failed");
      setBookingInProgress(null);
      return;
    }

    toast.success(`Booked ${sport?.name} at ${slot.label}!`);
    setBookingInProgress(null);
    // Refresh booked slots
    const { data } = await supabase
      .from("bookings")
      .select("start_time, end_time")
      .eq("sport_id", numSportId)
      .eq("date", selectedDate)
      .eq("status", "booked");
    setBookedSlots(data || []);
  };

  if (!sport) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
        <p className="text-white/40">Sport not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white hidden sm:inline">GCU Sports</span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="mb-8 animate-fade-up">
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">
            {sport.icon} {sport.name}
          </h1>
          <p className="mt-2 text-white/40 text-base">Select a date and time slot to book.</p>
        </div>

        {/* Date Picker */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Select Date</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDate(d.value)}
                className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 border ${
                  selectedDate === d.value
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
                    : "bg-white/[0.03] text-white/60 border-white/[0.06] hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Slots Grid */}
        <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Available Slots</h3>
          <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {TIME_SLOTS.map((slot) => {
              const booked = isSlotBooked(slot.start, slot.end);
              const isBooking = bookingInProgress === slot.start;
              return (
                <li key={slot.start} className="list-none">
                  <div className="relative rounded-[1rem] border-[0.75px] border-white/[0.06] p-1.5">
                    <GlowingEffect spread={30} glow={true} disabled={booked} proximity={64} inactiveZone={0.01} borderWidth={2} />
                    <div className={`relative overflow-hidden rounded-lg border-[0.75px] p-4 transition-all duration-300 ${
                      booked
                        ? "bg-red-950/20 border-red-500/10 opacity-60"
                        : "bg-white/[0.03] border-white/[0.06] hover:-translate-y-0.5"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className={`h-3.5 w-3.5 ${booked ? "text-red-400" : "text-emerald-400"}`} />
                        <span className="text-sm font-bold text-white">{slot.label}</span>
                      </div>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold mb-3 ${
                        booked
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {booked ? "✕ Booked" : "✓ Available"}
                      </span>
                      <Button
                        size="sm"
                        disabled={booked || isBooking}
                        className={`w-full rounded-lg text-xs transition-all duration-300 ${
                          booked
                            ? "bg-red-500/10 text-red-400 cursor-not-allowed border border-red-500/20"
                            : "bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/25"
                        }`}
                        onClick={() => handleBook(slot)}
                      >
                        {isBooking ? "Booking..." : booked ? "Booked" : (
                          <span className="flex items-center gap-1">
                            <CalendarCheck className="h-3 w-3" /> Book
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
