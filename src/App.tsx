import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
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

const queryClient = new QueryClient();

/* ─── Auth-aware route guard ─── */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const publicPaths = ["/", "/login", "/signup"];
  const isPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith("/live/");

  useEffect(() => {
    if (loading) return;

    if (!session && !isPublic) {
      // Not logged in trying to access protected route
      navigate("/login", { replace: true });
    } else if (session && (location.pathname === "/login" || location.pathname === "/signup")) {
      // Logged in but on auth pages → go to dashboard
      navigate("/dashboard", { replace: true });
    }
  }, [session, loading, location.pathname, isPublic, navigate]);

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGuard>
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
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
