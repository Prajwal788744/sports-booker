import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LimelightNav } from "@/components/ui/limelight-nav";
import { LayoutDashboard, CalendarDays, Gamepad2, User } from "lucide-react";
import { useMemo } from "react";

/**
 * Fixed bottom navigation bar for mobile devices using the LimelightNav component.
 * Hides on desktop (md+). Appears on pages where a user is logged in.
 * Respects safe-area-inset-bottom for notched devices.
 */
export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  const publicPaths = ["/", "/login", "/signup"];
  const isPublic = publicPaths.includes(location.pathname);
  const isAdmin = location.pathname.startsWith("/admin");
  const isLive = location.pathname.startsWith("/live/");

  // Determine active tab index based on current route
  const activeIndex = useMemo(() => {
    const path = location.pathname;
    if (path === "/dashboard" || path.startsWith("/booking/")) return 0;
    if (
      path === "/my-bookings" ||
      path.startsWith("/match-lobby/") ||
      path.startsWith("/match-setup/") ||
      path.startsWith("/booking-team/") ||
      path.startsWith("/opponent-team-setup/")
    )
      return 1;
    if (path === "/matches") return 2;
    if (path === "/profile") return 3;
    return 0;
  }, [location.pathname]);

  const navItems = useMemo(
    () => [
      {
        id: "home",
        icon: <LayoutDashboard />,
        label: "Home",
        onClick: () => navigate("/dashboard"),
      },
      {
        id: "bookings",
        icon: <CalendarDays />,
        label: "Bookings",
        onClick: () => navigate("/my-bookings"),
      },
      {
        id: "matches",
        icon: <Gamepad2 />,
        label: "Matches",
        onClick: () => navigate("/matches"),
      },
      {
        id: "profile",
        icon: <User />,
        label: "Profile",
        onClick: () => navigate("/profile"),
      },
    ],
    [navigate]
  );

  if (!session || isPublic || isAdmin || isLive) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9990] flex justify-center md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <LimelightNav
        items={navItems}
        activeIndex={activeIndex}
        className="w-full rounded-none border-x-0 border-b-0 border-t border-white/10 bg-[#0c0c0c]/95 backdrop-blur-xl"
        limelightClassName="bg-emerald-400 shadow-[0_50px_15px_theme(colors.emerald.400)]"
        iconClassName="text-white"
      />
    </div>
  );
}
