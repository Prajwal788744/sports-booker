import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, Circle, ChevronRight, Award, XCircle } from "lucide-react";
import { toast } from "sonner";

interface MatchData {
  id: number; match_type: string; total_overs: number; status: string;
  current_innings: number; batting_team: string; bowling_team: string;
  team_a_name: string; team_b_name: string; winner: string | null;
  man_of_match: number | null;
}
interface InningsData {
  id: number; innings_number: number; team: string;
  runs: number; wickets: number; overs: number; balls: number; status: string;
}
interface BallEvent {
  id: number; over_number: number; ball_number: number;
  runs: number; extra_type: string; wicket_type: string;
  batsman_id: number; bowler_id: number; innings_id: number;
}
interface MPlayer { player_id: number; team: string; is_captain: boolean; name: string; }
interface PStats {
  player_id: number; runs_scored: number; balls_faced: number;
  fours: number; sixes: number; wickets_taken: number; runs_conceded: number;
}

export default function Scoring() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const numMatchId = Number(matchId);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [innings, setInnings] = useState<InningsData[]>([]);
  const [players, setPlayers] = useState<MPlayer[]>([]);
  const [stats, setStats] = useState<PStats[]>([]);
  const [balls, setBalls] = useState<BallEvent[]>([]);

  // Current state
  const [strikerId, setStrikerId] = useState<number | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<number | null>(null);
  const [bowlerId, setBowlerId] = useState<number | null>(null);
  const [selectingBatsman, setSelectingBatsman] = useState<"striker" | "non_striker" | null>("striker");
  const [selectingBowler, setSelectingBowler] = useState(false);
  const [processing, setProcessing] = useState(false);

  // End match
  const [showEndMatch, setShowEndMatch] = useState(false);

  const fetchAll = useCallback(async () => {
    const [matchRes, inningsRes, playersRes, statsRes, ballsRes] = await Promise.all([
      supabase.from("matches").select("*").eq("id", numMatchId).single(),
      supabase.from("innings").select("*").eq("match_id", numMatchId).order("innings_number"),
      supabase.from("match_players").select("player_id, team, is_captain, players(name)").eq("match_id", numMatchId),
      supabase.from("player_stats").select("*").eq("match_id", numMatchId),
      supabase.from("ball_events").select("*").eq("match_id", numMatchId),
    ]);
    if (matchRes.data) setMatch(matchRes.data);
    if (inningsRes.data) setInnings(inningsRes.data);
    if (playersRes.data) setPlayers(playersRes.data.map((p: any) => ({
      player_id: p.player_id, team: p.team, is_captain: p.is_captain, name: p.players?.name || "?",
    })));
    if (statsRes.data) setStats(statsRes.data);
    if (ballsRes.data) setBalls(ballsRes.data);
  }, [numMatchId]);

  // Auto-compute Man of the Match based on player performance
  const computeMotm = useCallback(() => {
    if (stats.length === 0) return null;
    let bestId: number | null = null;
    let bestScore = -Infinity;
    for (const s of stats) {
      const battingScore = s.runs_scored * 1 + s.fours * 1 + s.sixes * 2;
      const bowlingScore = s.wickets_taken * 25 - s.runs_conceded * 0.5;
      const total = battingScore + bowlingScore;
      if (total > bestScore) {
        bestScore = total;
        bestId = s.player_id;
      }
    }
    return bestId;
  }, [stats]);
  // Already dismissed batsmen - must be declared BEFORE any early returns
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);

  // Compute currentInningsId safely for effects (may be undefined during loading)
  const currentInningsId = match && innings.length > 0
    ? innings.find((i) => i.innings_number === match.current_innings)?.id
    : undefined;

  useEffect(() => {
    if (!currentInningsId) return;
    supabase.from("ball_events").select("batsman_id, wicket_type")
      .eq("match_id", numMatchId)
      .eq("innings_id", currentInningsId)
      .neq("wicket_type", "none")
      .then(({ data }) => {
        if (data) setDismissedIds(data.map((d) => d.batsman_id));
      });
  }, [numMatchId, currentInningsId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!match || innings.length === 0) return (
    <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
    </div>
  );

  const currentInnings = innings.find((i) => i.innings_number === match.current_innings);
  if (!currentInnings) return (
    <div className="min-h-screen bg-black/[0.96] text-white flex flex-col items-center justify-center p-6">
      <p className="text-white/50 mb-4">Unable to load innings data.</p>
      <button onClick={() => navigate(`/team-setup/${numMatchId}`)} className="text-emerald-400 underline">Go to Team Setup</button>
    </div>
  );
  const battingTeam = match.batting_team;
  const bowlingTeam = match.bowling_team;
  const battingPlayers = players.filter((p) => p.team === battingTeam);
  const bowlingPlayers = players.filter((p) => p.team === bowlingTeam);
  const teamName = (t: string) => t === "A" ? match.team_a_name : match.team_b_name;

  const getPlayerName = (id: number | null) => players.find((p) => p.player_id === id)?.name || "Select";
  const getStats = (id: number) => stats.find((s) => s.player_id === id);

  const oversDisplay = `${currentInnings.overs}.${currentInnings.balls}`;

  // Compute bowler ball counts from ball_events for the current innings
  const bowlerBallCounts: Record<number, number> = {};
  for (const b of balls) {
    if (b.innings_id === currentInnings.id && b.extra_type === "none") {
      bowlerBallCounts[b.bowler_id] = (bowlerBallCounts[b.bowler_id] || 0) + 1;
    }
  }
  const getBowlerOvers = (id: number) => {
    const totalBalls = bowlerBallCounts[id] || 0;
    return `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;
  };

  // Check if we need to select batsmen/bowler first
  const needsSetup = strikerId === null || nonStrikerId === null || bowlerId === null;


  const availableBatsmen = battingPlayers.filter(
    (p) => !dismissedIds.includes(p.player_id) && p.player_id !== strikerId && p.player_id !== nonStrikerId
  );

  // Handle ball action
  const handleBall = async (runs: number, extraType: string = "none", wicketType: string = "none") => {
    if (!strikerId || !bowlerId || processing) return;
    setProcessing(true);

    const isExtra = extraType !== "none";
    const isWicket = wicketType !== "none";
    const validBall = !isExtra;

    let newBalls = currentInnings.balls;
    let newOvers = currentInnings.overs;
    if (validBall) {
      newBalls += 1;
      if (newBalls >= 6) {
        newOvers += 1;
        newBalls = 0;
      }
    }

    const totalRuns = currentInnings.runs + runs + (isExtra ? 1 : 0);
    const totalWickets = currentInnings.wickets + (isWicket ? 1 : 0);
    const extraRun = isExtra ? 1 : 0;

    // Insert ball event
    await supabase.from("ball_events").insert({
      match_id: numMatchId,
      innings_id: currentInnings.id,
      over_number: currentInnings.overs,
      ball_number: currentInnings.balls,
      batsman_id: strikerId,
      bowler_id: bowlerId,
      runs,
      extra_type: extraType,
      wicket_type: wicketType,
    });

    // Update innings
    await supabase.from("innings").update({
      runs: totalRuns,
      wickets: totalWickets,
      overs: newOvers,
      balls: newBalls,
    }).eq("id", currentInnings.id);

    // Update batsman stats
    if (extraType !== "wide") {
      const batsmanStats = getStats(strikerId);
      await supabase.from("player_stats").update({
        runs_scored: (batsmanStats?.runs_scored || 0) + runs,
        balls_faced: (batsmanStats?.balls_faced || 0) + 1,
        fours: (batsmanStats?.fours || 0) + (runs === 4 ? 1 : 0),
        sixes: (batsmanStats?.sixes || 0) + (runs === 6 ? 1 : 0),
      }).eq("match_id", numMatchId).eq("player_id", strikerId);
    }

    // Update bowler stats
    const bowlerStats = getStats(bowlerId);
    await supabase.from("player_stats").update({
      runs_conceded: (bowlerStats?.runs_conceded || 0) + runs + extraRun,
      wickets_taken: (bowlerStats?.wickets_taken || 0) + (isWicket ? 1 : 0),
    }).eq("match_id", numMatchId).eq("player_id", bowlerId);

    // Rotate strike on odd runs
    if (runs % 2 === 1) {
      const temp = strikerId;
      setStrikerId(nonStrikerId);
      setNonStrikerId(temp);
    }

    // Over complete — rotate strike + select new bowler
    if (validBall && newBalls === 0) {
      const temp = strikerId;
      setStrikerId(runs % 2 === 1 ? strikerId : nonStrikerId);
      setNonStrikerId(runs % 2 === 1 ? nonStrikerId! : temp);
      setSelectingBowler(true);
    }

    // Check if innings should end
    const allOut = totalWickets >= battingPlayers.length - 1;
    const oversComplete = newOvers >= match.total_overs;

    if (allOut || oversComplete) {
      await supabase.from("innings").update({ status: "completed" }).eq("id", currentInnings.id);

      if (match.current_innings === 1) {
        // Switch innings
        await supabase.from("matches").update({
          current_innings: 2,
          batting_team: bowlingTeam,
          bowling_team: battingTeam,
        }).eq("id", numMatchId);
        setStrikerId(null);
        setNonStrikerId(null);
        setBowlerId(null);
        setSelectingBatsman("striker");
        setDismissedIds([]);
        toast.success("Innings complete! Second innings starting.");
      } else {
        // Match over
        const inn1 = innings.find((i) => i.innings_number === 1);
        const inn2Runs = totalRuns;
        const inn1Runs = inn1?.runs || 0;
        let winner: string | null = null;
        if (inn2Runs > inn1Runs) winner = bowlingTeam === "A" ? "B" : "A"; // batting team (inn2) is the team that was bowling in inn1
        else if (inn2Runs < inn1Runs) winner = battingTeam === "A" ? "B" : "A"; // team that batted first
        else winner = "tie";

        // Fix: batting team in 2nd innings wins if they score more
        const secondBattingTeam = battingTeam; // current batting team in 2nd innings
        const firstBattingTeam = bowlingTeam; // they batted first
        if (inn2Runs > inn1Runs) winner = secondBattingTeam;
        else if (inn2Runs < inn1Runs) winner = firstBattingTeam;
        else winner = "tie";

        // Auto-compute MOTM
        const motmId = computeMotm();
        await supabase.from("matches").update({ status: "completed", winner, man_of_match: motmId }).eq("id", numMatchId);
        toast.success(`Match over! ${winner === "tie" ? "It's a tie!" : `${teamName(winner)} wins!`}`);
      }
    }

    // Wicket — need new batsman
    if (isWicket && !allOut && !oversComplete) {
      setStrikerId(null);
      setSelectingBatsman("striker");
    }

    await fetchAll();
    setProcessing(false);
  };

  const endMatch = async () => {
    // Determine winner from current scores
    const inn1 = innings.find((i) => i.innings_number === 1);
    const inn2 = innings.find((i) => i.innings_number === 2);
    const r1 = inn1?.runs || 0;
    const r2 = inn2?.runs || 0;
    const team1 = inn1?.team || "A";
    const team2 = inn2?.team || "B";
    let winner: string;
    if (r1 > r2) winner = team1;
    else if (r2 > r1) winner = team2;
    else winner = "tie";

    // Auto-compute MOTM
    const motmId = computeMotm();

    await supabase.from("innings").update({ status: "completed" }).eq("match_id", numMatchId);
    await supabase.from("matches").update({
      status: "completed",
      winner,
      man_of_match: motmId,
    }).eq("id", numMatchId);

    toast.success(`Match ended! ${winner === "tie" ? "It's a tie!" : `${teamName(winner)} wins!`}`);
    navigate(`/live/${numMatchId}`);
  };

  // COMPLETED match view
  if (match.status === "completed") {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex flex-col items-center justify-center p-6">
        <Trophy className="h-16 w-16 text-amber-400 mb-4" />
        <h1 className="text-3xl font-extrabold mb-2">Match Completed</h1>
        <p className="text-white/50 mb-6">
          {match.winner === "tie" ? "It's a tie!" : `${teamName(match.winner!)} wins!`}
        </p>
        <Button onClick={() => navigate(`/live/${numMatchId}`)} className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3">
          View Scorecard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
      </div>

      {/* Compact Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <button onClick={() => navigate("/my-bookings")} className="text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-white/70">
            {match.match_type} · Innings {match.current_innings}
          </span>
          <button onClick={() => navigate(`/live/${numMatchId}`)} className="text-xs text-emerald-400 font-semibold">
            Live View →
          </button>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-2xl px-4 py-6">
        {/* Scoreboard */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">{teamName(battingTeam)}</h2>
              <p className="text-xs text-white/40">Batting</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-black text-emerald-400">{currentInnings.runs}</span>
              <span className="text-xl text-white/40 font-bold">/{currentInnings.wickets}</span>
              <p className="text-sm text-white/50 font-semibold">{oversDisplay} overs</p>
            </div>
          </div>
          {innings.length > 1 && match.current_innings === 2 && (
            <div className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-1.5 text-center font-semibold">
              Target: {(innings[0].runs + 1)} · Need {(innings[0].runs + 1) - currentInnings.runs} from{" "}
              {(match.total_overs * 6) - (currentInnings.overs * 6 + currentInnings.balls)} balls
            </div>
          )}
        </div>

        {/* Current Players */}
        <div className="grid grid-cols-3 gap-3 mb-6 text-center">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Striker</p>
            <p className="text-sm font-bold text-white truncate">{getPlayerName(strikerId)}</p>
            {strikerId && <p className="text-xs text-emerald-400 font-semibold">{getStats(strikerId)?.runs_scored || 0} ({getStats(strikerId)?.balls_faced || 0})</p>}
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Non-Striker</p>
            <p className="text-sm font-bold text-white truncate">{getPlayerName(nonStrikerId)}</p>
            {nonStrikerId && <p className="text-xs text-emerald-400 font-semibold">{getStats(nonStrikerId)?.runs_scored || 0} ({getStats(nonStrikerId)?.balls_faced || 0})</p>}
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Bowler</p>
            <p className="text-sm font-bold text-white truncate">{getPlayerName(bowlerId)}</p>
            {bowlerId && (
              <div>
                <p className="text-xs text-red-400 font-semibold">{getStats(bowlerId)?.wickets_taken || 0}-{getStats(bowlerId)?.runs_conceded || 0}</p>
                <p className="text-[10px] text-white/30 font-medium">{getBowlerOvers(bowlerId)} ov</p>
              </div>
            )}
          </div>
        </div>

        {/* Batsman / Bowler Selection Modal */}
        {(selectingBatsman || selectingBowler) && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-5 animate-fade-up">
            <h3 className="text-sm font-bold text-amber-400 mb-3">
              {selectingBatsman ? `Select ${selectingBatsman === "striker" ? "Striker" : "Non-Striker"}` : "Select Bowler"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(selectingBowler ? bowlingPlayers : battingPlayers.filter((p) => p.player_id !== strikerId && p.player_id !== nonStrikerId)).map((p) => {
                const isDismissed = !selectingBowler && dismissedIds.includes(p.player_id);
                return (
                  <button
                    key={p.player_id}
                    disabled={isDismissed}
                    onClick={() => {
                      if (isDismissed) return;
                      if (selectingBatsman === "striker") {
                        setStrikerId(p.player_id);
                        if (!nonStrikerId) setSelectingBatsman("non_striker");
                        else { setSelectingBatsman(null); if (!bowlerId) setSelectingBowler(true); }
                      } else if (selectingBatsman === "non_striker") {
                        setNonStrikerId(p.player_id);
                        setSelectingBatsman(null);
                        if (!bowlerId) setSelectingBowler(true);
                      } else {
                        setBowlerId(p.player_id);
                        setSelectingBowler(false);
                      }
                    }}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all text-left flex items-center gap-2 ${
                      isDismissed
                        ? "bg-red-500/10 border-red-500/20 text-red-400/70 cursor-not-allowed opacity-60"
                        : "bg-white/[0.04] border-white/[0.06] text-white/80 hover:bg-emerald-500/10 hover:border-emerald-500/20"
                    }`}
                  >
                    {isDismissed && <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                    <span className={isDismissed ? "line-through" : ""}>{p.name}</span>
                    {p.is_captain && <span className="text-amber-400 ml-1 text-[10px]">(C)</span>}
                    {isDismissed && <span className="text-[10px] text-red-400/60 ml-auto">OUT</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scoring Controls */}
        {!needsSetup && !selectingBatsman && !selectingBowler && (
          <div className="space-y-4 animate-fade-up">
            {/* Runs */}
            <div>
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Runs</h4>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 6].map((r) => (
                  <button
                    key={r}
                    disabled={processing}
                    onClick={() => handleBall(r)}
                    className={`rounded-xl py-4 text-lg font-black transition-all disabled:opacity-40 ${
                      r === 4
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25"
                        : r === 6
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:bg-purple-500/25"
                        : "bg-white/[0.04] text-white border border-white/[0.06] hover:bg-white/[0.08]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Extras */}
            <div>
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Extras</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={processing}
                  onClick={() => handleBall(0, "wide")}
                  className="rounded-xl py-3 text-sm font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-40"
                >
                  Wide
                </button>
                <button
                  disabled={processing}
                  onClick={() => handleBall(1, "no_ball")}
                  className="rounded-xl py-3 text-sm font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-40"
                >
                  No Ball
                </button>
              </div>
            </div>

            {/* Wickets */}
            <div>
              <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Wicket</h4>
              <div className="grid grid-cols-3 gap-2">
                {["bowled", "caught", "run_out"].map((w) => (
                  <button
                    key={w}
                    disabled={processing}
                    onClick={() => handleBall(0, "none", w)}
                    className="rounded-xl py-3 text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all capitalize disabled:opacity-40"
                  >
                    {w.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* End Match */}
            <div className="pt-4 border-t border-white/[0.06]">
              {!showEndMatch ? (
                <button
                  onClick={() => setShowEndMatch(true)}
                  className="w-full text-center text-sm text-red-400/60 hover:text-red-400 transition-colors py-2"
                >
                  End Match Early
                </button>
              ) : (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 space-y-3">
                  <p className="text-sm text-white/60 font-semibold">Are you sure you want to end this match?</p>
                  <p className="text-xs text-white/40">Man of the Match will be auto-selected based on performance.</p>
                  <div className="flex gap-2">
                    <Button onClick={endMatch} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm">
                      <Award className="h-4 w-4 mr-1" /> End Match
                    </Button>
                    <Button variant="outline" onClick={() => setShowEndMatch(false)} className="rounded-xl border-white/[0.1] text-white/50 hover:text-white bg-transparent text-sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
