import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Trophy, Zap, Shield, Settings2 } from "lucide-react";
import { toast } from "sonner";

const MATCH_TYPES = [
  { value: "T20", label: "T20", icon: Zap, overs: 20, desc: "20 overs per side" },
  { value: "Test", label: "Test", icon: Shield, overs: 90, desc: "Unlimited overs" },
  { value: "custom", label: "Custom", icon: Settings2, overs: 10, desc: "Set your own overs" },
];

export default function CreateMatch() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [matchType, setMatchType] = useState("T20");
  const [totalOvers, setTotalOvers] = useState(20);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [creating, setCreating] = useState(false);
  const [authorized, setAuthorized] = useState(true);

  const selectedType = MATCH_TYPES.find((t) => t.value === matchType)!;

  // Check if user owns the booking (only when created from a booking)
  useEffect(() => {
    if (!bookingId || !user) return;
    const checkOwnership = async () => {
      const { data } = await supabase.from("bookings").select("user_id").eq("id", Number(bookingId)).single();
      if (data && data.user_id !== user.id) {
        setAuthorized(false);
        toast.error("Only the person who booked can create a match");
        navigate("/my-bookings", { replace: true });
      }
    };
    checkOwnership();
  }, [bookingId, user]);

  const handleCreate = async () => {
    if (!user) return toast.error("Please log in");
    if (!bookingId) return toast.error("Create match is allowed only from a cricket booking");
    if (!authorized) return toast.error("Only the booking owner can create a match");
    if (!teamAName.trim() || !teamBName.trim()) return toast.error("Enter both team names");
    if (totalOvers < 1 || totalOvers > 90) return toast.error("Overs must be 1-90");

    setCreating(true);
    const { data, error } = await supabase
      .from("matches")
      .insert({
        booking_id: bookingId ? Number(bookingId) : null,
        created_by: user.id,
        sport_id: 1,
        match_type: matchType,
        total_overs: matchType === "Test" ? 90 : totalOvers,
        team_a_name: teamAName.trim(),
        team_b_name: teamBName.trim(),
        status: "not_started",
      })
      .select("id")
      .single();

    setCreating(false);
    if (error) {
      toast.error(error.message || "Failed to create match");
      return;
    }

    // Sync team name to user profile for match creator
    await supabase.from("users").update({ team_name: teamAName.trim() }).eq("id", user.id);

    toast.success("Match created!");
    navigate(`/team-setup/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-amber-500/[0.04] blur-[100px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white hidden sm:inline">Create Match</span>
          </div>
          <div />
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="mb-8 animate-fade-up">
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">🏏 New Cricket Match</h1>
          <p className="mt-2 text-white/40">Set up your match details</p>
        </div>

        {/* Match Type */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Match Type</h3>
          <div className="grid grid-cols-3 gap-3">
            {MATCH_TYPES.map((type) => {
              const Icon = type.icon;
              const active = matchType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setMatchType(type.value);
                    if (type.value !== "custom") setTotalOvers(type.overs);
                  }}
                  className={`rounded-xl p-4 text-center transition-all duration-200 border ${
                    active
                      ? "bg-emerald-500/15 border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                      : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${active ? "text-emerald-400" : "text-white/40"}`} />
                  <span className={`text-sm font-bold block ${active ? "text-emerald-400" : "text-white/70"}`}>{type.label}</span>
                  <span className="text-[10px] text-white/30 block mt-0.5">{type.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Overs */}
        {matchType === "custom" && (
          <div className="mb-8 animate-fade-up">
            <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Number of Overs</h3>
            <input
              type="number"
              min={1}
              max={90}
              value={totalOvers}
              onChange={(e) => setTotalOvers(Number(e.target.value))}
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-base focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        )}

        {/* Team Names */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Teams</h3>
          <div className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:p-3">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div className="relative rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block">Team A Name</label>
                <input
                  type="text"
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  placeholder="e.g. Super Kings"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-base focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20"
                />
              </div>
              <div className="flex items-center justify-center">
                <span className="text-xs font-bold text-white/20 bg-white/[0.04] px-3 py-1 rounded-full">VS</span>
              </div>
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block">Team B Name</label>
                <input
                  type="text"
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  placeholder="e.g. Royal Challengers"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-base focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Summary & Create */}
        <div className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-6 flex items-center justify-between text-sm">
            <span className="text-white/40">Match</span>
            <span className="font-bold text-white">
              {selectedType.label} · {matchType === "Test" ? "90" : totalOvers} overs
            </span>
          </div>
          <Button
            disabled={creating || !teamAName.trim() || !teamBName.trim()}
            onClick={handleCreate}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-6 text-base transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:opacity-40"
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Creating...
              </span>
            ) : (
              "Continue to Team Setup →"
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
