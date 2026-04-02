import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  CalendarDays,
  Gamepad2,
  User,
} from "lucide-react";

const navItems = [
  { label: "Home", path: "/dashboard", icon: LayoutDashboard },
  { label: "Bookings", path: "/my-bookings", icon: CalendarDays },
  { label: "Matches", path: "/matches", icon: Gamepad2 },
  { label: "Profile", path: "/profile", icon: User },
];

/**
 * Fixed bottom navigation bar for mobile devices.
 * Hides on desktop (md+). Appears on pages where a user is logged in.
 * Respects safe-area-inset-bottom for notched devices.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  // Only show for authenticated users on non-public pages
  const publicPaths = ["/", "/login", "/signup"];
  const isPublic = publicPaths.includes(location.pathname);
  const isAdmin = location.pathname.startsWith("/admin");
  const isLive = location.pathname.startsWith("/live/");

  if (!session || isPublic || isAdmin || isLive) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[9990] border-t border-white/[0.06] bg-black/90 backdrop-blur-xl md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-stretch justify-around">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/dashboard" && location.pathname.startsWith("/booking/")) ||
            (item.path === "/my-bookings" && (
              location.pathname.startsWith("/match-lobby/") ||
              location.pathname.startsWith("/match-setup/") ||
              location.pathname.startsWith("/booking-team/") ||
              location.pathname.startsWith("/opponent-team-setup/")
            ));

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                isActive
                  ? "text-emerald-400"
                  : "text-white/35 active:text-white/60"
              }`}
            >
              <item.icon
                className={`h-5 w-5 transition-transform ${
                  isActive ? "scale-110" : ""
                }`}
              />
              <span className="text-[10px] font-semibold">{item.label}</span>
              {isActive && (
                <div className="absolute top-0 h-[2px] w-10 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
