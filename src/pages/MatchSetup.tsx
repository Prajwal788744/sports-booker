import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  Search,
  Send,
  Shield,
  Star,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatRoleLabel,
  getSportProfileTeaser,
  normalizeSportProfile,
  type SportProfileRecord,
} from "@/lib/player-profile";

// ─── Constants & Types ──────────────────────────────────────────────

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

interface OpponentUserOption {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
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

// ─── Helper Functions ───────────────────────────────────────────────

async function fetchTeamPlayersWithUsers(teamIds: number[]): Promise<TeamPlayersRow[]> {
  if (teamIds.length === 0) return [];

  const { data: tpRows, error: tpError } = await supabase
    .from("team_players")
    .select("team_id, is_captain, user_id")
    .in("team_id", teamIds);

  if (tpError || !tpRows || tpRows.length === 0) return [];

  const userIds = Array.from(new Set(tpRows.map((r) => r.user_id)));
  const { data: userRows } = await supabase
    .from("users")
    .select(
      "id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code"
    )
    .in("id", userIds);

  const userMap = new Map(
    (userRows || []).map((u) => [u.id as string, u as UserProfileRow])
  );

  return tpRows.map((row) => ({
    team_id: row.team_id,
    user_id: row.user_id,
    is_captain: row.is_captain,
    users: userMap.get(row.user_id) || null,
  }));
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

function ensureCurrentUserMember(
  members: TeamMember[],
  currentUserProfile: UserOption | null
) {
  if (!currentUserProfile) return ensureSingleCaptain(members);
  if (members.some((member) => member.id === currentUserProfile.id))
    return ensureSingleCaptain(members);

  return ensureSingleCaptain([
    { ...currentUserProfile, is_captain: members.length === 0 },
    ...members,
  ]);
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
  if (!row.users?.id) return null;
  return { ...mapUserOption(row.users), is_captain: !!row.is_captain };
}

function getRelatedTeamName(
  teams: { name?: string | null } | { name?: string | null }[] | null
) {
  if (Array.isArray(teams)) return teams[0]?.name || null;
  return teams?.name || null;
}

function sameMemberList(left: TeamMember[], right: TeamMember[]) {
  if (left.length !== right.length) return false;
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

function PlayerAvatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl)
    return (
      <img
        src={avatarUrl}
        alt={name || "Player"}
        className="h-11 w-11 rounded-full object-cover border border-white/10"
      />
    );
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-bold text-white/60">
      {(name || "P").slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function MatchSetup() {
  const { bookingId } = useParams();
  const numBookingId = Number(bookingId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Team state ──
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
  const [existingTeamId, setExistingTeamId] = useState<number | null>(null);
  const [persistedBookingTeamId, setPersistedBookingTeamId] = useState<number | null>(null);
  const [persistedBookingTeamName, setPersistedBookingTeamName] = useState("");
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserOption | null>(null);
  const [teamNameConflict, setTeamNameConflict] = useState<string | null>(null);
  const [teamSaved, setTeamSaved] = useState(false);

  // ── Opponent state ──
  const [opponentSearch, setOpponentSearch] = useState("");
  const [opponentResults, setOpponentResults] = useState<OpponentUserOption[]>([]);
  const [opponentLoading, setOpponentLoading] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState<OpponentUserOption | null>(null);
  const [challengeSent, setChallengeSent] = useState(false);
  const [existingOpponent, setExistingOpponent] = useState<OpponentUserOption | null>(null);

  // ── Global state ──
  const [saving, setSaving] = useState(false);
  const [sendingChallenge, setSendingChallenge] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const selectedIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const normalizedTeamName = normalizeTeamName(teamName);
  const matchedSavedTeam = useMemo(
    () =>
      savedTeams.find((t) => normalizeTeamName(t.name) === normalizedTeamName) || null,
    [normalizedTeamName, savedTeams]
  );

  // ── Load saved teams ──
  const loadSavedTeams = useCallback(async (ownerUserId: string) => {
    const { data: myTeams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("owner_user_id", ownerUserId)
      .eq("sport_id", CRICKET_SPORT_ID)
      .order("created_at", { ascending: false });

    if (teamsError) throw new Error(teamsError.message || "Failed to load your saved teams.");

    const teamIds = (myTeams || []).map((t) => Number(t.id));
    let savedTeamPlayers: TeamPlayersRow[] = [];
    if (teamIds.length > 0) {
      savedTeamPlayers = await fetchTeamPlayersWithUsers(teamIds);
    }

    const groupedSavedTeams = (myTeams || []).map((team) => ({
      id: Number(team.id),
      name: team.name,
      members: ensureSingleCaptain(
        savedTeamPlayers
          .filter((row) => Number(row.team_id) === Number(team.id))
          .map(mapTeamMember)
          .filter((m): m is TeamMember => !!m)
      ),
    }));

    setSavedTeams(groupedSavedTeams);
    return groupedSavedTeams;
  }, []);

  // ── Init ──
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
          new Set(
            (deptRowsRes.data || [])
              .map((row: { department: string | null }) => row.department)
              .filter(Boolean)
          )
        ) as string[];
        setDepartments(uniqueDepartments);

        const uniqueYears = Array.from(
          new Set(
            (yearRowsRes.data || [])
              .map((row: { registration_year: number | null }) => row.registration_year)
              .filter((v): v is number => typeof v === "number")
          )
        ).sort((a, b) => b - a);
        setYears(uniqueYears);

        // Verify ownership
        if (bookingRes.data?.user_id !== user.id) {
          toast.error("Only the booking owner can set up a match here.");
          navigate("/my-bookings", { replace: true });
          return;
        }

        await loadSavedTeams(user.id);

        // Load existing team for this booking
        const { data: bookingTeam } = await supabase
          .from("booking_teams")
          .select("team_id, teams(id, name)")
          .eq("booking_id", numBookingId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (bookingTeam?.team_id) {
          const persistedName =
            getRelatedTeamName(
              bookingTeam.teams as { id?: number; name?: string | null } | null
            ) || "";
          setPersistedBookingTeamId(Number(bookingTeam.team_id));
          setPersistedBookingTeamName(persistedName);
          setExistingTeamId(Number(bookingTeam.team_id));
          setTeamName(persistedName);
          setTeamSaved(true);

          const teamPlayers = await fetchTeamPlayersWithUsers([Number(bookingTeam.team_id)]);
          setMembers(
            ensureCurrentUserMember(
              teamPlayers.map(mapTeamMember).filter((m): m is TeamMember => !!m),
              ownProfile
            )
          );
        } else {
          setMembers(ensureCurrentUserMember([], ownProfile));
        }

        // Check existing opponent match request
        const { data: existingReq } = await supabase
          .from("match_requests")
          .select("id, to_user_id, status")
          .eq("booking_id", numBookingId)
          .eq("from_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingReq) {
          const { data: oppProfile } = await supabase
            .from("users")
            .select("id, name, reg_no, department")
            .eq("id", existingReq.to_user_id)
            .single();

          if (oppProfile) {
            setExistingOpponent(oppProfile as OpponentUserOption);
            setSelectedOpponent(oppProfile as OpponentUserOption);
            if (existingReq.status === "pending" || existingReq.status === "accepted") {
              setChallengeSent(true);
            }
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load match setup."
        );
      } finally {
        setPageLoading(false);
      }
    };

    void init();
  }, [loadSavedTeams, navigate, numBookingId, user]);

  // Ensure current user is always in team
  useEffect(() => {
    if (!currentUserProfile) return;
    setMembers((current) => {
      const ensuredMembers = ensureCurrentUserMember(current, currentUserProfile);
      return sameMemberList(current, ensuredMembers) ? current : ensuredMembers;
    });
  }, [currentUserProfile]);

  // Load saved team when team name matches
  useEffect(() => {
    if (!matchedSavedTeam) return;
    if (existingTeamId === matchedSavedTeam.id) return;
    setExistingTeamId(matchedSavedTeam.id);
    setMembers(ensureCurrentUserMember(matchedSavedTeam.members, currentUserProfile));
    setSearchTerm("");
    setUserOptions([]);
  }, [currentUserProfile, existingTeamId, matchedSavedTeam]);

  // Player search
  useEffect(() => {
    if (!user) return;
    const queryTerm = searchTerm.trim();
    if (!queryTerm) {
      setUserOptions([]);
      return;
    }

    const run = async () => {
      setLoadingUsers(true);
      let query = supabase
        .from("users")
        .select(
          "id, name, reg_no, department, registration_year, avatar_url, preferred_role, preferred_sport_id, sport_profile, course_code"
        )
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
        (
          (data || []) as Array<Omit<UserOption, "sport_profile"> & { sport_profile: unknown }>
        ).map((player) => ({
          ...player,
          sport_profile: normalizeSportProfile(player.sport_profile),
        }))
      );
    };

    const timeoutId = setTimeout(run, 250);
    return () => clearTimeout(timeoutId);
  }, [departmentFilter, myDepartment, myYear, searchTerm, user, yearFilter]);

  // Team name conflict check
  useEffect(() => {
    if (!user) return;
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
        if (active && error) setTeamNameConflict(null);
        return;
      }

      const conflict = (data || []).find(
        (t: { id: number; name: string; owner_user_id: string }) =>
          normalizeTeamName(t.name) === normalizedTeamName && t.owner_user_id !== user.id
      );
      setTeamNameConflict(conflict ? TEAM_NAME_TAKEN_MESSAGE : null);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [normalizedTeamName, teamName, user]);

  // Opponent search
  useEffect(() => {
    if (!user || !opponentSearch.trim()) {
      setOpponentResults([]);
      return;
    }
    const run = async () => {
      setOpponentLoading(true);
      const q = opponentSearch.trim();
      const { data, error } = await supabase
        .from("users")
        .select("id, name, reg_no, department")
        .neq("id", user.id)
        .or(`name.ilike.%${q}%,reg_no.ilike.%${q}%`)
        .limit(15);
      setOpponentLoading(false);
      if (error) return;
      setOpponentResults((data || []) as OpponentUserOption[]);
    };
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [opponentSearch, user]);

  // ── Actions ──
  const loadSavedTeam = (team: SavedTeam) => {
    setExistingTeamId(team.id);
    setTeamName(team.name);
    setMembers(ensureCurrentUserMember(team.members, currentUserProfile));
    setSearchTerm("");
    setUserOptions([]);
    toast.success(`Loaded ${team.name}.`);
  };

  const addMember = (candidate: UserOption) => {
    if (selectedIds.has(candidate.id)) return;
    setMembers((current) =>
      ensureSingleCaptain([
        ...current,
        { ...candidate, is_captain: current.length === 0 },
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
    setMembers((current) =>
      ensureSingleCaptain(current.filter((m) => m.id !== id))
    );
  };

  const setCaptain = (id: string) => {
    setMembers((current) =>
      current.map((m) => ({ ...m, is_captain: m.id === id }))
    );
  };

  const saveTeam = async (): Promise<boolean> => {
    if (!user) return false;

    const trimmedTeamName = teamName.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeTeamName(trimmedTeamName);

    if (!normalizedName) {
      toast.error("Enter a team name.");
      return false;
    }
    if (teamNameConflict) {
      toast.error(teamNameConflict);
      return false;
    }

    setSaving(true);

    try {
      const nextMembers = ensureCurrentUserMember(members, currentUserProfile);
      if (nextMembers.length < 2) throw new Error("Add at least 2 players.");

      const captain = nextMembers.find((m) => m.is_captain);
      if (!captain) throw new Error("Choose a captain.");

      // Check for team name conflicts
      const { data: conflictingTeams, error: conflictLookupError } = await supabase
        .from("teams")
        .select("id, name, owner_user_id")
        .eq("sport_id", CRICKET_SPORT_ID)
        .ilike("name", trimmedTeamName);

      if (conflictLookupError) throw new Error(conflictLookupError.message);

      const conflict = (conflictingTeams || []).find(
        (t: { id: number; name: string; owner_user_id: string }) =>
          normalizeTeamName(t.name) === normalizedName && t.owner_user_id !== user.id
      );
      if (conflict) {
        setTeamNameConflict(TEAM_NAME_TAKEN_MESSAGE);
        throw new Error(TEAM_NAME_TAKEN_MESSAGE);
      }

      const resolvedSavedTeam =
        savedTeams.find((t) => normalizeTeamName(t.name) === normalizedName) || null;
      const editingPersistedTeam =
        !!persistedBookingTeamId &&
        normalizeTeamName(persistedBookingTeamName) === normalizedName;

      const ownedExisting = (conflictingTeams || []).find(
        (t: { id: number; name: string; owner_user_id: string }) =>
          normalizeTeamName(t.name) === normalizedName && t.owner_user_id === user.id
      );

      let teamId =
        resolvedSavedTeam?.id ||
        ownedExisting?.id ||
        (editingPersistedTeam ? persistedBookingTeamId : null);

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

      // Update team name
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

      // Upsert booking_teams
      const { error: bookingTeamError } = await supabase.from("booking_teams").upsert(
        { booking_id: numBookingId, user_id: user.id, team_id: teamId, is_owner: true },
        { onConflict: "booking_id,user_id" }
      );
      if (bookingTeamError) throw new Error(bookingTeamError.message);

      // Clear + re-insert team players
      const { error: clearPlayersError } = await supabase
        .from("team_players")
        .delete()
        .eq("team_id", teamId);
      if (clearPlayersError) throw new Error(clearPlayersError.message);

      const inserts = nextMembers.map((m) => ({
        team_id: teamId,
        user_id: m.id,
        is_captain: m.is_captain,
      }));

      if (inserts.length > 0) {
        const { error: insertPlayersError } = await supabase
          .from("team_players")
          .insert(inserts);
        if (insertPlayersError) throw new Error(insertPlayersError.message);
      }

      // Send notifications to added players
      const directMemberIds = nextMembers.map((m) => m.id).filter((id) => id !== user.id);
      if (directMemberIds.length > 0) {
        const { data: existingNotifications } = await supabase
          .from("notifications")
          .select("recipient_user_id")
          .eq("booking_id", numBookingId)
          .eq("team_id", teamId)
          .eq("type", "team_assignment")
          .in("recipient_user_id", directMemberIds);

        const alreadyNotified = new Set(
          (existingNotifications || []).map((r) => r.recipient_user_id)
        );
        const notificationRows = nextMembers
          .filter((m) => m.id !== user.id && !alreadyNotified.has(m.id))
          .map((m) => ({
            recipient_user_id: m.id,
            actor_user_id: user.id,
            booking_id: numBookingId,
            team_id: teamId,
            type: "team_assignment",
            title: "You were added to a team",
            message: `You were added to ${trimmedTeamName} for booking #${numBookingId}.`,
            action_url: "/my-bookings",
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

      // Update local state
      const updatedSavedTeam: SavedTeam = {
        id: teamId,
        name: trimmedTeamName,
        members: nextMembers,
      };

      setSavedTeams((current) => [
        updatedSavedTeam,
        ...current.filter((t) => t.id !== teamId),
      ]);
      setPersistedBookingTeamId(teamId);
      setPersistedBookingTeamName(trimmedTeamName);
      setExistingTeamId(teamId);
      setTeamName(trimmedTeamName);
      setMembers(nextMembers);
      setSearchTerm("");
      setUserOptions([]);
      setTeamNameConflict(null);
      setTeamSaved(true);

      toast.success(`Team "${trimmedTeamName}" saved with ${nextMembers.length} players.`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save the team.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sendChallenge = async () => {
    if (!user || !selectedOpponent) return;

    setSendingChallenge(true);
    try {
      // Save team first if not saved
      if (!teamSaved) {
        const saved = await saveTeam();
        if (!saved) {
          setSendingChallenge(false);
          return;
        }
      }

      // Send match request
      const { error } = await supabase.from("match_requests").upsert(
        {
          booking_id: numBookingId,
          from_user_id: user.id,
          to_user_id: selectedOpponent.id,
          status: "pending",
        },
        { onConflict: "booking_id,from_user_id,to_user_id" }
      );

      if (error) {
        toast.error(error.message || "Failed to send challenge.");
        return;
      }

      setChallengeSent(true);
      setExistingOpponent(selectedOpponent);
      toast.success(`Challenge sent to ${selectedOpponent.name || "opponent"}!`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send challenge."
      );
    } finally {
      setSendingChallenge(false);
    }
  };

  // ── Render ──
  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black/[0.96]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-white/40">Loading match setup...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-500/[0.04] blur-[120px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
        {/* Header */}
        <button
          onClick={() => navigate("/my-bookings")}
          className="mb-5 flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          My Bookings
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <Swords className="h-5 w-5" />
              </div>
              Setup Match
            </h1>
            <p className="mt-2 text-sm text-white/40">
              Booking #{numBookingId} • Build your team and challenge an opponent — all in one go.
            </p>
          </div>
          {/* Progress indicators */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                teamSaved
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 bg-white/[0.03] text-white/30"
              }`}
            >
              {teamSaved ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              Team Created
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                challengeSent
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
                  : "border-white/10 bg-white/[0.03] text-white/30"
              }`}
            >
              {challengeSent ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {challengeSent ? "Challenge Sent" : "Waiting for opponent"}
            </div>
          </div>
        </div>

        {/* ── Two Column Layout ── */}
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ════════════ LEFT — YOUR TEAM ════════════ */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.04] to-transparent p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-white">Your Team</h2>
              </div>

              {/* Team Name */}
              <div className="mb-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                  Team Name
                </label>
                <input
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value);
                    setTeamSaved(false);
                  }}
                  className={`w-full rounded-xl border bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition-colors ${
                    teamNameConflict
                      ? "border-red-500/40"
                      : "border-white/[0.08] focus:border-emerald-500/40"
                  }`}
                  placeholder="Enter team name or pick a saved team"
                />
                {teamNameConflict && (
                  <p className="mt-1.5 text-xs font-semibold text-red-400">
                    {teamNameConflict}
                  </p>
                )}
              </div>

              {/* Saved teams chips */}
              {savedTeams.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bookmark className="h-3.5 w-3.5 text-white/30" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                      Saved Teams
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {savedTeams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => loadSavedTeam(team)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          existingTeamId === team.id
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                            : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white"
                        }`}
                      >
                        {team.name}{" "}
                        <span className="text-white/25">({team.members.length})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Player Filters */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="h-3.5 w-3.5 text-white/30" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                    Find Players
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 mb-3">
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-xs text-white outline-none"
                  >
                    <option value="my_department">My Department</option>
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-xs text-white outline-none"
                  >
                    <option value="my_year">My Year</option>
                    <option value="all">All Years</option>
                    {years.map((y) => (
                      <option key={y} value={y.toString()}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                  <input
                    ref={inputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search players by name or reg no"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-emerald-500/40"
                  />

                  {searchTerm.trim() && (
                    <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/95 shadow-2xl max-h-60 overflow-y-auto">
                      {loadingUsers ? (
                        <div className="px-4 py-3 text-xs text-white/40">Searching...</div>
                      ) : userOptions.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-white/40">No players found.</div>
                      ) : (
                        userOptions.map((player) => (
                          <button
                            key={player.id}
                            onClick={() => addMember(player)}
                            className="flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.06] last:border-0"
                          >
                            <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">
                                {player.name || "Unnamed user"}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-white/40">
                                {player.reg_no || "No reg no"}
                                {player.department ? ` • ${player.department}` : ""}
                                {typeof player.registration_year === "number"
                                  ? ` • ${player.registration_year}`
                                  : ""}
                              </div>
                              <div className="mt-0.5 text-[11px] text-emerald-400/70">
                                {getSportProfileTeaser(
                                  player.preferred_sport_id,
                                  player.sport_profile,
                                  player.preferred_role
                                ) ||
                                  (player.preferred_role
                                    ? formatRoleLabel(player.preferred_role)
                                    : "Role not set")}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Team Preview */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-white/40" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                    Team Preview
                  </span>
                </div>
                <span className="text-xs font-bold text-white/25">
                  {members.length} player{members.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {members.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-8 text-center text-sm text-white/30">
                    No players selected yet.
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2.5"
                    >
                      <PlayerAvatar name={member.name} avatarUrl={member.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-white">
                            {member.name || "Unnamed user"}
                          </div>
                          {member.id === user?.id && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                              You
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-white/40">
                          {member.reg_no || "No reg no"}
                          {member.department ? ` • ${member.department}` : ""}
                        </div>
                        <div className="mt-0.5 text-[11px] text-emerald-400/70">
                          {getSportProfileTeaser(
                            member.preferred_sport_id,
                            member.sport_profile,
                            member.preferred_role
                          ) ||
                            (member.preferred_role
                              ? formatRoleLabel(member.preferred_role)
                              : "Role not set")}
                        </div>
                      </div>
                      <button
                        onClick={() => setCaptain(member.id)}
                        className={`rounded-lg p-1.5 transition-colors ${
                          member.is_captain
                            ? "bg-amber-500/20 text-amber-400"
                            : "text-white/20 hover:text-amber-400"
                        }`}
                        title="Set captain"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeMember(member.id)}
                        disabled={member.id === user?.id}
                        className={`rounded-lg p-1.5 transition-colors ${
                          member.id === user?.id
                            ? "cursor-not-allowed text-white/10"
                            : "text-white/20 hover:text-red-400"
                        }`}
                        title={
                          member.id === user?.id
                            ? "You are added automatically"
                            : "Remove player"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Save Team Button */}
              <Button
                onClick={saveTeam}
                disabled={saving || !teamName.trim() || members.length < 2}
                className="mt-4 w-full rounded-xl bg-emerald-500/90 py-5 text-sm font-semibold text-white hover:bg-emerald-500 transition-all disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Team...
                  </>
                ) : teamSaved ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Team Saved — Update
                  </>
                ) : (
                  "Save Team"
                )}
              </Button>
            </div>
          </div>

          {/* ════════════ RIGHT — OPPONENT ════════════ */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-purple-500/15 bg-gradient-to-br from-purple-500/[0.04] to-transparent p-5">
              <div className="flex items-center gap-2 mb-4">
                <Swords className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white">Opponent</h2>
              </div>

              {challengeSent && existingOpponent ? (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/10">
                      <Send className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Challenge sent to {existingOpponent.name || "Unnamed user"}
                      </p>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {existingOpponent.reg_no || "No reg no"}
                        {existingOpponent.department
                          ? ` • ${existingOpponent.department}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-purple-400/80">
                    <Clock className="h-3.5 w-3.5" />
                    Waiting for response...
                  </div>
                  <button
                    onClick={() => {
                      setChallengeSent(false);
                      setSelectedOpponent(null);
                      setExistingOpponent(null);
                    }}
                    className="mt-3 text-xs text-white/40 hover:text-white transition-colors"
                  >
                    Change opponent →
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-white/40 mb-3">
                    Search for a user to captain the opponent team. They'll receive a challenge notification.
                  </p>

                  {/* Selected opponent */}
                  {selectedOpponent && (
                    <div className="mb-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.06] px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">
                          {selectedOpponent.name || "Unnamed user"}
                        </p>
                        <p className="text-[11px] text-white/40">
                          {selectedOpponent.reg_no || "No reg no"}
                          {selectedOpponent.department
                            ? ` • ${selectedOpponent.department}`
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedOpponent(null)}
                        className="text-xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Opponent search */}
                  {!selectedOpponent && (
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                      <input
                        value={opponentSearch}
                        onChange={(e) => setOpponentSearch(e.target.value)}
                        placeholder="Search by name or reg no..."
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-purple-500/40"
                      />

                      {opponentSearch.trim() && (
                        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/95 shadow-2xl max-h-60 overflow-y-auto">
                          {opponentLoading ? (
                            <div className="px-4 py-3 text-xs text-white/40">
                              Searching...
                            </div>
                          ) : opponentResults.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-white/40">
                              No users found.
                            </div>
                          ) : (
                            opponentResults.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => {
                                  setSelectedOpponent(u);
                                  setOpponentSearch("");
                                  setOpponentResults([]);
                                }}
                                className="flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.06] last:border-0"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-bold text-white/60">
                                  {(u.name || "U").slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-white">
                                    {u.name || "Unnamed user"}
                                  </div>
                                  <div className="text-[11px] text-white/35">
                                    {u.reg_no || "No reg"}
                                    {u.department ? ` • ${u.department}` : ""}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Match Lobby shortcut */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Swords className="h-4 w-4 text-white/30" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">
                  Quick Links
                </span>
              </div>
              <Button
                onClick={() => navigate(`/match-lobby/${numBookingId}`)}
                variant="outline"
                className="w-full rounded-xl border-white/[0.08] bg-transparent text-sm text-white/60 hover:text-white hover:border-white/15 transition-all"
              >
                <Swords className="mr-2 h-3.5 w-3.5" />
                Go to Match Lobby
              </Button>
            </div>
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={sendChallenge}
            disabled={
              sendingChallenge ||
              !selectedOpponent ||
              challengeSent ||
              (!teamSaved && (members.length < 2 || !teamName.trim()))
            }
            className="rounded-2xl bg-emerald-500/90 hover:bg-emerald-500 border border-emerald-400/20 px-12 py-6 text-base font-bold text-white shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all disabled:opacity-40 disabled:shadow-none"
          >
            {sendingChallenge ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Sending Challenge...
              </>
            ) : challengeSent ? (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Challenge Sent
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Send Challenge
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
