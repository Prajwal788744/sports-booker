import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Trophy, Eye, EyeOff } from "lucide-react";
import * as THREE from "three";

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */

type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number;
    type: string;
  };
};

interface ShaderProps {
  source: string;
  uniforms: Uniforms;
  maxFps?: number;
}

interface SignInPageProps {
  className?: string;
}

/* ═══════════════════════════════════════════
   Canvas Reveal Effect (Dot Matrix)
   ═══════════════════════════════════════════ */

export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[0, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]}
          shader={`${reverse ? "u_reverse_active" : "false"}_;animation_speed_factor_${animationSpeed.toFixed(1)}_;`}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   Dot Matrix (WebGL Shader)
   ═══════════════════════════════════════════ */

interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = React.useMemo(() => {
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
    if (colors.length === 2) {
      colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    } else if (colors.length === 3) {
      colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [color[0] / 255, color[1] / 255, color[2] / 255]),
        type: "uniform3fv",
      },
      u_opacities: { value: opacities, type: "uniform1fv" },
      u_total_size: { value: totalSize, type: "uniform1f" },
      u_dot_size: { value: dotSize, type: "uniform1f" },
      u_reverse: {
        value: shader.includes("u_reverse_active") ? 1 : 0,
        type: "uniform1i",
      },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }

        // Badminton player silhouette using SDF shapes
        float playerSilhouette(vec2 uv) {
            uv.x -= 0.72;
            uv.y -= 0.50;
            uv *= 2.8;
            float s = 0.0;

            // Head
            s = max(s, 1.0 - smoothstep(0.07, 0.09, length(uv - vec2(0.0, 0.55))));

            // Neck
            float nk = (1.0 - smoothstep(0.02, 0.03, abs(uv.x))) * (1.0 - smoothstep(0.0, 0.05, abs(uv.y - 0.45)));
            s = max(s, nk);

            // Torso
            vec2 tu = uv - vec2(0.02, 0.2);
            float torso = (1.0 - smoothstep(0.08, 0.10, abs(tu.x))) * (1.0 - smoothstep(0.0, 0.20, abs(tu.y)));
            s = max(s, torso);

            // Right arm (up-right, holding racket)
            vec2 ar = uv - vec2(0.1, 0.35);
            float ca = cos(0.7); float sa2 = sin(0.7);
            vec2 arr = vec2(ar.x*ca - ar.y*sa2, ar.x*sa2 + ar.y*ca);
            float ra = (1.0 - smoothstep(0.02, 0.035, abs(arr.y))) * step(0.0, arr.x) * (1.0 - step(0.30, arr.x));
            s = max(s, ra);

            // Left arm (balance)
            vec2 al = uv - vec2(-0.1, 0.30);
            float cl = cos(-0.5); float sl = sin(-0.5);
            vec2 alr = vec2(al.x*cl - al.y*sl, al.x*sl + al.y*cl);
            float la = (1.0 - smoothstep(0.02, 0.03, abs(alr.y))) * step(-0.22, alr.x) * (1.0 - step(0.0, alr.x));
            s = max(s, la);

            // Racket handle
            vec2 hu = uv - vec2(0.24, 0.48);
            float ch = cos(0.6); float sh = sin(0.6);
            vec2 hr = vec2(hu.x*ch - hu.y*sh, hu.x*sh + hu.y*ch);
            float hdl = (1.0 - smoothstep(0.012, 0.02, abs(hr.y))) * step(0.0, hr.x) * (1.0 - step(0.12, hr.x));
            s = max(s, hdl);

            // Racket head (oval)
            vec2 ru = uv - vec2(0.34, 0.59);
            float cr = cos(0.3); float sr2 = sin(0.3);
            vec2 rr = vec2(ru.x*cr - ru.y*sr2, ru.x*sr2 + ru.y*cr);
            s = max(s, 1.0 - smoothstep(0.09, 0.11, length(rr * vec2(1.0, 1.4))));

            // Right leg (lunge forward)
            vec2 lr = uv - vec2(0.06, -0.15);
            float clr = cos(0.3); float slr = sin(0.3);
            vec2 lrr = vec2(lr.x*clr - lr.y*slr, lr.x*slr + lr.y*clr);
            float rl = (1.0 - smoothstep(0.03, 0.045, abs(lrr.x))) * step(-0.28, lrr.y) * (1.0 - step(0.0, lrr.y));
            s = max(s, rl);

            // Left leg (back)
            vec2 ll = uv - vec2(-0.05, -0.15);
            float cll = cos(-0.25); float sll = sin(-0.25);
            vec2 llr = vec2(ll.x*cll - ll.y*sll, ll.x*sll + ll.y*cll);
            float lll = (1.0 - smoothstep(0.03, 0.045, abs(llr.x))) * step(-0.28, llr.y) * (1.0 - step(0.0, llr.y));
            s = max(s, lll);

            // Shuttlecock (above racket)
            vec2 sc = uv - vec2(0.30, 0.78);
            s = max(s, 1.0 - smoothstep(0.025, 0.04, length(sc * vec2(1.0, 0.7))));

            return s;
        }

        void main() {
            vec2 st = fragCoord.xy;
            ${center.includes("x") ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));" : ""}
            ${center.includes("y") ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));" : ""}

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            // Badminton silhouette boost — dots inside are brighter
            vec2 normCoord = fragCoord.xy / u_resolution;
            float sil = playerSilhouette(normCoord);
            opacity *= (1.0 + sil * 3.0);
            color = mix(color, vec3(0.06, 0.88, 0.55), sil * 0.5);

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);

            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  );
};

/* ═══════════════════════════════════════════
   Three.js Shader Material
   ═══════════════════════════════════════════ */

const ShaderMaterial = ({
  source,
  uniforms,
  maxFps = 60,
}: {
  source: string;
  hovered?: boolean;
  maxFps?: number;
  uniforms: Uniforms;
}) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const timestamp = clock.getElapsedTime();
    const material: any = ref.current.material;
    material.uniforms.u_time.value = timestamp;
  });

  const getUniforms = () => {
    const preparedUniforms: any = {};
    for (const uniformName in uniforms) {
      const uniform: any = uniforms[uniformName];
      switch (uniform.type) {
        case "uniform1f":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1f" };
          break;
        case "uniform1i":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1i" };
          break;
        case "uniform3f":
          preparedUniforms[uniformName] = { value: new THREE.Vector3().fromArray(uniform.value as number[]), type: "3f" };
          break;
        case "uniform1fv":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1fv" };
          break;
        case "uniform3fv":
          preparedUniforms[uniformName] = {
            value: (uniform.value as number[][]).map((v: number[]) => new THREE.Vector3().fromArray(v)),
            type: "3fv",
          };
          break;
        case "uniform2f":
          preparedUniforms[uniformName] = { value: new THREE.Vector2().fromArray(uniform.value as number[]), type: "2f" };
          break;
        default:
          console.error(`Invalid uniform type for '${uniformName}'.`);
          break;
      }
    }
    preparedUniforms["u_time"] = { value: 0, type: "1f" };
    preparedUniforms["u_resolution"] = { value: new THREE.Vector2(size.width * 2, size.height * 2) };
    return preparedUniforms;
  };

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        precision mediump float;
        in vec2 coordinates;
        uniform vec2 u_resolution;
        out vec2 fragCoord;
        void main(){
          float x = position.x;
          float y = position.y;
          gl_Position = vec4(x, y, 0.0, 1.0);
          fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
          fragCoord.y = u_resolution.y - fragCoord.y;
        }
      `,
      fragmentShader: source,
      uniforms: getUniforms(),
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });
  }, [size.width, size.height, source]);

  return (
    <mesh ref={ref as any}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => {
  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
    </Canvas>
  );
};

/* ═══════════════════════════════════════════
   Sign In Page — GCU Sports themed
   ═══════════════════════════════════════════ */

export const SignInPage = ({ className }: SignInPageProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "success">("credentials");
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Quick reverse animation + navigate fast
    setReverseCanvasVisible(true);
    setTimeout(() => setInitialCanvasVisible(false), 50);
    setStep("success");

    setTimeout(() => {
      if (email === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }, 1500);
  };

  return (
    <div className={cn("flex w-full flex-col min-h-screen bg-black relative", className)}>
      {/* ═══ Canvas Background ═══ */}
      <div className="absolute inset-0 z-0">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[
                [16, 185, 129],   // emerald-500
                [5, 150, 105],    // emerald-600
                [52, 211, 153],   // emerald-400
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

        {/* Lighter vignette — dots stay visible, form area darkened */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_30%_50%,_rgba(0,0,0,0.82)_0%,_rgba(0,0,0,0.35)_55%,_rgba(0,0,0,0.1)_100%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/5 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      {/* ═══ Content Layer ═══ */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* ─── Top bar ─── */}
        <header className="flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white transition-transform duration-200 group-hover:scale-110">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="text-white font-bold tracking-tight text-lg">GCU Sports</span>
          </Link>
        </header>

        {/* ─── Main content ─── */}
        <div className="flex flex-1 flex-col justify-center items-center px-4 pb-20">
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait">
              {step === "credentials" ? (
                <motion.div
                  key="credentials-step"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-6 text-center"
                >
                  {/* Title */}
                  <div className="space-y-2">
                    <div className="flex justify-center mb-4">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <Trophy className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    <h1 className="text-[2.2rem] font-bold leading-[1.1] tracking-tight text-white">
                      Welcome <span className="text-emerald-400">Player</span>
                    </h1>
                    <p className="text-white/50 font-light">Sign in to book your next game</p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    {/* Google sign-in */}
                    <button
                      type="button"
                      className="backdrop-blur-sm w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full py-3 px-4 transition-all duration-200 hover:border-emerald-500/30"
                    >
                      <span className="text-lg font-bold">G</span>
                      <span className="text-sm">Sign in with Google</span>
                    </button>

                    <div className="flex items-center gap-4">
                      <div className="h-px bg-white/10 flex-1" />
                      <span className="text-white/30 text-xs uppercase tracking-widest">or</span>
                      <div className="h-px bg-white/10 flex-1" />
                    </div>

                    {/* Email */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Email or USN"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
                        required
                      />
                    </div>

                    {/* Password with show/hide toggle */}
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full backdrop-blur-sm bg-white/5 text-white border border-white/10 rounded-full py-3 px-5 pr-12 focus:outline-none focus:border-emerald-500/50 transition-colors text-center placeholder:text-white/30"
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

                    {/* Forgot password */}
                    <div className="text-right pr-2 -mt-1">
                      <a href="#" className="text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors">
                        Forgot password?
                      </a>
                    </div>

                    {/* Submit */}
                    <motion.button
                      type="submit"
                      className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3 hover:from-emerald-400 hover:to-emerald-500 transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Sign In
                    </motion.button>
                  </form>

                  {/* Sign up link */}
                  <p className="text-sm text-white/40 pt-1">
                    Don't have an account?{" "}
                    <a href="#" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                      Sign Up
                    </a>
                  </p>

                  <p className="text-xs text-white/30 pt-2">
                    Type <span className="font-bold text-emerald-400">admin</span> as email to access Admin Panel
                  </p>

                  <p className="text-xs text-white/25 pt-1">
                    By signing in, you agree to the{" "}
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
                      You're <span className="text-emerald-400">In!</span>
                    </h1>
                    <p className="text-white/50 font-light">Game on 🏆</p>
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
};
