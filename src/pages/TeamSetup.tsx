import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Trophy, UserPlus, Star, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

interface Player { id: number; name: string; phone?: string; }
interface MatchPlayer { player_id: number; team: string; is_captain: boolean; name: string; }

export default function TeamSetup() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const numMatchId = Number(matchId);
  const nameRef = useRef<HTMLInputElement>(null);

  const [match, setMatch] = useState<any>(null);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B">("A");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from("matches").select("*").eq("id", numMatchId).single();
      if (!data) return;

      // If ongoing/completed, verify innings actually exist before redirecting
      if (data.status === "ongoing") {
        const { data: inns } = await supabase.from("innings").select("id").eq("match_id", numMatchId).limit(1);
        if (inns && inns.length > 0) {
          navigate(`/scoring/${numMatchId}`, { replace: true });
          return;
        } else {
          // Broken state — match marked ongoing but no innings. Reset it.
          await supabase.from("matches").update({ status: "not_started" }).eq("id", numMatchId);
          data.status = "not_started";
        }
      }
      if (data.status === "completed") {
        navigate(`/live/${numMatchId}`, { replace: true });
        return;
      }
      setMatch(data);
    };
    init();

    supabase.from("match_players").select("player_id, team, is_captain, players(name)")
      .eq("match_id", numMatchId)
      .then(({ data }) => {
        setMatchPlayers((data || []).map((mp: any) => ({
          player_id: mp.player_id, team: mp.team, is_captain: mp.is_captain,
          name: mp.players?.name || "Unknown",
        })));
      });
  }, [numMatchId]);

  const addPlayer = async () => {
    if (!user || !newName.trim()) return;

    // Create player
    const { data: player, error: pErr } = await supabase.from("players").insert({
      user_id: user.id,
      name: newName.trim(),
      phone: newPhone.trim() || null,
    }).select("id, name, phone").single();
    if (pErr || !player) return toast.error(pErr?.message || "Failed to add player");

    // Assign to selected team
    const { error: mpErr } = await supabase.from("match_players").insert({
      match_id: numMatchId,
      player_id: player.id,
      team: selectedTeam,
      is_captain: false,
    });
    if (mpErr) return toast.error(mpErr.message);

    setMatchPlayers((prev) => [...prev, {
      player_id: player.id, team: selectedTeam, is_captain: false, name: player.name,
    }]);

    // Clear only inputs, keep team selected
    setNewName("");
    setNewPhone("");
    nameRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPlayer();
    }
  };

  const removePlayer = async (playerId: number) => {
    await supabase.from("match_players").delete().eq("match_id", numMatchId).eq("player_id", playerId);
    setMatchPlayers((prev) => prev.filter((mp) => mp.player_id !== playerId));
  };

  const toggleCaptain = async (playerId: number, team: string) => {
    const teamPlayers = matchPlayers.filter((mp) => mp.team === team);
    for (const mp of teamPlayers) {
      if (mp.is_captain) {
        await supabase.from("match_players").update({ is_captain: false }).eq("match_id", numMatchId).eq("player_id", mp.player_id);
      }
    }
    await supabase.from("match_players").update({ is_captain: true }).eq("match_id", numMatchId).eq("player_id", playerId);
    setMatchPlayers((prev) => prev.map((mp) =>
      mp.team === team ? { ...mp, is_captain: mp.player_id === playerId } : mp
    ));
    toast.success("Captain set!");
  };

  const teamA = matchPlayers.filter((mp) => mp.team === "A");
  const teamB = matchPlayers.filter((mp) => mp.team === "B");

  const startMatch = async () => {
    if (teamA.length < 2 || teamB.length < 2) return toast.error("Need at least 2 players per team");
    if (!teamA.some((p) => p.is_captain)) return toast.error("Select captain for " + (match?.team_a_name || "Team A"));
    if (!teamB.some((p) => p.is_captain)) return toast.error("Select captain for " + (match?.team_b_name || "Team B"));

    setStarting(true);

    try {
      // Check if innings already exist (e.g. from a previous failed attempt)
      const { data: existingInnings } = await supabase.from("innings").select("id").eq("match_id", numMatchId);
      if (!existingInnings || existingInnings.length === 0) {
        await supabase.from("innings").insert([
          { match_id: numMatchId, innings_number: 1, team: "A", status: "ongoing" },
          { match_id: numMatchId, innings_number: 2, team: "B", status: "ongoing" },
        ]);
      }

      // Check if player_stats already exist
      const { data: existingStats } = await supabase.from("player_stats").select("id").eq("match_id", numMatchId).limit(1);
      if (!existingStats || existingStats.length === 0) {
        const statsInserts = matchPlayers.map((mp) => ({ match_id: numMatchId, player_id: mp.player_id }));
        await supabase.from("player_stats").insert(statsInserts);
      }

      await supabase.from("matches").update({
        status: "ongoing", current_innings: 1, batting_team: "A", bowling_team: "B",
      }).eq("id", numMatchId);

      toast.success("Match started!");
      navigate(`/scoring/${numMatchId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to start match");
    }

    setStarting(false);
  };

  if (!match) return (
    <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
    </div>
  );

  const teamAName = match.team_a_name || "Team A";
  const teamBName = match.team_b_name || "Team B";
  const selectedTeamName = selectedTeam === "A" ? teamAName : teamBName;

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back
          </button>
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white hidden sm:inline">Team Setup</span>
          </div>
          <div />
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6 animate-fade-up">
          <h1 className="text-2xl font-extrabold sm:text-3xl tracking-tight">
            {teamAName} vs {teamBName}
          </h1>
          <p className="text-white/40 text-sm mt-1">{match.match_type} · {match.total_overs} overs</p>
        </div>

        {/* Team Selector Tabs */}
        <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Select Team</h3>
          <div className="grid grid-cols-2 gap-3">
            {([
              { team: "A" as const, name: teamAName, count: teamA.length, color: "blue" },
              { team: "B" as const, name: teamBName, count: teamB.length, color: "orange" },
            ]).map(({ team, name, count, color }) => (
              <button
                key={team}
                onClick={() => { setSelectedTeam(team); nameRef.current?.focus(); }}
                className={`rounded-xl px-4 py-4 text-left transition-all duration-200 border-2 ${
                  selectedTeam === team
                    ? color === "blue"
                      ? "bg-blue-500/15 border-blue-500/40 shadow-lg shadow-blue-500/10"
                      : "bg-orange-500/15 border-orange-500/40 shadow-lg shadow-orange-500/10"
                    : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]"
                }`}
              >
                <span className={`text-base font-bold block ${
                  selectedTeam === team
                    ? color === "blue" ? "text-blue-400" : "text-orange-400"
                    : "text-white/60"
                }`}>
                  {name}
                </span>
                <span className="text-xs text-white/30 mt-0.5 block">{count} players</span>
              </button>
            ))}
          </div>
        </div>

        {/* Add Player Input */}
        <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className={`h-4 w-4 ${selectedTeam === "A" ? "text-blue-400" : "text-orange-400"}`} />
            <h3 className="text-sm font-bold text-white/60">
              Adding players to: <span className={selectedTeam === "A" ? "text-blue-400" : "text-orange-400"}>{selectedTeamName}</span>
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              ref={nameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Player name"
              autoFocus
              className="flex-1 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-white/20 transition-colors"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Phone (optional)"
              className="w-32 sm:w-40 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-white/20 transition-colors"
            />
            <Button
              onClick={addPlayer}
              disabled={!newName.trim()}
              className={`rounded-xl px-5 text-white font-semibold disabled:opacity-30 ${
                selectedTeam === "A"
                  ? "bg-blue-500 hover:bg-blue-600"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              <UserPlus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
          <p className="text-[10px] text-white/20 mt-1.5">Press Enter to quickly add players</p>
        </div>

        {/* Team Rosters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {([
            { team: "A" as const, name: teamAName, players: teamA, color: "blue" },
            { team: "B" as const, name: teamBName, players: teamB, color: "orange" },
          ]).map(({ team, name, players, color }) => (
            <div key={team} className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
              <div className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:p-3">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <div className="relative rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-bold text-lg ${color === "blue" ? "text-blue-400" : "text-orange-400"}`}>
                      {name}
                    </h4>
                    <span className="text-xs text-white/30 font-semibold">{players.length} players</span>
                  </div>
                  {players.length === 0 ? (
                    <p className="text-xs text-white/20 py-3 text-center">
                      {selectedTeam === team ? "Type a name above and press Enter" : "Select this team to add players"}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {players.map((mp) => (
                        <div key={mp.player_id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2.5 group">
                          <span className="text-sm font-medium text-white/80 flex-1 truncate">{mp.name}</span>
                          {mp.is_captain && (
                            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full flex-shrink-0">
                              Captain
                            </span>
                          )}
                          <button
                            onClick={() => toggleCaptain(mp.player_id, team)}
                            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                              mp.is_captain ? "text-amber-400 bg-amber-500/10" : "text-white/15 hover:text-amber-400 hover:bg-amber-500/10"
                            }`}
                            title="Set Captain"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removePlayer(mp.player_id)}
                            className="p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Start Match */}
        <div className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
          <Button
            disabled={starting || teamA.length < 2 || teamB.length < 2}
            onClick={startMatch}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-6 text-base shadow-lg shadow-emerald-500/20 disabled:opacity-40"
          >
            {starting ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Starting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play className="h-5 w-5" /> Start Match ({teamA.length} vs {teamB.length})
              </span>
            )}
          </Button>
          {(teamA.length < 2 || teamB.length < 2) && (
            <p className="text-center text-xs text-white/20 mt-2">Minimum 2 players per team required</p>
          )}
        </div>
      </main>
    </div>
  );
}
