import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { ArrowRight, Trophy } from "lucide-react";

const sportMeta: Record<string, { icon: string; description: string; img: string }> = {
  Cricket: {
    icon: "🏏",
    description: "Professional cricket turf with floodlights for day and night play.",
    img: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=400&fit=crop",
  },
  Futsal: {
    icon: "⚽",
    description: "Indoor futsal court with synthetic turf and professional markings.",
    img: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=400&fit=crop",
  },
  Badminton: {
    icon: "🏸",
    description: "Indoor badminton courts with wooden flooring and proper lighting.",
    img: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&h=400&fit=crop",
  },
};

interface Sport {
  id: number;
  name: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.name || "Student";
  const [sports, setSports] = useState<Sport[]>([]);

  useEffect(() => {
    supabase.from("sports").select("*").order("id").then(({ data }) => {
      if (data) setSports(data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-black/[0.96] text-white">
      {/* Ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="tracking-tight text-white">GCU Sports</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/my-bookings")}
              className="text-sm font-medium text-white/50 hover:text-white transition-colors"
            >
              My Bookings
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

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-12">
        <div className="mb-10 animate-fade-up">
          <h1 className="text-3xl font-extrabold sm:text-4xl tracking-tight">
            Welcome back, <span className="text-emerald-400">{userName}</span>! 👋
          </h1>
          <p className="mt-2 text-white/40 text-base">Choose a sport and book your slot.</p>
        </div>

        <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((sport, i) => {
            const meta = sportMeta[sport.name] || { icon: "🏅", description: "", img: "" };
            return (
              <li key={sport.id} className="list-none min-h-[14rem] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/[0.06] p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                  <button
                    onClick={() => navigate(`/booking/${sport.id}`)}
                    className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border-[0.75px] border-white/[0.06] bg-white/[0.03] p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1"
                  >
                    {meta.img && (
                      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `url('${meta.img}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    )}
                    <div className="relative flex flex-col gap-5">
                      <div className="text-5xl transition-transform duration-300 hover:scale-110 inline-block">{meta.icon}</div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-semibold tracking-[-0.04em] md:text-2xl text-white">{sport.name}</h3>
                        <p className="text-sm md:text-base text-white/40">{meta.description}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                          Book Now
                        </span>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
