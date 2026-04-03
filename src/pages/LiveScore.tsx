import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Trophy, Wifi, Award, Zap } from "lucide-react";
import { formatRoleLabel, getSportProfileTeaser, normalizeSportProfile, type SportProfileRecord } from "@/lib/player-profile";

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
  batsman_id: number; bowler_id: number; innings_id: number; created_at: string;
  is_free_hit?: boolean; caught_by?: number | null; catch_quality?: string | null;
}
interface MPlayer {
  player_id: number;
  team: string;
  is_captain: boolean;
  name: string;
  role: string | null;
  photo_url: string | null;
  sport_profile: SportProfileRecord;
}
interface PStats {
  player_id: number; runs_scored: number; balls_faced: number;
  fours: number; sixes: number; wickets_taken: number; runs_conceded: number;
}

function PlayerChip({ player }: { player: MPlayer | undefined }) {
  if (!player) return null;

  return (
    <div className="flex items-center gap-3 min-w-0">
      {player.photo_url ? (
        <img src={player.photo_url} alt={player.name} className="h-9 w-9 rounded-full object-cover border border-white/10" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[10px] font-bold text-white/60">
          {player.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white/80">
          {player.name}
          {player.is_captain && <span className="ml-2 text-[10px] font-bold uppercase text-amber-400">C</span>}
        </div>
        <div className="truncate text-[11px] text-white/35">
          {getSportProfileTeaser(1, player.sport_profile, player.role) || (player.role ? formatRoleLabel(player.role) : "Player")}
        </div>
      </div>
    </div>
  );
}

export default function LiveScore() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const numMatchId = Number(matchId);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [innings, setInnings] = useState<InningsData[]>([]);
  const [balls, setBalls] = useState<BallEvent[]>([]);
  const [players, setPlayers] = useState<MPlayer[]>([]);
  const [stats, setStats] = useState<PStats[]>([]);

  const fetchAll = async () => {
    const [matchRes, inningsRes, ballsRes, playersRes, statsRes] = await Promise.all([
      supabase.from("matches").select("*").eq("id", numMatchId).single(),
      supabase.from("innings").select("*").eq("match_id", numMatchId).order("innings_number"),
      supabase.from("ball_events").select("*").eq("match_id", numMatchId).order("created_at", { ascending: false }),
      supabase.from("match_players").select("player_id, team, is_captain, players(name, role, photo_url, sport_profile)").eq("match_id", numMatchId),
      supabase.from("player_stats").select("*").eq("match_id", numMatchId),
    ]);
    if (matchRes.data) setMatch(matchRes.data);
    if (inningsRes.data) setInnings(inningsRes.data);
    if (ballsRes.data) setBalls(ballsRes.data);
    if (playersRes.data) setPlayers(playersRes.data.map((p: any) => ({
      player_id: p.player_id,
      team: p.team,
      is_captain: p.is_captain,
      name: p.players?.name || "?",
      role: p.players?.role || null,
      photo_url: p.players?.photo_url || null,
      sport_profile: normalizeSportProfile(p.players?.sport_profile),
    })));
    if (statsRes.data) setStats(statsRes.data);
  };

  useEffect(() => { fetchAll(); }, [numMatchId]);

  // Supabase Realtime — listen for new ball events, innings updates, match updates, player stats
  useEffect(() => {
    const channel = supabase
      .channel(`live-match-${numMatchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ball_events", filter: `match_id=eq.${numMatchId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "innings", filter: `match_id=eq.${numMatchId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${numMatchId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "player_stats", filter: `match_id=eq.${numMatchId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [numMatchId]);

  if (!match) return (
    <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
    </div>
  );

  const teamName = (t: string) => t === "A" ? match.team_a_name : match.team_b_name;
  const getPlayerName = (id: number) => players.find((p) => p.player_id === id)?.name || "?";
  const getPlayer = (id: number) => players.find((p) => p.player_id === id);
  const motmName = match.man_of_match ? getPlayerName(match.man_of_match) : null;

  const currentInnings = innings.find((i) => i.innings_number === match.current_innings);
  const inn1 = innings.find((i) => i.innings_number === 1);
  const inn2 = innings.find((i) => i.innings_number === 2);

  const battingStats = stats
    .filter((s) => players.find((p) => p.player_id === s.player_id)?.team === (currentInnings?.team || "A"))
    .sort((a, b) => b.runs_scored - a.runs_scored);
  const bowlingStats = stats
    .filter((s) => players.find((p) => p.player_id === s.player_id)?.team !== (currentInnings?.team || "A"))
    .filter((s) => s.runs_conceded > 0 || s.wickets_taken > 0)
    .sort((a, b) => b.wickets_taken - a.wickets_taken);
  const teamAPlayers = players.filter((player) => player.team === "A");
  const teamBPlayers = players.filter((player) => player.team === "B");

  // Compute bowler ball counts from ball_events
  const bowlerBallCounts: Record<number, number> = {};
  for (const b of balls) {
    if (b.extra_type === "none" || b.extra_type === undefined) {
      bowlerBallCounts[b.bowler_id] = (bowlerBallCounts[b.bowler_id] || 0) + 1;
    }
  }
  const getBowlerOvers = (id: number) => {
    const totalBalls = bowlerBallCounts[id] || 0;
    return `${Math.floor(totalBalls / 6)}.${totalBalls % 6}`;
  };

  const lastBall = balls[0];
  const lastBallText = lastBall
    ? lastBall.wicket_type !== "none"
      ? `W (${lastBall.wicket_type.replace("_", " ")})`
      : lastBall.extra_type !== "none"
      ? `${lastBall.extra_type} +${lastBall.runs}`
      : `${lastBall.runs}`
    : null;

  // Check if next ball is a free hit (last ball was a no_ball)
  const isNextFreeHit = lastBall && lastBall.extra_type === "no_ball";

  // Build dismissal description
  const getDismissalText = (ball: typeof lastBall) => {
    if (!ball || ball.wicket_type === "none") return null;
    const batter = getPlayerName(ball.batsman_id);
    const bowler = getPlayerName(ball.bowler_id);
    switch (ball.wicket_type) {
      case "bowled":
        return `🏏 ${bowler} bowled ${batter}`;
      case "caught": {
        const fielder = ball.caught_by ? getPlayerName(ball.caught_by) : "?";
        const quality = ball.catch_quality ? ` (${ball.catch_quality} catch)` : "";
        return `🧤 ${batter} c ${fielder} b ${bowler}${quality}`;
      }
      case "run_out":
        return `🏃 ${batter} run out`;
      case "hit_wicket":
        return `💥 ${batter} hit wicket b ${bowler}`;
      default:
        return `${batter} out (${ball.wicket_type})`;
    }
  };

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-amber-500/[0.04] blur-[100px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <button onClick={() => navigate(-1)} className="text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            {match.status === "ongoing" && <Wifi className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />}
            <span className="text-sm font-bold text-white/70">
              {match.status === "ongoing" ? "LIVE" : match.status === "completed" ? "COMPLETED" : "NOT STARTED"}
            </span>
          </div>
          <div />
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-2xl px-4 py-6">
        {/* Match Header */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 mb-6 animate-fade-up">
          <div className="text-center mb-4">
            <span className="text-xs font-bold text-white/30 uppercase">{match.match_type} · {match.total_overs} Overs</span>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-3 items-center">
            <div className="text-center">
              <h3 className="text-lg font-extrabold text-white">{match.team_a_name}</h3>
              {inn1 && (
                <p className="text-2xl font-black mt-1">
                  <span className={inn1.team === "A" ? "text-emerald-400" : "text-white"}>{inn1.runs}</span>
                  <span className="text-white/30 text-lg">/{inn1.wickets}</span>
                </p>
              )}
              {inn1 && <p className="text-xs text-white/40">{inn1.overs}.{inn1.balls} ov</p>}
            </div>
            <div className="text-center">
              <span className="text-xs font-bold text-white/20 bg-white/[0.04] px-3 py-1 rounded-full">VS</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-extrabold text-white">{match.team_b_name}</h3>
              {inn2 && (
                <p className="text-2xl font-black mt-1">
                  <span className={inn2.team === "B" ? "text-emerald-400" : "text-white"}>{inn2.runs}</span>
                  <span className="text-white/30 text-lg">/{inn2.wickets}</span>
                </p>
              )}
              {inn2 && <p className="text-xs text-white/40">{inn2.overs}.{inn2.balls} ov</p>}
            </div>
          </div>

          {/* Winner / Target */}
          {match.status === "completed" && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-bold text-emerald-400">
                  {match.winner === "tie" ? "Match Tied!" : `${teamName(match.winner!)} wins!`}
                </span>
              </div>
              {motmName && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-400/70">
                  <Award className="h-3.5 w-3.5" /> Man of the Match: <span className="font-bold">{motmName}</span>
                </div>
              )}
            </div>
          )}
          {match.status === "ongoing" && match.current_innings === 2 && inn1 && currentInnings && (() => {
            const target = inn1.runs + 1;
            const needed = target - currentInnings.runs;
            const ballsRemaining = (match.total_overs * 6) - (currentInnings.overs * 6 + currentInnings.balls);
            return (
              <div className={`mt-3 text-center text-xs rounded-lg px-3 py-1.5 font-semibold ${
                needed <= 0 ? 'text-emerald-400/90 bg-emerald-500/10' : 'text-amber-400/80 bg-amber-500/10'
              }`}>
                {needed <= 0
                  ? `🏆 ${teamName(currentInnings.team)} won!`
                  : `Target: ${target} · Need ${needed} from ${ballsRemaining} balls`}
              </div>
            );
          })()}
        </div>

        {/* FREE HIT Banner for Live Viewers */}
        {isNextFreeHit && match.status === "ongoing" && (
          <div className="mb-4 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 p-4 animate-pulse">
            <div className="flex items-center justify-center gap-3">
              <Zap className="h-6 w-6 text-amber-400" />
              <span className="text-xl font-black text-amber-400 tracking-wide">🔥 FREE HIT</span>
              <Zap className="h-6 w-6 text-amber-400" />
            </div>
            <p className="text-center text-xs text-amber-300/70 mt-1 font-medium">
              Next delivery is a free hit — only run out is possible
            </p>
          </div>
        )}

        {/* Last Ball */}
        {lastBall && match.status === "ongoing" && (
          <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Last Ball</h4>
            <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
              lastBall.wicket_type !== "none"
                ? "bg-red-500/[0.06] border-red-500/20"
                : "bg-white/[0.03] border-white/[0.06]"
            }`}>
              <div className={`flex-shrink-0 flex items-center justify-center text-sm font-black ${
                lastBall.wicket_type !== "none"
                  ? "h-10 min-w-[2.75rem] px-2 rounded-lg bg-red-500/25 text-red-400 border border-red-500/40"
                  : lastBall.runs >= 4
                  ? "h-10 w-10 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "h-10 w-10 rounded-full bg-white/[0.06] text-white border border-white/[0.06]"
              }`}>
                {lastBallText}
              </div>
              <div className="text-xs text-white/50 flex-1 pt-0.5">
                <span className="font-semibold text-white/70">{getPlayerName(lastBall.batsman_id)}</span> off{" "}
                <span className="font-semibold text-white/70">{getPlayerName(lastBall.bowler_id)}</span>
                <span className="text-white/30"> · Over {lastBall.over_number}.{lastBall.ball_number + 1}</span>
                {lastBall.is_free_hit && (
                  <span className="ml-2 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">FREE HIT</span>
                )}
                {/* Dismissal description */}
                {getDismissalText(lastBall) && (
                  <div className="mt-1.5 text-xs font-semibold text-red-400/90">
                    {getDismissalText(lastBall)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Balls — Grouped by Over */}
        {balls.length > 0 && (
          <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Recent Deliveries</h4>
            {(() => {
              // Group balls by over_number, show only current innings
              const currentInnId = currentInnings?.id;
              const inningsBalls = balls.filter(b => b.innings_id === currentInnId || !currentInnId);
              const overMap = new Map<number, typeof balls>();
              for (const b of inningsBalls) {
                const arr = overMap.get(b.over_number) || [];
                arr.push(b);
                overMap.set(b.over_number, arr);
              }
              // Sort overs descending (latest first)
              const overs = Array.from(overMap.entries()).sort((a, b) => b[0] - a[0]);
              // Show last 3 overs max
              const recentOvers = overs.slice(0, 3);

              return (
                <div className="space-y-3">
                  {recentOvers.map(([overNum, overBalls], idx) => {
                    const sortedBalls = [...overBalls].sort((a, b) => a.ball_number - b.ball_number);
                    const overRuns = overBalls.reduce((sum, b) => sum + b.runs + (b.extra_type !== "none" ? 1 : 0), 0);
                    const overWickets = overBalls.filter(b => b.wicket_type !== "none").length;
                    return (
                      <div key={overNum} className={`rounded-xl border px-3 py-2.5 ${idx === 0 ? "border-white/[0.08] bg-white/[0.03]" : "border-white/[0.04] bg-white/[0.01] opacity-60"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-white/50 uppercase">Over {overNum + 1}</span>
                          <span className="text-[10px] font-bold text-emerald-400/70">
                            {overRuns} runs{overWickets > 0 ? ` · ${overWickets}W` : ""}
                          </span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {sortedBalls.map((b) => (
                            <div
                              key={b.id}
                              className={`relative flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                                b.wicket_type !== "none"
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : b.extra_type !== "none"
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                  : b.is_free_hit
                                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                                  : b.runs >= 4
                                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                  : "bg-white/[0.04] text-white/60 border border-white/[0.06]"
                              }`}
                            >
                              {b.wicket_type !== "none" ? "W" : b.extra_type !== "none" ? b.extra_type[0].toUpperCase() : b.is_free_hit ? `${b.runs}` : b.runs}
                              {b.is_free_hit && b.wicket_type === "none" && b.extra_type === "none" && (
                                <span className="absolute -top-1 -right-1 text-[7px] font-black text-amber-400 bg-amber-500/20 rounded px-0.5">FH</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
        {battingStats.length > 0 && (
          <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              Batting — {teamName(currentInnings?.team || "A")}
            </h4>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="grid grid-cols-5 text-[10px] font-bold text-white/30 uppercase px-4 py-2 border-b border-white/[0.04]">
                <span className="col-span-2">Batter</span>
                <span className="text-center">R</span>
                <span className="text-center">B</span>
                <span className="text-center">4s/6s</span>
              </div>
              {battingStats.filter((s) => s.balls_faced > 0 || s.runs_scored > 0).map((s) => (
                <div key={s.player_id} className="grid grid-cols-5 text-sm px-4 py-2 border-b border-white/[0.02] last:border-0">
                  <div className="col-span-2 min-w-0">
                    <PlayerChip player={getPlayer(s.player_id)} />
                  </div>
                  <span className="text-center font-bold text-white">{s.runs_scored}</span>
                  <span className="text-center text-white/40">{s.balls_faced}</span>
                  <span className="text-center text-white/40">{s.fours}/{s.sixes}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bowling Card */}
        {bowlingStats.length > 0 && (
          <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.25s" }}>
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              Bowling
            </h4>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="grid grid-cols-5 text-[10px] font-bold text-white/30 uppercase px-4 py-2 border-b border-white/[0.04]">
                <span className="col-span-2">Bowler</span>
                <span className="text-center">Ov</span>
                <span className="text-center">W</span>
                <span className="text-center">Runs</span>
              </div>
              {bowlingStats.map((s) => (
                <div key={s.player_id} className="grid grid-cols-5 text-sm px-4 py-2 border-b border-white/[0.02] last:border-0">
                  <div className="col-span-2 min-w-0">
                    <PlayerChip player={getPlayer(s.player_id)} />
                  </div>
                  <span className="text-center text-white/40">{getBowlerOvers(s.player_id)}</span>
                  <span className="text-center font-bold text-white">{s.wickets_taken}</span>
                  <span className="text-center text-white/40">{s.runs_conceded}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {players.length > 0 && (
          <div className="mb-6 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Playing XI</h4>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { team: "A", teamName: match.team_a_name, players: teamAPlayers },
                { team: "B", teamName: match.team_b_name, players: teamBPlayers },
              ].map((entry) => (
                <div key={entry.team} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <div className="border-b border-white/[0.04] px-4 py-3">
                    <p className="text-sm font-bold text-white">{entry.teamName}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">Cricket squad</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {entry.players.map((player) => (
                      <div key={player.player_id} className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2.5">
                        <PlayerChip player={player} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
