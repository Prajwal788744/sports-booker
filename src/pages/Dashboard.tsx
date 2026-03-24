import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowRight, Trophy, Gamepad2, Eye, TrendingUp, XCircle, CheckCircle2, User, MinusCircle, Bell } from "lucide-react";
import { toast } from "sonner";

const sportMeta: Record<string, { icon: string; description: string; img: string }> = {
  Cricket: {
    icon: "🏏",
    description: "Professional cricket turf with floodlights for day and night play.",
    img: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=400&fit=crop",
  },
  Futsal: {
    icon: "⚽",
    description: "Indoor futsal court with synthetic turf and professional markings.",
    img: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=400&fit=crop",
  },
  Badminton: {
    icon: "🏸",
    description: "Indoor badminton courts with wooden flooring and proper lighting.",
    img: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&h=400&fit=crop",
  },
};

interface Sport {
  id: number;
  name: string;
}

interface MatchRecord {
  id: number;
  team_a_name: string;
  team_b_name: string;
  winner: string | null;
  status: string;
  match_type: string;
  total_overs: number;
  created_at: string;
}
interface TeamJoinRequest {
  id: number;
  match_id: number;
  player_id: number;
  from_team: string;
  to_team: string;
  status: string;
  matches: { team_a_name: string; team_b_name: string }[] | null;
}
interface MatchRequest {
  id: number;
  booking_id: number;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected";
  bookings: { id: number; date: string; start_time: string; end_time: string }[] | null;
  users: { name: string | null; reg_no: string | null; department: string | null }[] | null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.name || "Student";
  const [sports, setSports] = useState<Sport[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [userTeamName, setUserTeamName] = useState<string>("");
  const [pendingRequests, setPendingRequests] = useState<TeamJoinRequest[]>([]);
  const [pendingMatchRequests, setPendingMatchRequests] = useState<MatchRequest[]>([]);

  useEffect(() => {
    supabase.from("sports").select("*").order("id").then(({ data }) => {
      if (data) setSports(data);
    });

    if (user) {
      // Fetch user's team name
      supabase.from("users").select("team_name").eq("id", user.id).single().then(({ data }) => {
        if (data?.team_name) setUserTeamName(data.team_name.toLowerCase().trim());
      });

      supabase.from("matches")
        .select("id, team_a_name, team_b_name, winner, status, match_type, total_overs, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) setMatches(data);
        });

      supabase
        .from("team_join_requests")
        .select("id, match_id, player_id, from_team, to_team, status, matches(team_a_name, team_b_name)")
        .eq("status", "pending")
        .then(async ({ data: requests }) => {
          if (!requests || requests.length === 0) {
            setPendingRequests([]);
            return;
          }
          const { data: myPlayers } = await supabase.from("players").select("id").eq("user_id", user.id);
          const myPlayerIds = new Set((myPlayers || []).map((p: any) => p.id));
          const mine = requests.filter((r: any) => myPlayerIds.has(r.player_id));
          setPendingRequests(mine as TeamJoinRequest[]);
        });

      supabase
        .from("match_requests")
        .select("id, booking_id, from_user_id, to_user_id, status, bookings(id,date,start_time,end_time), users!match_requests_from_user_id_fkey(name,reg_no,department)")
        .eq("to_user_id", user.id)
        .eq("status", "pending")
        .then(({ data }) => {
          setPendingMatchRequests((data || []) as MatchRequest[]);
        });
    }
  }, [user]);

  const getTeamNameBySide = (req: TeamJoinRequest, side: string) => {
    const match = req.matches?.[0];
    if (!match) return side;
    return side === "A" ? match.team_a_name : match.team_b_name;
  };

  const handleTeamRequest = async (req: TeamJoinRequest, decision: "accepted" | "rejected") => {
    if (!user) return;
    if (decision === "accepted") {
      const { error: moveErr } = await supabase
        .from("match_players")
        .update({ team: req.to_team, is_captain: false })
        .eq("match_id", req.match_id)
        .eq("player_id", req.player_id);
      if (moveErr) {
        toast.error(moveErr.message || "Failed to join requested team");
        return;
      }
    }
    const { error: reqErr } = await supabase
      .from("team_join_requests")
      .update({ status: decision })
      .eq("id", req.id);
    if (reqErr) {
      toast.error(reqErr.message || "Failed to update request");
      return;
    }
    toast.success(decision === "accepted" ? "You joined the new team." : "Team request rejected.");
    setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  const handleMatchRequest = async (req: MatchRequest, decision: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("match_requests")
      .update({ status: decision, responded_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) return toast.error(error.message || "Failed to update request");
    setPendingMatchRequests((prev) => prev.filter((r) => r.id !== req.id));
    toast.success(decision === "accepted" ? "Match request accepted. Create your team now." : "Match request rejected.");
    if (decision === "accepted") navigate(`/booking-team/${req.booking_id}`);
  };

  const totalMatches = matches.length;

  const getMatchResult = (m: MatchRecord) => {
    if (m.winner === "tie") return "tie";
    if (!m.winner) return "unknown";
    const winnerName = m.winner === "A" ? m.team_a_name : m.team_b_name;
    return winnerName;
  };

  // Check if the user's team won a given match
  const isUserWin = (m: MatchRecord) => {
    if (m.winner === "tie" || !m.winner) return false;
    const winnerTeam = m.winner === "A" ? m.team_a_name : m.team_b_name;
    // Compare case-insensitively with user's team
    if (userTeamName) {
      return winnerTeam.toLowerCase().trim() === userTeamName;
    }
    // Fallback: assume user is team A (the first team they entered)
    return m.winner === "A";
  };

  const isUserLoss = (m: MatchRecord) => {
    if (m.winner === "tie" || !m.winner) return false;
    return !isUserWin(m);
  };

  const wins = matches.filter(isUserWin).length;
  const losses = matches.filter(isUserLoss).length;
  const ties = matches.filter((m) => m.winner === "tie").length;

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white">GCU Sports</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const section = document.getElementById("team-requests-section");
                if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="relative text-sm font-medium text-amber-400/80 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              <Bell className="h-3.5 w-3.5" /> Requests
              {pendingRequests.length > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 text-[10px] font-bold text-amber-300">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("/my-bookings")}
              className="text-sm font-medium text-white/50 hover:text-white transition-colors"
            >
              My Bookings
            </button>
            <button
              onClick={() => navigate("/matches")}
              className="text-sm font-medium text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <Gamepad2 className="h-3.5 w-3.5" /> Matches
            </button>
            <button
              onClick={() => navigate("/profile")}
              className="text-sm font-medium text-white/50 hover:text-white transition-colors flex items-center gap-1"
            >
              <User className="h-3.5 w-3.5" /> Profile
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

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="mb-10 animate-fade-up">
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">
            Welcome back, <span className="text-emerald-400">{userName}</span>! 👋
          </h1>
          <p className="mt-2 text-white/40 text-base">Choose a sport and book your slot.</p>
        </div>

        {pendingRequests.length > 0 && (
          <div id="team-requests-section" className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Team Requests</h3>
            </div>
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div key={req.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-sm text-white/80">
                    Leave <span className="font-bold">{getTeamNameBySide(req, req.from_team)}</span> and join{" "}
                    <span className="font-bold text-emerald-400">{getTeamNameBySide(req, req.to_team)}</span>?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleTeamRequest(req, "accepted")}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleTeamRequest(req, "rejected")}
                      className="rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingMatchRequests.length > 0 && (
          <div className="mb-8 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-5 animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Match Requests</h3>
            </div>
            <div className="space-y-3">
              {pendingMatchRequests.map((req) => (
                <div key={req.id} className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  {(() => {
                    const fromUser = req.users?.[0];
                    return (
                  <p className="text-sm text-white/80">
                    {fromUser?.name || "A user"} ({fromUser?.reg_no || "No reg"}
                    {fromUser?.department ? ` • ${fromUser.department}` : ""}) challenged you for booking #{req.booking_id}.
                  </p>
                    );
                  })()}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleMatchRequest(req, "accepted")}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleMatchRequest(req, "rejected")}
                      className="rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((sport, i) => {
            const meta = sportMeta[sport.name] || { icon: "🏅", description: "", img: "" };
            return (
              <li key={sport.id} className="list-none min-h-[14rem] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                  <button
                    onClick={() => navigate(`/booking/${sport.id}`)}
                    className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1"
                  >
                    {meta.img && (
                      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `url('${meta.img}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    )}
                    <div className="relative flex flex-col gap-5">
                      <div className="text-5xl transition-transform duration-300 hover:scale-110 inline-block">{meta.icon}</div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-semibold tracking-[-0.04em] md:text-2xl text-white">{sport.name}</h3>
                        <p className="text-sm md:text-base text-white/40">{meta.description}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                          Book Now
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* My Matches Section */}
        {matches.length > 0 && (
          <div className="mt-14 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center gap-3 mb-6">
              <Gamepad2 className="h-7 w-7 text-emerald-400" />
              <h2 className="text-2xl font-extrabold tracking-tight">My Matches</h2>
              <span className="ml-1 inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold">
                {totalMatches}
              </span>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: "Played", value: totalMatches, icon: TrendingUp, color: "text-white" },
                { label: "Wins", value: wins, icon: CheckCircle2, color: "text-emerald-400" },
                { label: "Losses", value: losses, icon: MinusCircle, color: "text-red-400" },
                { label: "Ties", value: ties, icon: XCircle, color: "text-amber-400" },
              ].map((stat) => (
                <div key={stat.label} className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2">
                  <GlowingEffect spread={30} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                  <div className="relative rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-5 text-center">
                    <stat.icon className={`h-5 w-5 mx-auto mb-2 ${stat.color}`} />
                    <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-white/40 font-semibold mt-1">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Match History Table */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="grid grid-cols-4 text-[10px] font-bold text-white/30 uppercase px-5 py-3 border-b border-white/[0.04]">
                <span className="col-span-1">Teams</span>
                <span className="text-center">Type</span>
                <span className="text-center">Result</span>
                <span className="text-right">Action</span>
              </div>
              {matches.map((m) => {
                const result = getMatchResult(m);
                const winnerName = result === "tie" ? "Tied" : result === "unknown" ? "—" : `${result} won`;
                const date = new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <div key={m.id} className="grid grid-cols-4 items-center px-5 py-3.5 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <div className="col-span-1">
                      <p className="text-sm font-semibold text-white/80 truncate">
                        {m.team_a_name} <span className="text-white/30">vs</span> {m.team_b_name}
                      </p>
                      <p className="text-[10px] text-white/30 mt-0.5">{date}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-white/40 font-medium">{m.match_type} · {m.total_overs}ov</span>
                    </div>
                    <div className="text-center">
                      <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${
                        result === "tie"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : isUserWin(m)
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
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
      </main>
    </div>
  );
}
