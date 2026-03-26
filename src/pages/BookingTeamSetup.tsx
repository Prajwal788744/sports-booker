import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ensureBookingMatchStarted } from "@/lib/booking-match";
import { ArrowLeft, Bookmark, Filter, Gamepad2, Search, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { formatRoleLabel, getSportProfileTeaser, normalizeSportProfile, type SportProfileRecord } from "@/lib/player-profile";

const CRICKET_SPORT_ID = 1;
const TEAM_NAME_TAKEN_MESSAGE = "This team name already belongs to another player.";

interface UserOption {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
  registration_year: number | null;
  avatar_url: string | null;
  preferred_role: string | null;
  preferred_sport_id: number | null;
  sport_profile: SportProfileRecord;
  course_code: string | null;
}

interface TeamMember extends UserOption {
  is_captain: boolean;
}

interface SavedTeam {
  id: number;
  name: string;
  members: TeamMember[];
}

interface BookingMatchState {
  ownerTeamName: string | null;
  opponentTeamName: string | null;
  bothTeamsReady: boolean;
  existingMatchId: number | null;
  existingMatchStatus: "not_started" | "ongoing" | "completed" | null;
}

interface UserProfileRow {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
  registration_year: number | null;
  avatar_url: string | null;
  preferred_role: string | null;
  preferred_sport_id: number | null;
  sport_profile: unknown;
  course_code: string | null;
}

interface TeamPlayersRow {
  team_id: number;
  user_id: string;
  is_captain: boolean | null;
  users: UserProfileRow | null;
}

interface MatchLookupRow {
  id: number;
  status: "not_started" | "ongoing" | "completed";
  created_at: string;
}

function normalizeTeamName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function ensureSingleCaptain(members: TeamMember[]) {
  let foundCaptain = false;
  const normalized = members.map((member) => {
    if (member.is_captain && !foundCaptain) {
      foundCaptain = true;
      return member;
    }

    return { ...member, is_captain: false };
  });

  if (!foundCaptain && normalized.length > 0) {
    normalized[0] = { ...normalized[0], is_captain: true };
  }

  return normalized;
}

function ensureCurrentUserMember(members: TeamMember[], currentUserProfile: UserOption | null) {
  if (!currentUserProfile) {
    return ensureSingleCaptain(members);
  }

  if (members.some((member) => member.id === currentUserProfile.id)) {
    return ensureSingleCaptain(members);
  }

  return ensureSingleCaptain([
    {
      ...currentUserProfile,
      is_captain: members.length === 0,
    },
    ...members,
  ]);
}

function getRelatedTeamName(teams: { name?: string | null } | { name?: string | null }[] | null) {
  if (Array.isArray(teams)) {
    return teams[0]?.name || null;
  }

  return teams?.name || null;
}

function sameMemberList(left: TeamMember[], right: TeamMember[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((member, index) => {
    const other = right[index];
    return (
      other &&
      member.id === other.id &&
      member.is_captain === other.is_captain &&
      member.name === other.name &&
      member.avatar_url === other.avatar_url
    );
  });
}

function mapUserOption(row: UserProfileRow): UserOption {
  return {
    id: row.id,
    name: row.name ?? null,
    reg_no: row.reg_no ?? null,
    department: row.department ?? null,
    registration_year: row.registration_year ?? null,
    avatar_url: row.avatar_url ?? null,
    preferred_role: row.preferred_role ?? null,
    preferred_sport_id: row.preferred_sport_id ?? null,
    sport_profile: normalizeSportProfile(row.sport_profile),
    course_code: row.course_code ?? null,
  };
}

function mapTeamMember(row: TeamPlayersRow): TeamMember | null {
  if (!row.users?.id) {
    return null;
  }

  return {
    ...mapUserOption(row.users),
    is_captain: !!row.is_captain,
  };
}

function PlayerAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || "Player"} className="h-11 w-11 rounded-full object-cover border border-white/10" />;
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-bold text-white/60">
      {(name || "P").slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function BookingTeamSetup() {
  const { bookingId } = useParams();
  const numBookingId = Number(bookingId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("my_department");
  const [myDepartment, setMyDepartment] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState("my_year");
  const [myYear, setMyYear] = useState<number | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [startingMatch, setStartingMatch] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [existingTeamId, setExistingTeamId] = useState<number | null>(null);
  const [persistedBookingTeamId, setPersistedBookingTeamId] = useState<number | null>(null);
  const [persistedBookingTeamName, setPersistedBookingTeamName] = useState("");
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserOption | null>(null);
  const [teamNameConflict, setTeamNameConflict] = useState<string | null>(null);
  const [bookingMatchState, setBookingMatchState] = useState<BookingMatchState>({
    ownerTeamName: null,
    opponentTeamName: null,
    bothTeamsReady: false,
    existingMatchId: null,
    existingMatchStatus: null,
  });

  const selectedIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const normalizedTeamName = normalizeTeamName(teamName);
  const matchedSavedTeam = useMemo(
    () => savedTeams.find((team) => normalizeTeamName(team.name) === normalizedTeamName) || null,
    [normalizedTeamName, savedTeams]
  );
  const backRoute = isOwner ? "/my-bookings" : "/dashboard";

  const loadSavedTeams = useCallback(async (ownerUserId: string) => {
    const { data: myTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("owner_user_id", ownerUserId)
      .eq("sport_id", CRICKET_SPORT_ID)
      .order("created_at", { ascending: false });

    if (teamsError) {
      throw new Error(teamsError.message || "Failed to load your saved teams.");
    }

    const teamIds = (myTeams || []).map((team) => Number(team.id));
    let savedTeamPlayers: TeamPlayersRow[] = [];

    if (teamIds.length > 0) {
      const { data, error } = await supabase
        .from("team_players")
        .select(
          "team_id, is_captain, user_id, users(id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code)"
        )
        .in("team_id", teamIds);

      if (error) {
        throw new Error(error.message || "Failed to load your saved team players.");
      }

      savedTeamPlayers = data || [];
    }

    const groupedSavedTeams = (myTeams || []).map((team) => ({
      id: Number(team.id),
      name: team.name,
      members: ensureSingleCaptain(
        savedTeamPlayers
          .filter((row) => Number(row.team_id) === Number(team.id))
          .map(mapTeamMember)
          .filter((member): member is TeamMember => !!member)
      ),
    }));

    setSavedTeams(groupedSavedTeams);
    return groupedSavedTeams;
  }, []);

  const refreshBookingMatchState = useCallback(async () => {
    if (!numBookingId) {
      return;
    }

    const [bookingTeamsRes, matchesRes] = await Promise.all([
      supabase.from("booking_teams").select("user_id, is_owner, teams(name)").eq("booking_id", numBookingId),
      supabase.from("matches").select("id, status, created_at").eq("booking_id", numBookingId).order("created_at", { ascending: false }),
    ]);

    const bookingTeams = (bookingTeamsRes.data || []) as Array<{
      user_id: string;
      is_owner: boolean;
      teams: { name?: string | null } | { name?: string | null }[] | null;
    }>;
    const ownerTeam = bookingTeams.find((team) => team.is_owner === true) || null;
    const opponentTeam = bookingTeams.find((team) => team.is_owner === false) || null;
    const matchRows = (matchesRes.data || []) as MatchLookupRow[];
    const preferredMatch =
      matchRows.find((match) => match.status === "ongoing") ||
      matchRows.find((match) => match.status === "not_started") ||
      matchRows[0] ||
      null;

    setBookingMatchState({
      ownerTeamName: ownerTeam ? getRelatedTeamName(ownerTeam.teams) : null,
      opponentTeamName: opponentTeam ? getRelatedTeamName(opponentTeam.teams) : null,
      bothTeamsReady: !!ownerTeam && !!opponentTeam,
      existingMatchId: preferredMatch ? Number(preferredMatch.id) : null,
      existingMatchStatus: preferredMatch?.status ?? null,
    });
  }, [numBookingId]);

  useEffect(() => {
    if (!user || !numBookingId) return;

    const init = async () => {
      try {
        const [profileRes, deptRowsRes, yearRowsRes, bookingRes] = await Promise.all([
          supabase
            .from("users")
            .select(
              "id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code"
            )
            .eq("id", user.id)
            .single(),
          supabase.from("users").select("department").not("department", "is", null),
          supabase.from("users").select("registration_year").not("registration_year", "is", null),
          supabase.from("bookings").select("user_id").eq("id", numBookingId).single(),
        ]);

        const ownProfile = profileRes.data ? mapUserOption(profileRes.data) : null;
        setCurrentUserProfile(ownProfile);
        setMyDepartment(profileRes.data?.department || null);
        setMyYear(profileRes.data?.registration_year || null);

        const uniqueDepartments = Array.from(
          new Set((deptRowsRes.data || []).map((row: { department: string | null }) => row.department).filter(Boolean))
        ) as string[];
        setDepartments(uniqueDepartments);

        const uniqueYears = Array.from(
          new Set(
            (yearRowsRes.data || [])
              .map((row: { registration_year: number | null }) => row.registration_year)
              .filter((value): value is number => typeof value === "number")
          )
        ).sort((a, b) => b - a);
        setYears(uniqueYears);

        const owner = bookingRes.data?.user_id === user.id;
        setIsOwner(owner);

        let allowed = owner;
        if (!owner) {
          const { data: requestRow } = await supabase
            .from("match_requests")
            .select("id")
            .eq("booking_id", numBookingId)
            .eq("to_user_id", user.id)
            .eq("status", "accepted")
            .maybeSingle();
          allowed = !!requestRow;
        }

        setCanEdit(allowed);
        if (!allowed) {
          toast.error("You are not allowed to manage a team for this booking.");
          navigate(owner ? "/my-bookings" : "/dashboard", { replace: true });
          return;
        }

        await loadSavedTeams(user.id);

        const { data: bookingTeam, error: bookingTeamError } = await supabase
          .from("booking_teams")
          .select("team_id, teams(id, name)")
          .eq("booking_id", numBookingId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (bookingTeamError) {
          throw new Error(bookingTeamError.message || "Failed to load the booking team.");
        }

        if (bookingTeam?.team_id) {
          const persistedTeamNameValue = getRelatedTeamName(bookingTeam.teams as { id?: number; name?: string | null } | null) || "";
          setPersistedBookingTeamId(Number(bookingTeam.team_id));
          setPersistedBookingTeamName(persistedTeamNameValue);
          setExistingTeamId(Number(bookingTeam.team_id));
          setTeamName(persistedTeamNameValue);

          const { data: teamPlayers, error: teamPlayersError } = await supabase
            .from("team_players")
            .select(
              "is_captain, user_id, users(id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code)"
            )
            .eq("team_id", bookingTeam.team_id);

          if (teamPlayersError) {
            throw new Error(teamPlayersError.message || "Failed to load the saved booking players.");
          }

          const mappedMembers = ensureCurrentUserMember(
            (teamPlayers || []).map(mapTeamMember).filter((member): member is TeamMember => !!member),
            ownProfile
          );
          setMembers(mappedMembers);
        } else {
          setPersistedBookingTeamId(null);
          setPersistedBookingTeamName("");
          setExistingTeamId(null);
          setMembers(ensureCurrentUserMember([], ownProfile));
        }

        await refreshBookingMatchState();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load the booking team setup.");
      }
    };

    void init();
  }, [loadSavedTeams, navigate, numBookingId, refreshBookingMatchState, user]);

  useEffect(() => {
    if (!canEdit || !currentUserProfile) return;

    setMembers((current) => {
      const ensuredMembers = ensureCurrentUserMember(current, currentUserProfile);
      return sameMemberList(current, ensuredMembers) ? current : ensuredMembers;
    });
  }, [canEdit, currentUserProfile]);

  useEffect(() => {
    if (!matchedSavedTeam) return;

    if (existingTeamId === matchedSavedTeam.id) {
      return;
    }

    setExistingTeamId(matchedSavedTeam.id);
    setMembers(ensureCurrentUserMember(matchedSavedTeam.members, currentUserProfile));
    setSearchTerm("");
    setUserOptions([]);
  }, [currentUserProfile, existingTeamId, matchedSavedTeam]);

  useEffect(() => {
    if (!user || !canEdit) return;

    const queryTerm = searchTerm.trim();
    if (!queryTerm) {
      setUserOptions([]);
      return;
    }

    const run = async () => {
      setLoadingUsers(true);
      let query = supabase
        .from("users")
        .select("id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code")
        .neq("id", user.id)
        .or(`name.ilike.%${queryTerm}%,reg_no.ilike.%${queryTerm}%`)
        .limit(20);

      if (departmentFilter === "my_department") {
        if (myDepartment) query = query.eq("department", myDepartment);
      } else if (departmentFilter !== "all") {
        query = query.eq("department", departmentFilter);
      }

      if (yearFilter === "my_year") {
        if (myYear) query = query.eq("registration_year", myYear);
      } else if (yearFilter !== "all") {
        query = query.eq("registration_year", Number(yearFilter));
      }

      const { data, error } = await query;
      setLoadingUsers(false);
      if (error) {
        toast.error(error.message || "Failed to search users.");
        return;
      }

      setUserOptions(
        ((data || []) as Array<Omit<UserOption, "sport_profile"> & { sport_profile: unknown }>).map((player) => ({
          ...player,
          sport_profile: normalizeSportProfile(player.sport_profile),
        }))
      );
    };

    const timeoutId = setTimeout(run, 250);
    return () => clearTimeout(timeoutId);
  }, [canEdit, departmentFilter, myDepartment, myYear, searchTerm, user, yearFilter]);

  useEffect(() => {
    if (!user || !canEdit) return;
    if (!normalizedTeamName) {
      setTeamNameConflict(null);
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, owner_user_id")
        .eq("sport_id", CRICKET_SPORT_ID)
        .ilike("name", teamName.trim());

      if (!active || error) {
        if (active && error) {
          setTeamNameConflict(null);
        }
        return;
      }

      const conflict = (data || []).find(
        (team: { id: number; name: string; owner_user_id: string }) =>
          normalizeTeamName(team.name) === normalizedTeamName && team.owner_user_id !== user.id
      );

      setTeamNameConflict(conflict ? TEAM_NAME_TAKEN_MESSAGE : null);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [canEdit, normalizedTeamName, teamName, user]);

  const loadSavedTeam = (team: SavedTeam, options?: { silent?: boolean }) => {
    setExistingTeamId(team.id);
    setTeamName(team.name);
    setMembers(ensureCurrentUserMember(team.members, currentUserProfile));
    setSearchTerm("");
    setUserOptions([]);

    if (!options?.silent) {
      toast.success(`Loaded ${team.name}.`);
    }
  };

  const addMember = (candidate: UserOption) => {
    if (selectedIds.has(candidate.id)) return;

    setMembers((current) =>
      ensureSingleCaptain([
        ...current,
        {
          ...candidate,
          is_captain: current.length === 0,
        },
      ])
    );
    setSearchTerm("");
    setUserOptions([]);
    inputRef.current?.focus();
  };

  const removeMember = (id: string) => {
    if (id === user?.id) {
      toast.error("Your name stays in your team by default.");
      return;
    }

    setMembers((current) => ensureSingleCaptain(current.filter((member) => member.id !== id)));
  };

  const setCaptain = (id: string) => {
    setMembers((current) => current.map((member) => ({ ...member, is_captain: member.id === id })));
  };

  const goToLobby = () => {
    navigate(`/match-lobby/${numBookingId}`);
  };

  const saveTeam = async () => {
    if (!user || !canEdit) return;

    const trimmedTeamName = teamName.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeTeamName(trimmedTeamName);

    if (!normalizedName) return toast.error("Enter a team name.");
    if (teamNameConflict) return toast.error(teamNameConflict);

    setSaving(true);

    try {
      const nextMembers = ensureCurrentUserMember(members, currentUserProfile);
      if (nextMembers.length < 2) {
        throw new Error("Add at least 2 players.");
      }

      const captain = nextMembers.find((member) => member.is_captain);
      if (!captain) {
        throw new Error("Choose a captain.");
      }

      const { data: conflictingTeams, error: conflictLookupError } = await supabase
        .from("teams")
        .select("id, name, owner_user_id")
        .eq("sport_id", CRICKET_SPORT_ID)
        .ilike("name", trimmedTeamName);

      if (conflictLookupError) {
        throw new Error(conflictLookupError.message || "Failed to verify the team name.");
      }

      const conflict = (conflictingTeams || []).find(
        (team: { id: number; name: string; owner_user_id: string }) =>
          normalizeTeamName(team.name) === normalizedName && team.owner_user_id !== user.id
      );
      if (conflict) {
        setTeamNameConflict(TEAM_NAME_TAKEN_MESSAGE);
        throw new Error(TEAM_NAME_TAKEN_MESSAGE);
      }

      const resolvedSavedTeam = savedTeams.find((team) => normalizeTeamName(team.name) === normalizedName) || null;
      const editingPersistedTeam =
        !!persistedBookingTeamId && normalizeTeamName(persistedBookingTeamName) === normalizedName;

      let teamId = resolvedSavedTeam?.id || (editingPersistedTeam ? persistedBookingTeamId : null);

      if (!teamId) {
        const { data: newTeam, error } = await supabase
          .from("teams")
          .insert({ owner_user_id: user.id, name: trimmedTeamName, sport_id: CRICKET_SPORT_ID })
          .select("id")
          .single();

        if (error || !newTeam) {
          if (error?.message?.toLowerCase().includes("duplicate")) {
            setTeamNameConflict(TEAM_NAME_TAKEN_MESSAGE);
            throw new Error(TEAM_NAME_TAKEN_MESSAGE);
          }

          throw new Error(error?.message || "Failed to create the team.");
        }

        teamId = Number(newTeam.id);
      }

      const { error: updateTeamError } = await supabase
        .from("teams")
        .update({ name: trimmedTeamName, sport_id: CRICKET_SPORT_ID })
        .eq("id", teamId)
        .eq("owner_user_id", user.id);

      if (updateTeamError) {
        if (updateTeamError.message?.toLowerCase().includes("duplicate")) {
          setTeamNameConflict(TEAM_NAME_TAKEN_MESSAGE);
          throw new Error(TEAM_NAME_TAKEN_MESSAGE);
        }

        throw new Error(updateTeamError.message || "Failed to update the team.");
      }

      const { error: bookingTeamError } = await supabase.from("booking_teams").upsert(
        { booking_id: numBookingId, user_id: user.id, team_id: teamId, is_owner: isOwner },
        { onConflict: "booking_id,user_id" }
      );

      if (bookingTeamError) {
        throw new Error(bookingTeamError.message || "Failed to attach the team to the booking.");
      }

      const { data: bookingTeams, error: bookingTeamsError } = await supabase
        .from("booking_teams")
        .select("team_id, user_id")
        .eq("booking_id", numBookingId);

      if (bookingTeamsError) {
        throw new Error(bookingTeamsError.message || "Failed to inspect booking teams.");
      }

      const linkedTeamIds = Array.from(
        new Set((bookingTeams || []).map((row) => Number(row.team_id)).filter((value) => Number.isFinite(value)))
      );

      const linkedPlayersRes = linkedTeamIds.length
        ? await supabase.from("team_players").select("team_id, user_id").in("team_id", linkedTeamIds)
        : { data: [] as Array<{ team_id: number; user_id: string }>, error: null };

      if (linkedPlayersRes.error) {
        throw new Error(linkedPlayersRes.error.message || "Failed to load booking player assignments.");
      }

      const bookingTeamLookup = new Map<string, number>();
      (linkedPlayersRes.data || []).forEach((row) => {
        if (!bookingTeamLookup.has(row.user_id)) {
          bookingTeamLookup.set(row.user_id, Number(row.team_id));
        }
      });

      const directMembers = nextMembers.filter((member) => {
        const currentBookingTeamId = bookingTeamLookup.get(member.id);
        return !currentBookingTeamId || currentBookingTeamId === teamId;
      });
      const switchMembers = nextMembers.filter((member) => {
        const currentBookingTeamId = bookingTeamLookup.get(member.id);
        return !!currentBookingTeamId && currentBookingTeamId !== teamId;
      });

      const { error: clearPlayersError } = await supabase.from("team_players").delete().eq("team_id", teamId);
      if (clearPlayersError) {
        throw new Error(clearPlayersError.message || "Failed to refresh the saved team players.");
      }

      const directInserts = directMembers.map((member) => ({
        team_id: teamId,
        user_id: member.id,
        is_captain: member.is_captain,
      }));

      if (directInserts.length > 0) {
        const { error: insertPlayersError } = await supabase.from("team_players").insert(directInserts);
        if (insertPlayersError) {
          throw new Error(insertPlayersError.message || "Failed to save the team players.");
        }
      }

      const directMemberIds = directMembers.map((member) => member.id).filter((id) => id !== user.id);
      if (directMemberIds.length > 0) {
        // Check existing invites/notifications
        const { data: existingInvites } = await supabase
          .from("booking_player_requests")
          .select("user_id")
          .eq("booking_id", numBookingId)
          .eq("team_id", teamId)
          .eq("request_type", "invite")
          .in("user_id", directMemberIds);

        const alreadyInvited = new Set((existingInvites || []).map((row) => row.user_id));

        // Create invite requests for registered users (not already invited)
        const inviteRows = directMembers
          .filter((member) => member.id !== user.id && !alreadyInvited.has(member.id))
          .map((member) => ({
            booking_id: numBookingId,
            team_id: teamId,
            source_team_id: null,
            requested_by: user.id,
            user_id: member.id,
            request_type: "invite" as const,
            status: "pending" as const,
          }));

        if (inviteRows.length > 0) {
          await supabase.from("booking_player_requests").insert(inviteRows);
        }

        // Send notifications for invites
        const { data: existingNotifications } = await supabase
          .from("notifications")
          .select("recipient_user_id")
          .eq("booking_id", numBookingId)
          .eq("team_id", teamId)
          .eq("type", "team_invite")
          .in("recipient_user_id", directMemberIds);

        const alreadyNotified = new Set((existingNotifications || []).map((row) => row.recipient_user_id));
        const notificationRows = directMembers
          .filter((member) => member.id !== user.id && !alreadyNotified.has(member.id))
          .map((member) => ({
            recipient_user_id: member.id,
            actor_user_id: user.id,
            booking_id: numBookingId,
            team_id: teamId,
            type: "team_invite",
            title: "You have been invited to join a team",
            message: `You have been invited to join ${trimmedTeamName} for booking #${numBookingId}.`,
            action_url: "/dashboard",
            metadata: {
              captain: captain.name,
              teamName: trimmedTeamName,
              bookingId: numBookingId,
            },
          }));

        if (notificationRows.length > 0) {
          await supabase.from("notifications").insert(notificationRows);
        }
      }

      let requestedSwitches = 0;
      if (switchMembers.length > 0) {
        const sourceTeamIds = Array.from(
          new Set(switchMembers.map((member) => bookingTeamLookup.get(member.id)).filter((value): value is number => !!value))
        );

        const sourceTeamsRes = sourceTeamIds.length
          ? await supabase.from("teams").select("id, name").in("id", sourceTeamIds)
          : { data: [] as Array<{ id: number; name: string }>, error: null };

        if (sourceTeamsRes.error) {
          throw new Error(sourceTeamsRes.error.message || "Failed to inspect source teams.");
        }

        const sourceTeamNameMap = new Map((sourceTeamsRes.data || []).map((team) => [Number(team.id), team.name]));

        const { data: existingRequests, error: existingRequestsError } = await supabase
          .from("booking_player_requests")
          .select("user_id, source_team_id")
          .eq("booking_id", numBookingId)
          .eq("team_id", teamId)
          .eq("status", "pending");

        if (existingRequestsError) {
          throw new Error(existingRequestsError.message || "Failed to inspect existing switch requests.");
        }

        const pendingKeys = new Set(
          (existingRequests || []).map((request) => `${request.user_id}:${request.source_team_id || "none"}`)
        );

        const switchRequestRows = switchMembers
          .map((member) => {
            const sourceTeamId = bookingTeamLookup.get(member.id);
            if (!sourceTeamId) return null;

            const requestKey = `${member.id}:${sourceTeamId}`;
            if (pendingKeys.has(requestKey)) return null;

            return {
              booking_id: numBookingId,
              team_id: teamId,
              source_team_id: sourceTeamId,
              requested_by: user.id,
              user_id: member.id,
              request_type: "team_switch",
              status: "pending",
            };
          })
          .filter(Boolean) as Array<Record<string, string | number>>;

        if (switchRequestRows.length > 0) {
          const { error: switchRequestError } = await supabase.from("booking_player_requests").insert(switchRequestRows);
          if (switchRequestError) {
            throw new Error(switchRequestError.message || "Failed to send player switch requests.");
          }

          requestedSwitches = switchRequestRows.length;

          const switchNotifications = switchMembers
            .map((member) => {
              const sourceTeamId = bookingTeamLookup.get(member.id);
              if (!sourceTeamId) return null;

              const requestKey = `${member.id}:${sourceTeamId}`;
              if (pendingKeys.has(requestKey)) return null;

              return {
                recipient_user_id: member.id,
                actor_user_id: user.id,
                booking_id: numBookingId,
                team_id: teamId,
                type: "team_switch",
                title: "Team switch request",
                message: `${trimmedTeamName} wants you to leave ${sourceTeamNameMap.get(sourceTeamId) || "your current team"} and join them for booking #${numBookingId}.`,
                action_url: "/dashboard",
                metadata: {
                  bookingId: numBookingId,
                  targetTeamId: teamId,
                  targetTeamName: trimmedTeamName,
                  sourceTeamId,
                  sourceTeamName: sourceTeamNameMap.get(sourceTeamId) || "Current team",
                },
              };
            })
            .filter(Boolean);

          if (switchNotifications.length > 0) {
            await supabase.from("notifications").insert(switchNotifications);
          }
        }
      }

      const updatedSavedTeam: SavedTeam = {
        id: teamId,
        name: trimmedTeamName,
        members: nextMembers,
      };

      setSavedTeams((current) => [updatedSavedTeam, ...current.filter((team) => team.id !== teamId)]);
      setPersistedBookingTeamId(teamId);
      setPersistedBookingTeamName(trimmedTeamName);
      setExistingTeamId(teamId);
      setTeamName(trimmedTeamName);
      setMembers(nextMembers);
      setSearchTerm("");
      setUserOptions([]);
      setTeamNameConflict(null);

      await refreshBookingMatchState();

      const summary = [
        `${directMembers.length} player${directMembers.length === 1 ? "" : "s"} ready in ${trimmedTeamName}`,
        requestedSwitches > 0 ? `${requestedSwitches} switch request${requestedSwitches === 1 ? "" : "s"} sent` : null,
      ]
        .filter(Boolean)
        .join(" • ");

      toast.success(summary || "Team saved successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the team.");
    } finally {
      setSaving(false);
    }
  };

  const lobbyButtonLabel = bookingMatchState.existingMatchId
    ? bookingMatchState.existingMatchStatus === "completed"
      ? "Open Scorecard"
      : "Open Match"
    : "Go to Match Lobby";

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <button onClick={() => navigate(backRoute)} className="mb-5 flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Build Team</h1>
            <p className="mt-1 text-sm text-white/40">
              Booking #{numBookingId} • {isOwner ? "Booking owner team" : "Opponent captain team"}
            </p>
          </div>
          {matchedSavedTeam && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
              <Bookmark className="h-3.5 w-3.5" />
              Saved squad linked: {matchedSavedTeam.name}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-white/40" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Booking Readiness</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Owner Team</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {bookingMatchState.ownerTeamName || "Waiting for the booking owner"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Opponent Team</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {bookingMatchState.opponentTeamName || "Waiting for the opponent captain"}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/45">
            {bookingMatchState.existingMatchId
              ? "A booking match already exists. You can open it below."
              : bookingMatchState.bothTeamsReady
              ? "Both teams are saved. The booking owner and the accepted opponent captain can start the match."
              : "Save both team names first. Once each side saves a team, either captain can start the match here."}
          </p>
        </div>

        {savedTeams.length > 0 && (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-white/40" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Saved Teams</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {savedTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => loadSavedTeam(team)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    existingTeamId === team.id
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                      : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"
                  }`}
                >
                  {team.name} <span className="text-white/30">({team.members.length})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-white/40">Team Name</label>
          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            className={`w-full rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition-colors ${
              teamNameConflict ? "border-red-500/40" : "border-white/[0.08] focus:border-emerald-500/40"
            }`}
            placeholder="Type your saved team name or create a new one"
          />
          <p className="mt-2 text-xs text-white/25">
            Typing one of your saved team names will pull that squad back automatically. Other users cannot reuse your team name.
          </p>
          {teamNameConflict && <p className="mt-2 text-xs font-semibold text-red-400">{teamNameConflict}</p>}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Filter className="h-4 w-4 text-white/40" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Player Filters</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 text-sm text-white outline-none"
              >
                <option value="my_department">My Department</option>
                <option value="all">All Departments</option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>

              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 text-sm text-white outline-none"
              >
                <option value="my_year">My Year</option>
                <option value="all">All Years</option>
                {years.map((year) => (
                  <option key={year} value={year.toString()}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/30" />
              <input
                ref={inputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search signed-up users by name or registration number"
                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-emerald-500/40"
              />

              {searchTerm.trim() && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-black/95 shadow-2xl">
                  {loadingUsers ? (
                    <div className="px-4 py-3 text-xs text-white/40">Searching players...</div>
                  ) : userOptions.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-white/40">No players found for this filter.</div>
                  ) : (
                    userOptions.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => addMember(player)}
                        className="flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] last:border-0"
                      >
                        <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{player.name || "Unnamed user"}</div>
                          <div className="mt-1 truncate text-[11px] text-white/40">
                            {player.reg_no || "No reg no"}
                            {player.department ? ` • ${player.department}` : ""}
                            {typeof player.registration_year === "number" ? ` • ${player.registration_year}` : ""}
                          </div>
                          <div className="mt-1 text-[11px] text-emerald-400/70">
                            {getSportProfileTeaser(player.preferred_sport_id, player.sport_profile, player.preferred_role) ||
                              (player.preferred_role ? formatRoleLabel(player.preferred_role) : "Role not set yet")}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-white/25">
              Your own profile is added automatically. If a selected player already belongs to the other team for this booking,
              they will receive an accept or reject request instead of being moved instantly.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-white/40" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Team Preview</span>
            </div>
            <div className="mt-4 space-y-3">
              {members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center text-sm text-white/30">
                  No players selected yet.
                </div>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] px-3 py-3">
                    <PlayerAvatar name={member.name} avatarUrl={member.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-white">{member.name || "Unnamed user"}</div>
                        {member.id === user?.id && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                            You
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-white/40">
                        {member.reg_no || "No reg no"}
                        {member.department ? ` • ${member.department}` : ""}
                        {typeof member.registration_year === "number" ? ` • ${member.registration_year}` : ""}
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-400/70">
                        {getSportProfileTeaser(member.preferred_sport_id, member.sport_profile, member.preferred_role) ||
                          (member.preferred_role ? formatRoleLabel(member.preferred_role) : "Role not set yet")}
                      </div>
                    </div>
                    <button
                      onClick={() => setCaptain(member.id)}
                      className={`rounded-xl p-2 transition-colors ${
                        member.is_captain ? "bg-amber-500/20 text-amber-400" : "text-white/30 hover:text-amber-400"
                      }`}
                      title="Set captain"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeMember(member.id)}
                      disabled={member.id === user?.id}
                      className={`rounded-xl p-2 transition-colors ${
                        member.id === user?.id ? "cursor-not-allowed text-white/10" : "text-white/30 hover:text-red-400"
                      }`}
                      title={member.id === user?.id ? "You are added automatically" : "Remove player"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            onClick={saveTeam}
            disabled={saving || startingMatch}
            className="rounded-2xl bg-emerald-500 py-6 text-base font-semibold text-white hover:bg-emerald-600"
          >
            {saving ? "Saving Team..." : "Save Team"}
          </Button>
          <Button
            onClick={goToLobby}
            disabled={saving}
            variant="outline"
            className="rounded-2xl border-emerald-500/25 bg-transparent py-6 text-base font-semibold text-emerald-400 hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            {lobbyButtonLabel}
          </Button>
        </div>
      </main>
    </div>
  );
}
