import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Trophy, Eye, EyeOff } from "lucide-react";
import { CanvasRevealEffect } from "@/components/ui/sign-in-flow-1";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Signup() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regNo, setRegNo] = useState("");
  const [teamName, setTeamName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  // Validate reg_no: must contain both letters and numbers
  const isRegNoValid = (value: string) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !regNo) {
      toast.error("Please fill in all fields");
      return;
    }
    if (!isRegNoValid(regNo)) {
      toast.error("Registration number must contain both letters and numbers");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!/[a-z]/.test(password)) {
      toast.error("Password must contain at least one lowercase letter");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error("Password must contain at least one digit");
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      toast.error("Password must contain at least one special character");
      return;
    }

    setIsSubmitting(true);
    const { error } = await signUp(email, password, { name, reg_no: regNo, team_name: teamName });
    setIsSubmitting(false);

    if (error) {
      toast.error(error.message || "Signup failed");
      return;
    }

    // Success animation
    setReverseCanvasVisible(true);
    setTimeout(() => setInitialCanvasVisible(false), 50);
    setStep("success");

    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
  };

  return (
    <div className="flex w-full flex-col min-h-screen bg-black relative">
      {/* Canvas Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[
                [16, 185, 129],
                [5, 150, 105],
                [52, 211, 153],
              ]}
              dotSize={5}
              reverse={false}
            />
          </div>
        )}
        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-black"
              colors={[
                [16, 185, 129],
                [5, 150, 105],
                [52, 211, 153],
              ]}
              dotSize={5}
              reverse={true}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_30%_50%,_rgba(0,0,0,0.82)_0%,_rgba(0,0,0,0.35)_55%,_rgba(0,0,0,0.1)_100%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/5 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        <header className="flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white transition-transform duration-200 group-hover:scale-110">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="text-white font-bold tracking-tight text-lg">GCU Sports</span>
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center items-center px-4 pb-12">
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait">
              {step === "form" ? (
                <motion.div
                  key="form-step"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-5 text-center"
                >
                  <div className="space-y-2">
                    <div className="flex justify-center mb-4">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <Trophy className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight text-white">
                      Create <span className="text-emerald-400">Account</span>
                    </h1>
                    <p className="text-white/50 font-light">Join GCU Sports and start booking</p>
                  </div>

                  <form onSubmit={handleSignup} className="space-y-3">
                    {/* Name */}
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                      required
                    />

                    {/* Email */}
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                      required
                    />

                    {/* Registration Number */}
                    <input
                      type="text"
                      placeholder="Registration Number"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                      required
                    />

                    {/* Team Name */}
                    <input
                      type="text"
                      placeholder="Team Name (optional)"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                    />

                    {/* Password */}
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 pr-12 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors p-1"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Submit */}
                    <motion.button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3 hover:from-emerald-400 hover:to-emerald-500 transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                      whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
                    >
                      {isSubmitting ? "Creating Account..." : "Sign Up"}
                    </motion.button>
                  </form>

                  <p className="text-sm text-white/40 pt-1">
                    Already have an account?{" "}
                    <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                      Sign In
                    </Link>
                  </p>

                  <p className="text-xs text-white/25 pt-1">
                    By signing up, you agree to the{" "}
                    <a href="#" className="underline text-white/30 hover:text-white/50 transition-colors">Terms</a>{" "}
                    and{" "}
                    <a href="#" className="underline text-white/30 hover:text-white/50 transition-colors">Privacy Policy</a>.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="success-step"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
                  className="space-y-6 text-center"
                >
                  <div className="space-y-2">
                    <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                      Welcome <span className="text-emerald-400">Aboard!</span>
                    </h1>
                    <p className="text-white/50 font-light">Your account is ready 🏆</p>
                  </div>

                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.4, type: "spring" }}
                    className="py-8"
                  >
                    <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-white/40 text-sm"
                  >
                    Redirecting to your dashboard...
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
