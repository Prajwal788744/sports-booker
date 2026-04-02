import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Save, User, Hash, Users, Mail, Trophy, ArrowLeft, Gamepad2, TrendingUp, Target, Zap, Award } from "lucide-react";
import GcuLogo from "@/components/GcuLogo";
import { toast } from "sonner";
import {
  SPORT_META_BY_ID,
  getSportProfileSummaryItems,
  getSportProfileTeaser,
  normalizeSportProfile,
  type SportProfileRecord,
} from "@/lib/player-profile";

interface ProfileData {
  name: string;
  email: string;
  reg_no: string;
  team_name: string;
  avatar_url: string;
  department: string;
  preferred_sport_id: number | null;
  preferred_role: string;
  registration_year: number | null;
  course_code: string;
  sport_profile: SportProfileRecord;
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    email: "",
    reg_no: "",
    team_name: "",
    avatar_url: "",
    department: "",
    preferred_sport_id: null,
    preferred_role: "",
    registration_year: null,
    course_code: "",
    sport_profile: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Match stats
  const [matchStats, setMatchStats] = useState<{
    matchesPlayed: number;
    totalRuns: number;
    totalBalls: number;
    fours: number;
    sixes: number;
    totalWickets: number;
    runsConceded: number;
    ballsBowled: number;
  }>({
    matchesPlayed: 0, totalRuns: 0, totalBalls: 0, fours: 0, sixes: 0,
    totalWickets: 0, runsConceded: 0, ballsBowled: 0,
  });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("users")
        .select("name, email, reg_no, team_name, avatar_url, department, preferred_sport_id, preferred_role, registration_year, course_code, sport_profile")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile({
          name: data.name || "",
          email: data.email || user.email || "",
          reg_no: data.reg_no || "",
          team_name: data.team_name || "",
          avatar_url: data.avatar_url || "",
          department: data.department || "",
          preferred_sport_id: data.preferred_sport_id || null,
          preferred_role: data.preferred_role || "",
          registration_year: data.registration_year || null,
          course_code: data.course_code || "",
          sport_profile: normalizeSportProfile(data.sport_profile),
        });
        if (data.avatar_url) setAvatarPreview(data.avatar_url);
      }
      setLoading(false);
    };
    fetchProfile();

    // Fetch match stats
    const fetchStats = async () => {
      // Find the player record for this user
      const { data: playerRow } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!playerRow) return;

      // Get all stats for this player across matches
      const { data: statsRows } = await supabase
        .from("player_stats")
        .select("runs_scored, balls_faced, fours, sixes, wickets_taken, runs_conceded")
        .eq("player_id", playerRow.id);

      if (statsRows && statsRows.length > 0) {
        const agg = statsRows.reduce(
          (acc, s) => ({
            matchesPlayed: acc.matchesPlayed + 1,
            totalRuns: acc.totalRuns + (s.runs_scored || 0),
            totalBalls: acc.totalBalls + (s.balls_faced || 0),
            fours: acc.fours + (s.fours || 0),
            sixes: acc.sixes + (s.sixes || 0),
            totalWickets: acc.totalWickets + (s.wickets_taken || 0),
            runsConceded: acc.runsConceded + (s.runs_conceded || 0),
            ballsBowled: acc.ballsBowled + 0,
          }),
          { matchesPlayed: 0, totalRuns: 0, totalBalls: 0, fours: 0, sixes: 0, totalWickets: 0, runsConceded: 0, ballsBowled: 0 }
        );
        setMatchStats(agg);
      }
    };
    fetchStats();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", user.id);

    setProfile((prev) => ({ ...prev, avatar_url: publicUrl }));
    setAvatarPreview(publicUrl);
    setUploading(false);
    toast.success("Photo uploaded!");
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from("users").update({
      name: profile.name,
    }).eq("id", user.id);

    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Profile updated!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black/[0.96] text-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  const preferredSport = profile.preferred_sport_id ? SPORT_META_BY_ID[profile.preferred_sport_id] : null;
  const athleteSummary = getSportProfileTeaser(profile.preferred_sport_id, profile.sport_profile, profile.preferred_role, 4);
  const athleteDetails = getSportProfileSummaryItems(profile.preferred_sport_id, profile.sport_profile, profile.preferred_role);

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav — same as Dashboard */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <GcuLogo />
            <span className="tracking-tight text-white">GCU Sports</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-sm font-medium text-white/50 hover:text-white transition-colors">
              Dashboard
            </button>
            <button onClick={() => navigate("/my-bookings")} className="text-sm font-medium text-white/50 hover:text-white transition-colors">
              My Bookings
            </button>
            <button onClick={() => navigate("/matches")} className="text-sm font-medium text-emerald-400/70 hover:text-emerald-400 transition-colors flex items-center gap-1">
              <Gamepad2 className="h-3.5 w-3.5" /> Matches
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

      <main className="relative z-10 mx-auto max-w-lg px-4 py-10">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-extrabold tracking-tight mb-8">
          My <span className="text-emerald-400">Profile</span>
        </h1>

        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-emerald-500/30 bg-white/[0.03] flex items-center justify-center">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User className="h-12 w-12 text-white/20" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all disabled:opacity-50"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <p className="text-xs text-white/30 mt-2">Tap the camera to upload photo</p>
        </div>

        {/* Profile Fields */}
        <div className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Full Name
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/20"
              placeholder="Your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
            />
          </div>

          {/* Reg No (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Registration Number
            </label>
            <input
              type="text"
              value={profile.reg_no}
              disabled
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
            />
          </div>

          {/* Department (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Department
            </label>
            <input
              type="text"
              value={profile.department}
              disabled
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
            />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Athlete Profile</p>
                <h2 className="mt-2 text-lg font-bold text-white">
                  {preferredSport ? `${preferredSport.emoji} ${preferredSport.name}` : "Sport not selected"}
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  {athleteSummary || "Complete onboarding to build your athlete profile."}
                </p>
              </div>
            </div>

            {athleteDetails.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {athleteDetails.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/30">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Match Stats Section */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Match Stats</p>
                <h2 className="mt-2 text-lg font-bold text-white">🏏 Performance Summary</h2>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                <TrendingUp className="h-3 w-3" />
                {matchStats.matchesPlayed} Matches
              </div>
            </div>

            {matchStats.matchesPlayed > 0 ? (
              <>
                {/* Overview Cards */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: "Matches", value: matchStats.matchesPlayed, icon: Trophy, color: "text-emerald-400" },
                    { label: "Runs", value: matchStats.totalRuns, icon: Zap, color: "text-blue-400" },
                    { label: "Wickets", value: matchStats.totalWickets, icon: Target, color: "text-red-400" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-center">
                      <stat.icon className={`mx-auto mb-1.5 h-4 w-4 ${stat.color}`} />
                      <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                      <div className="text-[10px] font-semibold text-white/30 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Batting Breakdown */}
                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-400/70 mb-3 flex items-center gap-1.5">
                    🏏 Batting
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Total Runs", value: matchStats.totalRuns },
                      { label: "Balls Faced", value: matchStats.totalBalls },
                      { label: "Fours", value: matchStats.fours },
                      { label: "Sixes", value: matchStats.sixes },
                      { label: "Strike Rate", value: matchStats.totalBalls > 0 ? ((matchStats.totalRuns / matchStats.totalBalls) * 100).toFixed(1) : "0.0" },
                      { label: "Average", value: matchStats.matchesPlayed > 0 ? (matchStats.totalRuns / matchStats.matchesPlayed).toFixed(1) : "0.0" },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bowling Breakdown */}
                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-red-400/70 mb-3 flex items-center gap-1.5">
                    ⚾ Bowling
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Wickets", value: matchStats.totalWickets },
                      { label: "Runs Conceded", value: matchStats.runsConceded },
                      { label: "Economy", value: matchStats.totalWickets > 0 ? (matchStats.runsConceded / matchStats.totalWickets).toFixed(1) : "—" },
                      { label: "Best Bowling", value: `${matchStats.totalWickets}/${matchStats.runsConceded}` },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-center">
                <Award className="mx-auto mb-2 h-8 w-8 text-white/15" />
                <p className="text-sm text-white/40">No match data yet.</p>
                <p className="text-xs text-white/25 mt-1">Play some matches to see your stats here!</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Registration Year
              </label>
              <input
                type="text"
                value={profile.registration_year ? profile.registration_year.toString() : ""}
                disabled
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Course Code
              </label>
              <input
                type="text"
                value={profile.course_code}
                disabled
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
              />
            </div>
          </div>

          {/* Team Name (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Team Name
            </label>
            <input
              type="text"
              value={profile.team_name}
              disabled
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-white/40 text-sm cursor-not-allowed"
            />
            <p className="text-[10px] text-white/25">Team name is set by the match/team creator.</p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3.5 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 mt-4"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Profile
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
