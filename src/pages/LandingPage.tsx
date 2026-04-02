import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { Button } from "@/components/ui/button";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { SportsScene3D } from "@/components/SportsScene3D";
import GcuLogo from "@/components/GcuLogo";
import { Trophy, ArrowRight, Clock, Users, CalendarCheck, Zap, Shield, Star } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [iconsVisible, setIconsVisible] = useState(false);

  /* Show 3D models after a short delay */
  useEffect(() => {
    const timer = setTimeout(() => setIconsVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  /* Mouse tracking for parallax */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMouse({ x, y });
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    el.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => el.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-extrabold text-lg text-primary">
            <GcuLogo />
            <span className="tracking-tight">GCU Sports</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#facilities" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Facilities</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How it Works</a>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-xl hidden sm:inline-flex"
              onClick={() => navigate("/login")}
            >
              Sign In
            </Button>
            <Button
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-200"
              onClick={() => navigate("/login")}
            >
              Book Now <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section with Spline 3D ── */}
      <section className="relative overflow-hidden">
        <Card ref={heroRef} className="w-full min-h-[600px] md:min-h-[700px] bg-black/[0.96] relative overflow-hidden rounded-none border-0">
          {/* Turf background — subtly visible */}
          <div
            className="absolute inset-0 z-0 opacity-[0.06]"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=1920&q=80&fit=crop')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/80 via-black/60 to-black/90" />

          {/* Sports-colored glow reflections */}
          <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-amber-500/8 blur-[120px] animate-pulse z-0" />
          <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px] rounded-full bg-emerald-500/10 blur-[100px] animate-pulse z-0" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 right-[15%] w-[350px] h-[350px] rounded-full bg-blue-500/8 blur-[100px] animate-pulse z-0" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-[20%] left-[55%] w-[300px] h-[300px] rounded-full bg-red-500/6 blur-[80px] animate-pulse z-0" style={{ animationDelay: '1.5s' }} />

          <Spotlight
            className="-top-40 left-0 md:left-60 md:-top-20"
            fill="white"
          />

          <div className="flex flex-col md:flex-row h-full min-h-[600px] md:min-h-[700px] relative z-10">
            {/* Left content */}
            <div className="flex-1 p-8 md:p-16 lg:p-20 relative z-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 mb-6 w-fit animate-fade-up">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">University Sports Platform</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 tracking-tight leading-[1.1] animate-fade-up" style={{ animationDelay: '0.1s' }}>
                Your Campus Sports,{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  Booking Made Seamless
                </span>
              </h1>

              <p className="mt-6 text-neutral-400 max-w-lg text-base md:text-lg leading-relaxed animate-fade-up" style={{ animationDelay: '0.2s' }}>
                Book cricket turfs, futsal courts, and badminton courts in seconds.
                Real-time availability, instant confirmation, and seamless scheduling for university students.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-8 animate-fade-up" style={{ animationDelay: '0.3s' }}>
                <Button
                  size="lg"
                  className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-8 text-sm font-bold hover:shadow-xl hover:shadow-emerald-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                  onClick={() => navigate("/login")}
                >
                  <CalendarCheck className="mr-2 h-4.5 w-4.5" />
                  Explore Facilities
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl h-12 px-8 text-sm font-bold border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all duration-200"
                  onClick={() => navigate("/login")}
                >
                  Learn More
                </Button>
              </div>

              {/* Stats row */}
              <div className="flex gap-8 mt-10 animate-fade-up" style={{ animationDelay: '0.4s' }}>
                <div>
                  <div className="text-2xl font-extrabold text-white">148+</div>
                  <div className="text-xs text-neutral-500 font-medium mt-0.5">Total Bookings</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-white">67</div>
                  <div className="text-xs text-neutral-500 font-medium mt-0.5">Active Users</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-white">3</div>
                  <div className="text-xs text-neutral-500 font-medium mt-0.5">Sports Available</div>
                </div>
              </div>
            </div>

            {/* Right — 3D Sports Models Scene */}
            <div className="flex-1 relative min-h-[300px] md:min-h-0">
              <div
                className="w-full h-full transition-all duration-700 ease-out"
                style={{
                  opacity: iconsVisible ? 1 : 0,
                  transform: `scale(${iconsVisible ? 1 : 0.9})`,
                }}
              >
                <SportsScene3D className="w-full h-full" mouse={mouse} />
              </div>

              {/* "Multi-Sport Booking Platform" badge */}
              <div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-all duration-700"
                style={{
                  opacity: iconsVisible ? 1 : 0,
                  transform: `translateX(-50%) translateY(${iconsVisible ? 0 : 12}px)`,
                  transitionDelay: '0.5s',
                }}
              >
                <div className="inline-flex items-center gap-2.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur-md px-5 py-2.5 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-white/80 uppercase tracking-[0.15em]">Multi-Sport Booking Platform</span>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="py-20 lg:py-28 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 mb-4">
              <Star className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Why GCU Sports</span>
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
              Everything you need to book sports
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              A modern platform designed for university students to manage their sports facility bookings effortlessly.
            </p>
          </div>

          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Zap className="h-5 w-5" />, title: "Instant Booking", desc: "Book your slot in seconds with real-time availability updates. No waiting, no hassle." },
              { icon: <Clock className="h-5 w-5" />, title: "Flexible Scheduling", desc: "Postpone or cancel bookings with one click. Your schedule, your rules." },
              { icon: <Shield className="h-5 w-5" />, title: "Guaranteed Slots", desc: "Once booked, your slot is confirmed and protected. No double bookings ever." },
              { icon: <Users className="h-5 w-5" />, title: "Team Friendly", desc: "Book for your team or individually. Manage group sessions effortlessly." },
              { icon: <CalendarCheck className="h-5 w-5" />, title: "Smart Calendar", desc: "View all available slots at a glance. Color-coded status makes choosing easy." },
              { icon: <Trophy className="h-5 w-5" />, title: "Multi-Sport", desc: "Cricket, Futsal, Badminton — all your favourite sports in one platform." },
            ].map((feature, i) => (
              <li key={feature.title} className="list-none min-h-[14rem] animate-fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={3}
                  />
                  <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                    <div className="relative flex flex-1 flex-col justify-between gap-3">
                      <div className="w-fit rounded-lg border-[0.75px] border-border bg-muted p-2.5 text-emerald-600 dark:text-emerald-400">
                        {feature.icon}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl leading-[1.375rem] font-semibold tracking-[-0.04em] text-foreground">
                          {feature.title}
                        </h3>
                        <p className="text-sm leading-[1.375rem] text-muted-foreground">
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Facilities Section ── */}
      <section id="facilities" className="py-20 lg:py-28 px-4 sm:px-6 bg-muted/30">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
              Featured Facilities
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Professional-grade sports facilities equipped for competitive and recreational play.
            </p>
          </div>

          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { emoji: "🏏", name: "Cricket Turf", desc: "Professional cricket turf with floodlights for day and night play.", slots: 5, img: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=600&h=400&fit=crop" },
              { emoji: "⚽", name: "Futsal Court", desc: "Indoor futsal court with synthetic turf and professional markings.", slots: 3, img: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=400&fit=crop" },
              { emoji: "🏸", name: "Badminton Courts", desc: "Indoor badminton courts with wooden flooring and proper lighting.", slots: 7, img: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&h=400&fit=crop" },
            ].map((facility, i) => (
              <li key={facility.name} className="list-none animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={3}
                  />
                  <div className="relative overflow-hidden rounded-xl border-[0.75px] bg-background shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={facility.img}
                        alt={facility.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 text-white">
                        <span className="text-3xl mr-2">{facility.emoji}</span>
                        <span className="text-lg font-bold">{facility.name}</span>
                      </div>
                    </div>
                    <div className="p-6">
                      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{facility.desc}</p>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <CalendarCheck className="h-3.5 w-3.5" />
                          {facility.slots} slots available
                        </span>
                        <Button
                          size="sm"
                          className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-200 hover:shadow-md hover:shadow-emerald-500/20 hover:-translate-y-0.5"
                          onClick={() => navigate("/login")}
                        >
                          Book Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section id="how-it-works" className="py-20 lg:py-28 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
              How it Works
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to get your game on.
            </p>
          </div>

          <ul className="grid gap-8 sm:grid-cols-3 max-w-4xl mx-auto">
            {[
              { step: "01", icon: <Trophy className="h-6 w-6" />, title: "Pick a Sport", desc: "Browse our available sports — Cricket, Futsal, or Badminton." },
              { step: "02", icon: <Clock className="h-6 w-6" />, title: "Select Your Time", desc: "Choose from real-time available slots that fit your schedule." },
              { step: "03", icon: <CalendarCheck className="h-6 w-6" />, title: "Confirm Booking", desc: "Confirm your slot instantly. Manage, postpone, or cancel anytime." },
            ].map((step, i) => (
              <li key={step.step} className="list-none animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                  <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={3}
                  />
                  <div className="relative flex flex-col items-center text-center overflow-hidden rounded-xl border-[0.75px] bg-background p-8 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                    <div className="text-5xl font-extrabold text-emerald-500/15 mb-2">{step.step}</div>
                    <div className="w-fit rounded-xl bg-emerald-100 dark:bg-emerald-900/30 p-3 text-emerald-600 dark:text-emerald-400 mb-4">
                      {step.icon}
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Card className="relative overflow-hidden bg-black/[0.96] border-0 rounded-3xl p-12 md:p-16 text-center">
            <Spotlight
              className="-top-40 left-10 md:left-60 md:-top-20"
              fill="rgba(16, 185, 129, 0.3)"
            />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400 tracking-tight mb-4">
                Ready to Book Your Slot?
              </h2>
              <p className="text-neutral-400 max-w-lg mx-auto mb-8">
                Join 67+ active students already using GCU Sports. Your next game is just a click away.
              </p>
              <Button
                size="lg"
                className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-10 text-sm font-bold hover:shadow-xl hover:shadow-emerald-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                onClick={() => navigate("/")}
              >
                <CalendarCheck className="mr-2 h-4.5 w-4.5" />
                Get Started Now
              </Button>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t bg-card/50 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5 font-extrabold text-lg text-primary mb-4">
                <GcuLogo className="h-8 w-8" />
                GCU Sports
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                University Sports Slot Booking System. Making campus sports accessible for everyone.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-foreground mb-3 text-sm">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#facilities" className="hover:text-foreground transition-colors">Facilities</a></li>
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a></li>
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-foreground mb-3 text-sm">Sports</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>🏏 Cricket Turf</li>
                <li>⚽ Futsal Court</li>
                <li>🏸 Badminton Courts</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-foreground mb-3 text-sm">Contact</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>sports@university.edu</li>
                <li>+91 98765 43210</li>
                <li>Sports Complex, Main Campus</li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-10 pt-6 text-center text-xs text-muted-foreground">
            © 2026 GCU Sports. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
