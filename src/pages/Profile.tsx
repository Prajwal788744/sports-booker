import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { StudentNavbar } from "@/components/StudentNavbar";
import { Camera, Save, User, Hash, Users, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ProfileData {
  name: string;
  email: string;
  reg_no: string;
  team_name: string;
  avatar_url: string;
}

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData>({
    name: "", email: "", reg_no: "", team_name: "", avatar_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("name, email, reg_no, team_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile({
          name: data.name || "",
          email: data.email || user.email || "",
          reg_no: data.reg_no || "",
          team_name: data.team_name || "",
          avatar_url: data.avatar_url || "",
        });
        if (data.avatar_url) setAvatarPreview(data.avatar_url);
      }
      setLoading(false);
    };
    fetchProfile();
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

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`; // cache bust

    // Update users table
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
      team_name: profile.team_name,
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
      <div className="min-h-screen bg-background">
        <StudentNavbar />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StudentNavbar />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-extrabold text-foreground mb-8 tracking-tight">My Profile</h1>

        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-emerald-500/30 bg-muted flex items-center justify-center">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all disabled:opacity-50"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Click the camera icon to upload photo</p>
        </div>

        {/* Profile Fields */}
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Full Name
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              placeholder="Your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-muted-foreground text-sm cursor-not-allowed"
            />
          </div>

          {/* Reg No (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Registration Number
            </label>
            <input
              type="text"
              value={profile.reg_no}
              disabled
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-muted-foreground text-sm cursor-not-allowed"
            />
          </div>

          {/* Team Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Team Name
            </label>
            <input
              type="text"
              value={profile.team_name}
              onChange={(e) => setProfile({ ...profile, team_name: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              placeholder="Your team name (e.g., RCB)"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:opacity-50 mt-6"
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
