import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Filter, Search, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface UserOption {
  id: string;
  name: string | null;
  reg_no: string | null;
  department: string | null;
}

interface TeamMember extends UserOption {
  is_captain: boolean;
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
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [existingTeamId, setExistingTeamId] = useState<number | null>(null);

  const selectedIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  useEffect(() => {
    if (!user || !numBookingId) return;
    const init = async () => {
      const { data: myProfile } = await supabase.from("users").select("department").eq("id", user.id).single();
      setMyDepartment(myProfile?.department || null);

      const { data: deptRows } = await supabase.from("users").select("department").not("department", "is", null);
      const unique = Array.from(new Set((deptRows || []).map((r: any) => r.department).filter(Boolean))) as string[];
      setDepartments(unique);

      const { data: booking } = await supabase.from("bookings").select("user_id").eq("id", numBookingId).single();
      const owner = booking?.user_id === user.id;
      setIsOwner(owner);

      let allowed = owner;
      if (!owner) {
        const { data: req } = await supabase
          .from("match_requests")
          .select("id")
          .eq("booking_id", numBookingId)
          .eq("to_user_id", user.id)
          .eq("status", "accepted")
          .maybeSingle();
        allowed = !!req;
      }
      setCanEdit(allowed);
      if (!allowed) {
        toast.error("You are not allowed to create team for this booking");
        navigate("/my-bookings", { replace: true });
        return;
      }

      const { data: bookingTeam } = await supabase
        .from("booking_teams")
        .select("team_id, teams(id, name)")
        .eq("booking_id", numBookingId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (bookingTeam?.team_id) {
        setExistingTeamId(bookingTeam.team_id);
        setTeamName((bookingTeam.teams as any)?.name || "");
        const { data: teamPlayers } = await supabase
          .from("team_players")
          .select("is_captain, user_id, users(id, name, reg_no, department)")
          .eq("team_id", bookingTeam.team_id);
        const mapped = (teamPlayers || []).map((tp: any) => ({
          id: tp.users?.id,
          name: tp.users?.name,
          reg_no: tp.users?.reg_no,
          department: tp.users?.department,
          is_captain: tp.is_captain,
        })) as TeamMember[];
        setMembers(mapped.filter((m) => !!m.id));
      }
    };
    init();
  }, [user, numBookingId, navigate]);

  useEffect(() => {
    if (!canEdit) return;
    const q = searchTerm.trim();
    if (!q) {
      setUserOptions([]);
      return;
    }
    const run = async () => {
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
      if (error) return toast.error(error.message || "Failed to search users");
      setUserOptions((data || []) as UserOption[]);
    };
    const id = setTimeout(run, 250);
    return () => clearTimeout(id);
  }, [searchTerm, departmentFilter, myDepartment, canEdit]);

  const addMember = (u: UserOption) => {
    if (selectedIds.has(u.id)) return;
    setMembers((prev) => [...prev, { ...u, is_captain: prev.length === 0 }]);
    setSearchTerm("");
    setUserOptions([]);
    inputRef.current?.focus();
  };

  const removeMember = (id: string) => {
    setMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (next.length > 0 && !next.some((m) => m.is_captain)) next[0].is_captain = true;
      return [...next];
    });
  };

  const setCaptain = (id: string) => {
    setMembers((prev) => prev.map((m) => ({ ...m, is_captain: m.id === id })));
  };

  const saveTeam = async () => {
    if (!user || !canEdit) return;
    if (!teamName.trim()) return toast.error("Enter team name");
    if (members.length < 2) return toast.error("Add at least 2 team members");
    const captain = members.find((m) => m.is_captain);
    if (!captain) return toast.error("Choose a captain");

    setSaving(true);
    let teamId = existingTeamId;
    if (!teamId) {
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ owner_user_id: user.id, name: teamName.trim() })
        .select("id")
        .single();
      if (error || !team) {
        setSaving(false);
        return toast.error(error?.message || "Failed to create team");
      }
      teamId = team.id;
      setExistingTeamId(team.id);
    } else {
      await supabase.from("teams").update({ name: teamName.trim() }).eq("id", teamId).eq("owner_user_id", user.id);
      await supabase.from("team_players").delete().eq("team_id", teamId);
    }

    const inserts = members.map((m) => ({
      team_id: teamId,
      user_id: m.id,
      is_captain: m.is_captain,
    }));
    const { error: playersErr } = await supabase.from("team_players").insert(inserts);
    if (playersErr) {
      setSaving(false);
      return toast.error(playersErr.message || "Failed to save team players");
    }

    const { error: btErr } = await supabase.from("booking_teams").upsert(
      { booking_id: numBookingId, user_id: user.id, team_id: teamId, is_owner: isOwner },
      { onConflict: "booking_id,user_id" }
    );
    setSaving(false);
    if (btErr) return toast.error(btErr.message || "Failed to link team with booking");

    toast.success("Team saved successfully");
    navigate("/my-bookings");
  };

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      <main className="mx-auto max-w-3xl px-4 py-8">
        <button onClick={() => navigate("/my-bookings")} className="mb-5 flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-extrabold">Create Team</h1>
        <p className="mt-1 text-sm text-white/40">Booking #{numBookingId}</p>

        <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <label className="mb-2 block text-xs font-bold uppercase text-white/40">Team Name</label>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white"
            placeholder="Enter your team name"
          />
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/40" />
            <span className="text-xs font-bold uppercase text-white/40">Filter</span>
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white"
          >
            <option value="my_department">My Department</option>
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/30" />
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search signed-up users by name or reg no"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] py-3 pl-10 pr-4 text-sm text-white"
            />
            {searchTerm.trim() && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/95">
                {loadingUsers ? (
                  <div className="px-4 py-3 text-xs text-white/40">Searching...</div>
                ) : userOptions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-white/40">No users found</div>
                ) : (
                  userOptions.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => addMember(u)}
                      className="w-full border-b border-white/[0.05] px-4 py-3 text-left hover:bg-white/[0.06] last:border-0"
                    >
                      <div className="text-sm text-white">{u.name || "Unnamed user"}</div>
                      <div className="text-[11px] text-white/40">{u.reg_no || "No reg"} {u.department ? `• ${u.department}` : ""}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-white/40" />
            <span className="text-xs font-bold uppercase text-white/40">Team Members</span>
          </div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm text-white">{m.name || "Unnamed user"}</div>
                  <div className="text-[11px] text-white/35">{m.reg_no || "No reg"} {m.department ? `• ${m.department}` : ""}</div>
                </div>
                <button
                  onClick={() => setCaptain(m.id)}
                  className={`rounded-lg p-2 ${m.is_captain ? "bg-amber-500/20 text-amber-400" : "text-white/30 hover:text-amber-400"}`}
                  title="Set Captain"
                >
                  <Star className="h-4 w-4" />
                </button>
                <button onClick={() => removeMember(m.id)} className="rounded-lg p-2 text-white/30 hover:text-red-400" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {members.length === 0 && <p className="text-xs text-white/30">No members selected yet.</p>}
          </div>
        </div>

        <Button onClick={saveTeam} disabled={saving} className="mt-5 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white py-6">
          {saving ? "Saving..." : "Save Team"}
        </Button>
      </main>
    </div>
  );
}
