import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowLeft, Trophy, UserPlus, Star, Trash2, Play, Search, Filter } from "lucide-react";
import { toast } from "sonner";

interface MatchPlayer { player_id: number; team: string; is_captain: boolean; name: string; }
interface UserOption {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
}

export default function TeamSetup() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const numMatchId = Number(matchId);
  const nameRef = useRef<HTMLInputElement>(null);

  const [match, setMatch] = useState<any>(null);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B">("A");
  const [searchTerm, setSearchTerm] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string>("my_department");
  const [myDepartment, setMyDepartment] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [starting, setStarting] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Authorization check — only match creator can set up teams
  useEffect(() => {
    if (!user) return;
    const checkAuth = async () => {
      const { data } = await supabase.from("matches").select("created_by").eq("id", numMatchId).single();
      if (data && data.created_by !== user.id) {
        setAuthorized(false);
        toast.error("Only the match creator can set up teams");
        navigate(`/live/${numMatchId}`, { replace: true });
      } else {
        setAuthorized(true);
      }
    };
    checkAuth();
  }, [user, numMatchId]);

  useEffect(() => {
    if (!user) return; // Wait for auth to resolve
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

      // Check existing players for this match
      const { data: existingPlayers } = await supabase
        .from("match_players")
        .select("player_id, team, is_captain, players(name)")
        .eq("match_id", numMatchId);

      const current = (existingPlayers || []).map((mp: any) => ({
        player_id: mp.player_id, team: mp.team, is_captain: mp.is_captain,
        name: mp.players?.name || "Unknown",
      }));
      setMatchPlayers(current);

      // Auto-populate from previous matches if no players yet
      if (current.length === 0) {
        console.log("[TeamSetup] No players found, auto-populating for teams:", data.team_a_name, data.team_b_name);
        await autoPopulateFromPreviousMatches(data.team_a_name, data.team_b_name);
      }
    };
    init();
  }, [numMatchId, user]);

  // Search previous matches for same team names and auto-fill players
  const autoPopulateFromPreviousMatches = async (teamAName: string, teamBName: string) => {
    if (!user) return;
    let loaded = 0;

    for (const [teamName, team] of [[teamAName, "A"], [teamBName, "B"]] as const) {
      console.log(`[AutoPopulate] Looking for previous matches with team "${teamName}" (slot ${team})`);
      const [resA, resB] = await Promise.all([
        supabase.from("matches").select("id, team_a_name, team_b_name, created_at")
          .neq("id", numMatchId)
          .ilike("team_a_name", teamName)
          .order("created_at", { ascending: false }).limit(1),
        supabase.from("matches").select("id, team_a_name, team_b_name, created_at")
          .neq("id", numMatchId)
          .ilike("team_b_name", teamName)
          .order("created_at", { ascending: false }).limit(1),
      ]);

      console.log(`[AutoPopulate] Query results - teamA matches:`, resA.data, resA.error, `teamB matches:`, resB.data, resB.error);

      const candidates = [...(resA.data || []), ...(resB.data || [])];
      if (candidates.length === 0) { console.log(`[AutoPopulate] No previous match found for "${teamName}"`); continue; }
      candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const prevMatch = candidates[0];
      const prevTeamSide = prevMatch.team_a_name === teamName ? "A" : "B";
      console.log(`[AutoPopulate] Found match #${prevMatch.id}, team was on side ${prevTeamSide}`);

      const { data: prevPlayers, error: playersError } = await supabase
        .from("match_players")
        .select("player_id, is_captain, players(id, name)")
        .eq("match_id", prevMatch.id)
        .eq("team", prevTeamSide);

      console.log(`[AutoPopulate] Previous players:`, prevPlayers, playersError);

      if (!prevPlayers || prevPlayers.length === 0) continue;

      const newPlayers: MatchPlayer[] = [];
      for (const pp of prevPlayers) {
        const playerData = (pp as any).players;
        if (!playerData) continue;

        const { error } = await supabase.from("match_players").insert({
          match_id: numMatchId,
          player_id: pp.player_id,
          team: team,
          is_captain: pp.is_captain || false,
        });

        if (error) {
          console.error(`[AutoPopulate] Insert error for player ${playerData.name}:`, error);
        } else {
          newPlayers.push({
            player_id: pp.player_id,
            team: team,
            is_captain: pp.is_captain || false,
            name: playerData.name || "Unknown",
          });
        }
      }

      if (newPlayers.length > 0) {
        loaded += newPlayers.length;
        setMatchPlayers((prev) => [...prev, ...newPlayers]);
      }
    }

    if (loaded > 0) {
      toast.success(`Auto-loaded ${loaded} players from previous matches!`);
    } else {
      console.log("[AutoPopulate] No players were loaded");
    }
  };

  const fetchMyDepartment = async () => {
    if (!user) return;
    const { data } = await supabase.from("users").select("department").eq("id", user.id).single();
    setMyDepartment(data?.department || null);
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("users").select("department").not("department", "is", null);
    if (!data) return;
    const unique = Array.from(
      new Set(
        data
          .map((u: any) => u.department)
          .filter((d: string | null) => !!d)
      )
    ) as string[];
    setDepartments(unique);
  };

  const fetchUsers = async (term: string) => {
    const q = term.trim();
    if (!q) {
      setUserOptions([]);
      return;
    }
    setLoadingUsers(true);
    let query = supabase
      .from("users")
      .select("id, name, reg_no, department")
      .or(`name.ilike.%${q}%,reg_no.ilike.%${q}%`)
      .limit(20);

    if (departmentFilter === "my_department") {
      if (myDepartment) query = query.eq("department", myDepartment);
    } else if (departmentFilter !== "all") {
      query = query.eq("department", departmentFilter);
    }

    const { data, error } = await query;
    setLoadingUsers(false);
    if (error) {
      toast.error(error.message || "Failed to search players");
      return;
    }
    setUserOptions((data || []) as UserOption[]);
  };

  useEffect(() => {
    fetchMyDepartment();
    fetchDepartments();
  }, [user]);

  useEffect(() => {
    const id = setTimeout(() => {
      fetchUsers(searchTerm);
    }, 250);
    return () => clearTimeout(id);
  }, [searchTerm, departmentFilter, myDepartment]);

  const addUserToTeam = async (selectedUser: UserOption) => {
    if (!user) return;
    if (!selectedUser.name) return toast.error("Invalid user");

    let playerId: number | null = null;
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", selectedUser.id)
      .single();

    if (existingPlayer?.id) {
      playerId = existingPlayer.id;
    } else {
      const { data: createdPlayer, error: createErr } = await supabase
        .from("players")
        .insert({
          user_id: selectedUser.id,
          name: selectedUser.name,
          phone: null,
        })
        .select("id")
        .single();
      if (createErr || !createdPlayer) return toast.error(createErr?.message || "Failed to create player profile");
      playerId = createdPlayer.id;
    }

    const alreadyInTeam = matchPlayers.find((mp) => mp.player_id === playerId);
    if (alreadyInTeam?.team === selectedTeam) {
      toast.error(`${selectedUser.name} is already in ${selectedTeamName}`);
      return;
    }

    // If player is in opposite team, create approval request
    if (alreadyInTeam && alreadyInTeam.team !== selectedTeam) {
      const { error: reqErr } = await supabase.from("team_join_requests").insert({
        match_id: numMatchId,
        player_id: playerId,
        requested_by: user.id,
        from_team: alreadyInTeam.team,
        to_team: selectedTeam,
        status: "pending",
      });
      if (reqErr) {
        toast.error(reqErr.message || "Failed to send team switch request");
        return;
      }
      toast.success(`Request sent to ${selectedUser.name}`);
      setSearchTerm("");
      setUserOptions([]);
      return;
    }

    const { error: addErr } = await supabase.from("match_players").insert({
      match_id: numMatchId,
      player_id: playerId,
      team: selectedTeam,
      is_captain: false,
    });
    if (addErr) return toast.error(addErr.message || "Failed to add player");

    setMatchPlayers((prev) => [
      ...prev,
      { player_id: playerId as number, team: selectedTeam, is_captain: false, name: selectedUser.name as string },
    ]);
    toast.success(`${selectedUser.name} added to ${selectedTeamName}`);
    setSearchTerm("");
    setUserOptions([]);
    nameRef.current?.focus();
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
                className={`rounded-xl px-4 py-4 text-left transition-all duration-200 border-2 ${selectedTeam === team
                    ? color === "blue"
                      ? "bg-blue-500/15 border-blue-500/40 shadow-lg shadow-blue-500/10"
                      : "bg-orange-500/15 border-orange-500/40 shadow-lg shadow-orange-500/10"
                    : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]"
                  }`}
              >
                <span className={`text-base font-bold block ${selectedTeam === team
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
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <Filter className="h-4 w-4 text-white/40" />
            <span className="text-xs font-semibold text-white/40">Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/40"
            >
              <option value="my_department">My Department</option>
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/30" />
            <input
              ref={nameRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search player by name or registration number"
              autoFocus
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 placeholder:text-white/20 transition-colors"
            />

            {searchTerm.trim() && (
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/95 backdrop-blur-xl shadow-2xl">
                {loadingUsers ? (
                  <div className="px-4 py-3 text-xs text-white/40">Searching players...</div>
                ) : userOptions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-white/40">No users found for this filter.</div>
                ) : (
                  userOptions.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => addUserToTeam(u)}
                      className="w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] last:border-0"
                    >
                      <div className="text-sm font-medium text-white">{u.name || "Unnamed user"}</div>
                      <div className="text-[11px] text-white/40">
                        {u.reg_no || "No reg no"} {u.department ? `• ${u.department}` : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/20 mt-1.5">
            Players must have an account. If already in the other team, request approval is sent.
          </p>
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
                            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${mp.is_captain ? "text-amber-400 bg-amber-500/10" : "text-white/15 hover:text-amber-400 hover:bg-amber-500/10"
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
