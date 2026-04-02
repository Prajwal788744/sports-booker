import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import OnboardingDialog from "@/components/OnboardingDialog";
import { RealtimeNotificationToast } from "@/components/RealtimeNotificationToast";
import OfflineBanner from "@/components/OfflineBanner";
import InstallPrompt from "@/components/InstallPrompt";
import BottomNav from "@/components/BottomNav";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Booking from "./pages/Booking";
import MyBookings from "./pages/MyBookings";
import AdminPanel from "./pages/AdminPanel";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import CreateMatch from "./pages/CreateMatch";
import TeamSetup from "./pages/TeamSetup";
import Scoring from "./pages/Scoring";
import LiveScore from "./pages/LiveScore";
import MatchHistory from "./pages/MatchHistory";
import Profile from "./pages/Profile";
import BookingTeamSetup from "./pages/BookingTeamSetup";
import MatchLobby from "./pages/MatchLobby";
import MatchSetup from "./pages/MatchSetup";
import OpponentTeamSetup from "./pages/OpponentTeamSetup";
import PlayerProfile from "./pages/PlayerProfile";

const queryClient = new QueryClient();

/* ─── Auth-aware route guard ─── */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const publicPaths = ["/", "/login", "/signup"];
  const isPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith("/live/");
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  useEffect(() => {
    if (loading) return;

    if (!session && !isPublic) {
      // Not logged in trying to access protected route
      navigate("/login", { replace: true });
    } else if (session && location.pathname === "/login") {
      // Logged in but on login page → check role first, then redirect
      const checkRoleAndRedirect = async () => {
        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile?.role === "admin") {
          navigate("/admin", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      };
      checkRoleAndRedirect();
    }
  }, [session, loading, location.pathname, isPublic, navigate]);

  if (session && isAuthPage && location.pathname === "/login") {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const shouldCheckOnboarding = location.pathname === "/dashboard";

  // Realtime notification navigation handler
  const handleNotificationNavigate = useCallback((url: string) => {
    navigate(url);
  }, [navigate]);

  useEffect(() => {
    let active = true;

    const checkOnboarding = async () => {
      if (!session?.user || !shouldCheckOnboarding) {
        if (active) {
          setNeedsOnboarding(false);
          setCheckingProfile(false);
        }
        return;
      }

      const pendingOnboardingUser =
        typeof window !== "undefined" ? window.sessionStorage.getItem("gcu_pending_onboarding_user") : null;

      if (pendingOnboardingUser !== session.user.id) {
        if (active) {
          setNeedsOnboarding(false);
          setCheckingProfile(false);
        }
        return;
      }

      setCheckingProfile(true);
      const { data, error } = await supabase
        .from("users")
        .select("onboarding_completed, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      const shouldShow = !error && data ? data.role !== "admin" && data.onboarding_completed !== true : true;
      setNeedsOnboarding(shouldShow);
      setCheckingProfile(false);
    };

    void checkOnboarding();

    return () => {
      active = false;
    };
  }, [location.pathname, session?.user?.id, shouldCheckOnboarding]);

  return (
    <>
      {children}
      {/* Global realtime notification listeners */}
      {user && <RealtimeNotificationToast userId={user.id} onNavigate={handleNotificationNavigate} />}
      {user && shouldCheckOnboarding && !checkingProfile && needsOnboarding && (
        <OnboardingDialog user={user} open={needsOnboarding} onComplete={() => setNeedsOnboarding(false)} />
      )}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <OfflineBanner />
      <InstallPrompt />
      <BrowserRouter>
        <AuthGuard>
          <OnboardingGate>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/booking/:sportId" element={<Booking />} />
              <Route path="/my-bookings" element={<MyBookings />} />
              <Route path="/create-match/:bookingId" element={<CreateMatch />} />
              <Route path="/create-match" element={<CreateMatch />} />
              <Route path="/team-setup/:matchId" element={<TeamSetup />} />
              <Route path="/scoring/:matchId" element={<Scoring />} />
              <Route path="/live/:matchId" element={<LiveScore />} />
              <Route path="/matches" element={<MatchHistory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/booking-team/:bookingId" element={<BookingTeamSetup />} />
              <Route path="/match-lobby/:bookingId" element={<MatchLobby />} />
              <Route path="/match-setup/:bookingId" element={<MatchSetup />} />
              <Route path="/opponent-team-setup/:bookingId" element={<OpponentTeamSetup />} />
              <Route path="/player/:userId" element={<PlayerProfile />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OnboardingGate>
        </AuthGuard>
        <BottomNav />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
