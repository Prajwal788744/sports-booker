import { supabase } from "@/lib/supabase";

type MatchStatus = "not_started" | "ongoing" | "completed";

interface ExistingMatchRow {
  id: number;
  status: MatchStatus;
  created_at: string;
}

interface BookingTeamRow {
  team_id: number;
  user_id: string;
  is_owner: boolean;
  teams: { name: string | null } | { name: string | null }[] | null;
}

interface TeamPlayerRow {
  user_id: string;
  is_captain: boolean;
}

export interface BookingMatchResult {
  created: boolean;
  matchId: number;
  route: string;
  status: MatchStatus;
}

function getTeamName(teams: BookingTeamRow["teams"]) {
  if (Array.isArray(teams)) {
    return teams[0]?.name || null;
  }

  return teams?.name || null;
}

function pickExistingMatch(matches: ExistingMatchRow[]) {
  return (
    matches.find((match) => match.status === "ongoing") ||
    matches.find((match) => match.status === "not_started") ||
    matches[0] ||
    null
  );
}

export function getBookingMatchRoute(matchId: number, status: MatchStatus) {
  if (status === "completed") {
    return `/live/${matchId}`;
  }

  if (status === "ongoing") {
    return `/scoring/${matchId}`;
  }

  return `/team-setup/${matchId}`;
}

export async function ensureBookingMatchStarted(bookingId: number, userId: string): Promise<BookingMatchResult> {
  const { data: existingMatches, error: matchLookupError } = await supabase
    .from("matches")
    .select("id, status, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (matchLookupError) {
    throw new Error(matchLookupError.message || "Failed to check the booking match.");
  }

  const preferredMatch = pickExistingMatch((existingMatches || []) as ExistingMatchRow[]);
  if (preferredMatch) {
    return {
      created: false,
      matchId: preferredMatch.id,
      route: getBookingMatchRoute(preferredMatch.id, preferredMatch.status),
      status: preferredMatch.status,
    };
  }

  const { data: bookingTeams, error: bookingTeamsError } = await supabase
    .from("booking_teams")
    .select("team_id, user_id, is_owner, teams(name)")
    .eq("booking_id", bookingId);

  if (bookingTeamsError) {
    throw new Error(bookingTeamsError.message || "Failed to load booking teams.");
  }

  const teamRows = (bookingTeams || []) as BookingTeamRow[];
  const ownerTeam = teamRows.find((team) => team.is_owner === true) || null;
  const opponentTeam = teamRows.find((team) => team.is_owner === false) || null;
  const currentUserTeam = teamRows.find((team) => team.user_id === userId) || null;

  if (!currentUserTeam) {
    throw new Error("Save your team first before starting the match.");
  }

  if (!ownerTeam || !opponentTeam) {
    throw new Error("Both teams must be saved before the match can start.");
  }

  const [ownerPlayersRes, opponentPlayersRes] = await Promise.all([
    supabase.from("team_players").select("user_id, is_captain").eq("team_id", ownerTeam.team_id),
    supabase.from("team_players").select("user_id, is_captain").eq("team_id", opponentTeam.team_id),
  ]);

  if (ownerPlayersRes.error) {
    throw new Error(ownerPlayersRes.error.message || "Failed to load the owner team.");
  }

  if (opponentPlayersRes.error) {
    throw new Error(opponentPlayersRes.error.message || "Failed to load the opponent team.");
  }

  const ownerPlayers = (ownerPlayersRes.data || []) as TeamPlayerRow[];
  const opponentPlayers = (opponentPlayersRes.data || []) as TeamPlayerRow[];

  if (ownerPlayers.length < 2 || opponentPlayers.length < 2) {
    throw new Error("Both teams need at least 2 players before the match can start.");
  }

  const allPlayers = [
    ...ownerPlayers.map((player) => ({ ...player, team: "A" as const })),
    ...opponentPlayers.map((player) => ({ ...player, team: "B" as const })),
  ];

  const uniqueUserIds = Array.from(new Set(allPlayers.map((player) => player.user_id)));
  const { data: playerRows, error: playersError } = await supabase
    .from("players")
    .select("id, user_id")
    .in("user_id", uniqueUserIds);

  if (playersError) {
    throw new Error(playersError.message || "Failed to resolve player profiles.");
  }

  const playerIdMap = new Map((playerRows || []).map((row: { id: number; user_id: string }) => [row.user_id, row.id]));
  const missingPlayerUserIds = uniqueUserIds.filter((uid) => !playerIdMap.has(uid));

  // Auto-create missing player records instead of blocking the match
  if (missingPlayerUserIds.length > 0) {
    const { data: newPlayers, error: insertError } = await supabase
      .from("players")
      .insert(missingPlayerUserIds.map((uid) => ({ user_id: uid })))
      .select("id, user_id");

    if (insertError || !newPlayers) {
      throw new Error("Failed to create player profiles. Please try again.");
    }

    newPlayers.forEach((row: { id: number; user_id: string }) => {
      playerIdMap.set(row.user_id, row.id);
    });
  }

  const matchPlayers = allPlayers
    .map((player) => ({
      player_id: playerIdMap.get(player.user_id),
      team: player.team,
      is_captain: !!player.is_captain,
    }))
    .filter((entry): entry is { player_id: number; team: "A" | "B"; is_captain: boolean } => typeof entry.player_id === "number");

  const { data: match, error: createMatchError } = await supabase
    .from("matches")
    .insert({
      booking_id: bookingId,
      created_by: userId,
      sport_id: 1,
      match_type: "T20",
      total_overs: 20,
      team_a_name: getTeamName(ownerTeam.teams) || "Team A",
      team_b_name: getTeamName(opponentTeam.teams) || "Team B",
      status: "not_started",
    })
    .select("id")
    .single();

  if (createMatchError || !match) {
    throw new Error(createMatchError?.message || "Failed to create the booking match.");
  }

  const { error: matchPlayersError } = await supabase.from("match_players").insert(
    matchPlayers.map((player) => ({
      match_id: match.id,
      player_id: player.player_id,
      team: player.team,
      is_captain: player.is_captain,
    }))
  );

  if (matchPlayersError) {
    throw new Error(matchPlayersError.message || "Failed to load the saved teams into the match.");
  }

  const { error: statsError } = await supabase.from("player_stats").insert(
    matchPlayers.map((player) => ({
      match_id: match.id,
      player_id: player.player_id,
    }))
  );

  if (statsError) {
    throw new Error(statsError.message || "Failed to initialize player stats.");
  }

  const { error: inningsError } = await supabase.from("innings").insert([
    { match_id: match.id, innings_number: 1, team: "A", status: "ongoing" },
    { match_id: match.id, innings_number: 2, team: "B", status: "ongoing" },
  ]);

  if (inningsError) {
    throw new Error(inningsError.message || "Failed to initialize innings.");
  }

  const { error: updateMatchError } = await supabase
    .from("matches")
    .update({ status: "ongoing", current_innings: 1, batting_team: "A", bowling_team: "B" })
    .eq("id", match.id);

  if (updateMatchError) {
    throw new Error(updateMatchError.message || "Failed to start the booking match.");
  }

  return {
    created: true,
    matchId: match.id,
    route: getBookingMatchRoute(match.id, "ongoing"),
    status: "ongoing",
  };
}
