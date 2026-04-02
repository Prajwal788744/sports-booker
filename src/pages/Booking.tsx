import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Clock, CalendarCheck, Trophy, AlertTriangle, ChevronDown, Swords } from "lucide-react";
import GcuLogo from "@/components/GcuLogo";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

const sportNames: Record<number, { name: string; icon: string }> = {
  1: { name: "Cricket Turf", icon: "🏏" },
  2: { name: "Futsal", icon: "⚽" },
  3: { name: "Badminton", icon: "🏸" },
};

// 30-min intervals from 7:00 to 18:00
function generateTimeOptions() {
  const options: { value: string; label: string }[] = [];
  for (let h = 7; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m > 0) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const label = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface ExistingBooking {
  start_time: string;
  end_time: string;
  sport_id: number;
  id: number;
  user_id: string;
  booked_by_name?: string | null;
}



// Custom time dropdown that shows booked times in red
function TimeDropdown({
  value,
  onChange,
  options,
  getTimeStatus,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  getTimeStatus: (time: string) => "booked" | "blocked" | "available";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <label className="text-sm font-semibold text-white/60 mb-2 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-base focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
      >
        <span>{selectedOption?.label || "Select"}</span>
        <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl bg-black/80 backdrop-blur-lg border border-white/[0.12] shadow-2xl shadow-black/60">
          {options.map((opt) => {
            const status = getTimeStatus(opt.value);
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between ${isActive
                  ? "bg-emerald-500/20 text-emerald-400"
                  : status === "booked"
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    : status === "blocked"
                      ? "bg-white/[0.03] text-white/30 hover:bg-white/[0.06]"
                      : "text-white/90 hover:bg-white/[0.08]"
                  }`}
              >
                <span>{opt.label}</span>
                {status === "booked" && (
                  <span className="text-[10px] font-bold bg-red-500/20 border border-red-500/30 rounded-full px-2 py-0.5">
                    Booked
                  </span>
                )}
                {status === "blocked" && (
                  <span className="text-[10px] font-bold bg-white/10 border border-white/10 rounded-full px-2 py-0.5 text-white/30">
                    Blocked
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Booking() {
  const { sportId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const numSportId = Number(sportId);
  const sport = sportNames[numSportId];

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("08:00");
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "EEE, MMM d") };
  });

  // Cricket (1) + Futsal (2) share a turf, Badminton (3) is separate
  const isSharedTurf = numSportId === 1 || numSportId === 2;

  const fetchBookings = async () => {
    if (!selectedDate) return;
    let query = supabase
      .from("bookings")
      .select("id, start_time, end_time, sport_id, user_id")
      .eq("date", selectedDate)
      .eq("status", "booked")
      .order("start_time");

    if (isSharedTurf) {
      query = query.in("sport_id", [1, 2]);
    } else {
      query = query.eq("sport_id", numSportId);
    }

    const { data } = await query;
    const rows = (data || []) as ExistingBooking[];

    if (rows.length === 0) {
      setExistingBookings([]);
      return;
    }

    const userIds = Array.from(new Set(rows.map((booking) => booking.user_id)));
    const { data: profiles } = await supabase.from("users").select("id, name").in("id", userIds);
    const nameMap = Object.fromEntries((profiles || []).map((profile: any) => [profile.id, profile.name]));

    setExistingBookings(
      rows.map((booking) => ({
        ...booking,
        booked_by_name: nameMap[booking.user_id] || null,
      }))
    );
  };

  useEffect(() => {
    fetchBookings();
  }, [selectedDate]);



  // Validation
  const durationMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
  const isTooShort = durationMinutes < 60;
  const isInvalidRange = durationMinutes <= 0;

  // Check time status: 'booked' (exact start), 'blocked' (within range), 'available'
  const getTimeStatus = (time: string): "booked" | "blocked" | "available" => {
    for (const b of existingBookings) {
      const bStart = b.start_time.slice(0, 5);
      const bEnd = b.end_time.slice(0, 5);
      if (time === bStart) return "booked";
      if (time > bStart && time < bEnd) return "blocked";
    }
    return "available";
  };

  const hasOverlap = existingBookings.some((b) => {
    const bStart = b.start_time.slice(0, 5);
    const bEnd = b.end_time.slice(0, 5);
    return bStart < endTime && bEnd > startTime;
  });

  const canBook = !isTooShort && !isInvalidRange && !hasOverlap;

  const handleBook = async () => {
    if (!user) return toast.error("Please log in to book");
    if (!canBook) return;

    setIsSubmitting(true);
    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      sport_id: numSportId,
      date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      status: "booked",
    });
    setIsSubmitting(false);

    if (error) {
      if (error.message?.includes("Time slot already booked")) {
        toast.error("Time slot already booked! Please choose a different time.");
      } else {
        toast.error(error.message || "Booking failed");
      }
      return;
    }

    toast.success(`Booked ${sport?.name}: ${formatTime(startTime)} – ${formatTime(endTime)}!`);

    // Reset to next available slot
    const endMin = timeToMinutes(endTime);
    const nextStartH = Math.floor(endMin / 60);
    const nextStartM = endMin % 60;
    const nextEndMin = endMin + 60;
    const nextEndH = Math.floor(nextEndMin / 60);
    const nextEndM = nextEndMin % 60;
    if (nextEndH <= 18) {
      setStartTime(`${String(nextStartH).padStart(2, "0")}:${String(nextStartM).padStart(2, "0")}`);
      setEndTime(`${String(nextEndH).padStart(2, "0")}:${String(nextEndM).padStart(2, "0")}`);
    }

    fetchBookings();
  };



  if (!sport) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
        <p className="text-white/40">Sport not found.</p>
      </div>
    );
  }

  // Coming Soon for Futsal and Badminton
  if (numSportId === 2 || numSportId === 3) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white">
        <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Dashboard
            </button>
            <div className="flex items-center gap-2.5 font-extrabold text-lg">
              <GcuLogo />
              <span className="tracking-tight text-white hidden sm:inline">GCU Sports</span>
            </div>
          </div>
        </nav>
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <div className="text-6xl mb-6">{sport.icon}</div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">{sport.name}</h1>
          <p className="text-lg text-white/40 mb-8">Coming Soon</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-5 py-2.5">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-semibold text-amber-400">We'll enable this feature soon!</span>
          </div>
          <button onClick={() => navigate("/dashboard")} className="mt-8 rounded-xl bg-white/[0.06] border border-white/[0.08] px-6 py-3 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/[0.1] transition-all">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const startOptions = TIME_OPTIONS.filter((t) => t.value < "18:00");
  const endOptions = TIME_OPTIONS.filter((t) => timeToMinutes(t.value) > timeToMinutes(startTime));

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
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Dashboard
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white hidden sm:inline">GCU Sports</span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">
            {sport.icon} {sport.name}
          </h1>
          <p className="mt-2 text-white/40 text-base">
            Pick a date and time range.
            {isSharedTurf && <span className="text-amber-400/70"> Cricket & Futsal share the same turf.</span>}
          </p>
        </div>

        {/* Date Picker */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Select Date</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {dates.map((d) => (
              <button
                key={d.value}
                onClick={() => setSelectedDate(d.value)}
                className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 border ${selectedDate === d.value
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
                  : "bg-white/[0.03] text-white/60 border-white/[0.06] hover:bg-white/[0.06] hover:text-white"
                  }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Selection */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Select Time</h3>
          <div className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:p-3">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div className="relative rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-6 sm:p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <TimeDropdown
                  label="Start Time"
                  value={startTime}
                  onChange={(val) => {
                    setStartTime(val);
                    const newEnd = timeToMinutes(val) + 60;
                    if (timeToMinutes(endTime) <= timeToMinutes(val)) {
                      const eH = Math.floor(newEnd / 60);
                      const eM = newEnd % 60;
                      if (eH <= 18) {
                        setEndTime(`${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`);
                      }
                    }
                  }}
                  options={startOptions}
                  getTimeStatus={getTimeStatus}
                />
                <TimeDropdown
                  label="End Time"
                  value={endTime}
                  onChange={setEndTime}
                  options={endOptions}
                  getTimeStatus={getTimeStatus}
                />
              </div>

              {/* Duration */}
              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-white/50">
                    Duration: <span className={`font-bold ${isTooShort || isInvalidRange ? "text-red-400" : "text-emerald-400"}`}>
                      {isInvalidRange ? "Invalid" : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? `${durationMinutes % 60}m` : ""}`}
                    </span>
                  </span>
                </div>
                <span className="text-sm font-bold text-emerald-400">
                  {formatTime(startTime)} – {formatTime(endTime)}
                </span>
              </div>

              {/* Warnings */}
              {isTooShort && !isInvalidRange && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Minimum booking duration is 1 hour.
                </div>
              )}
              {hasOverlap && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Time slot already booked! Choose a different time.
                </div>
              )}

              {/* Book button */}
              <Button
                disabled={!canBook || isSubmitting}
                onClick={handleBook}
                className="mt-6 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-6 text-base transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Booking...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CalendarCheck className="h-5 w-5" />
                    Confirm Booking
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Existing Bookings List */}
        {existingBookings.length > 0 && (
          <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">
              Booked Slots{isSharedTurf ? " — Shared Turf" : ""}
            </h3>
            <div className="space-y-2">
              {existingBookings.map((b) => {
                const bookedSport = sportNames[b.sport_id] || { name: "Sport", icon: "🏅" };
                return (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="text-sm">{bookedSport.icon}</span>
                      <span className="text-sm font-semibold text-white/70">{bookedSport.name}</span>
                      <Clock className="ml-auto h-3.5 w-3.5 text-white/30" />
                      <span className="text-sm font-medium text-white/50">
                        {formatTime(b.start_time)} – {formatTime(b.end_time)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/35">
                      Booked by <span className="font-semibold text-white/60">{b.booked_by_name || "GCU Sports player"}</span>
                    </div>
                    {b.user_id === user?.id && b.sport_id === 1 && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-emerald-500/20 bg-transparent text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                          onClick={() => navigate(`/match-setup/${b.id}`)}
                        >
                          <Swords className="mr-1 h-3.5 w-3.5" /> Setup Match
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>


    </div>
  );
}
