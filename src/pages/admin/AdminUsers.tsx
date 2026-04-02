import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Search, Shield, ShieldOff, Trophy, Gamepad2 } from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string; name: string | null; email: string | null; reg_no: string | null;
  department: string | null; role: string; is_active: boolean; avatar_url: string | null;
  created_at: string; preferred_sport_id: number | null;
  matchCount?: number; wins?: number;
}

const sportNames: Record<number, string> = { 1: "Cricket", 2: "Futsal", 3: "Badminton" };

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterSport, setFilterSport] = useState<number | "">(""  );
  const [departments, setDepartments] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);

    // Fetch all users - query columns that definitely exist
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, reg_no, department, role, avatar_url, created_at, preferred_sport_id")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch users:", error.message);
      toast.error("Failed to load users");
      setLoading(false);
      return;
    }

    // Map users, default is_active to true if column doesn't exist
    const rows: UserRow[] = (data || []).map((u: any) => ({
      ...u,
      is_active: u.is_active !== undefined ? u.is_active : true,
    }));

    // Get unique departments
    const depts = [...new Set(rows.map(u => u.department).filter(Boolean))] as string[];
    setDepartments(depts);

    // Fetch match counts (wrapped in try-catch to not break if tables don't exist)
    try {
      const userIds = rows.map(u => u.id);
      if (userIds.length > 0) {
        const { data: players } = await supabase.from("players").select("id, user_id").in("user_id", userIds);
        const playerMap = new Map((players || []).map((p: any) => [p.user_id, p.id]));
        const playerIds = (players || []).map((p: any) => p.id);

        if (playerIds.length > 0) {
          const { data: matchPlayers } = await supabase.from("match_players").select("player_id, match_id, team").in("player_id", playerIds);
          const { data: matchesData } = await supabase.from("matches").select("id, winner, status").eq("status", "completed");

          const matchCountMap = new Map<string, number>();
          const winCountMap = new Map<string, number>();
          const matchWinnerMap = new Map((matchesData || []).map((m: any) => [m.id, m.winner]));

          (matchPlayers || []).forEach((mp: any) => {
            const userId = (players || []).find((p: any) => p.id === mp.player_id)?.user_id;
            if (!userId) return;
            matchCountMap.set(userId, (matchCountMap.get(userId) || 0) + 1);

            const winner = matchWinnerMap.get(mp.match_id);
            if (winner && winner === mp.team) {
              winCountMap.set(userId, (winCountMap.get(userId) || 0) + 1);
            }
          });

          rows.forEach(u => {
            u.matchCount = matchCountMap.get(u.id) || 0;
            u.wins = winCountMap.get(u.id) || 0;
          });
        }
      }
    } catch (e) {
      // Match stats are optional, continue without them
      console.warn("Could not fetch match stats:", e);
    }

    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel("admin-users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchUsers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUsers]);

  const toggleActive = async (userId: string, currentActive: boolean) => {
    const { error } = await supabase.from("users").update({ is_active: !currentActive }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(currentActive ? "User disabled" : "User enabled");
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentActive } : u));
  };

  const filtered = users.filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!((u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.reg_no || "").toLowerCase().includes(q))) return false;
    }
    if (filterDept && u.department !== filterDept) return false;
    if (filterSport !== "" && u.preferred_sport_id !== filterSport) return false;
    return true;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, or reg no…" className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-emerald-500/40 focus:outline-none" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white/70 focus:outline-none min-w-[140px]">
          <option value="" className="bg-black">All Departments</option>
          {departments.map(d => <option key={d} value={d} className="bg-black">{d}</option>)}
        </select>
        <select value={filterSport} onChange={e => setFilterSport(e.target.value ? Number(e.target.value) : "")} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white/70 focus:outline-none min-w-[120px]">
          <option value="" className="bg-black">All Sports</option>
          {Object.entries(sportNames).map(([id, name]) => <option key={id} value={id} className="bg-black">{name}</option>)}
        </select>
      </div>

      <p className="text-xs text-white/30">{filtered.length} user{filtered.length !== 1 ? "s" : ""} found</p>

      {/* User List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 mx-auto mb-3 text-white/10" />
          <p className="text-sm text-white/30">No users found</p>
          {search && <p className="text-xs text-white/20 mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className={`rounded-xl border bg-white/[0.02] p-4 flex items-center gap-4 transition-all hover:bg-white/[0.04] ${u.is_active ? "border-white/[0.06]" : "border-red-500/20 bg-red-500/[0.03]"}`}>
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-blue-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} className="h-full w-full object-cover" /> : <span className="text-sm font-bold text-white/60">{(u.name || "?")[0].toUpperCase()}</span>}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate">{u.name || "No name"}</span>
                  {u.role === "admin" && <span className="text-[10px] font-bold text-amber-400 border border-amber-500/20 bg-amber-500/10 rounded-full px-1.5 py-0.5">ADMIN</span>}
                  {!u.is_active && <span className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/10 rounded-full px-1.5 py-0.5">DISABLED</span>}
                </div>
                <p className="text-xs text-white/40 truncate">{u.email} {u.reg_no ? `· ${u.reg_no}` : ""} {u.department ? `· ${u.department}` : ""}</p>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-white/30">Matches</p>
                  <p className="text-sm font-bold text-blue-400">{u.matchCount || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-white/30">Wins</p>
                  <p className="text-sm font-bold text-emerald-400">{u.wins || 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-white/30">Win %</p>
                  <p className="text-sm font-bold text-purple-400">{u.matchCount ? Math.round(((u.wins || 0) / u.matchCount) * 100) : 0}%</p>
                </div>
              </div>

              {/* Toggle */}
              {u.role !== "admin" && (
                <button onClick={() => toggleActive(u.id, u.is_active)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${u.is_active ? "border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}>
                  {u.is_active ? <><ShieldOff className="h-3 w-3" /> Disable</> : <><Shield className="h-3 w-3" /> Enable</>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
