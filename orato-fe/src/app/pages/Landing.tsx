import { useNavigate } from "react-router-dom";
import { Mic, Zap, Shield, Sparkles, ArrowRight, CheckCircle2, Play, FileText, Wand2, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import useAuthStore from "../store/authStore";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
});

export function Landing() {
  const navigate = useNavigate();
  const storedUser = useAuthStore((state) => state.user);

  const features = [
    {
      icon: Mic,
      title: "Voice Control",
      description: "Navigate slides, zoom, and highlight — all hands-free with natural language.",
      iconClass: "text-violet-400",
      bgClass: "bg-violet-500/10",
    },
    {
      icon: Zap,
      title: "Instant Response",
      description: "Commands are processed in real time with low-latency AI inference.",
      iconClass: "text-cyan-400",
      bgClass: "bg-cyan-500/10",
    },
    {
      icon: Shield,
      title: "Private & Secure",
      description: "Your documents stay on your device. We never store your slides.",
      iconClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
    },
    {
      icon: Sparkles,
      title: "Smart Context",
      description: "Understands intent, not just keywords — built on advanced AI.",
      iconClass: "text-fuchsia-400",
      bgClass: "bg-fuchsia-500/10",
    },
  ];

  const voiceCommands = [
    "Next slide",
    "Go to page 5",
    "Zoom in",
    "Highlight this",
    "Previous slide",
  ];

  return (
    <div className="min-h-screen bg-[#080b14] text-white overflow-x-hidden font-sans">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div className="absolute w-[900px] h-[700px] rounded-full bg-violet-600/[0.05] blur-[150px] top-[5%]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.05] backdrop-blur-sm bg-[#080b14]/50">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex justify-between items-center">
          <motion.div className="flex items-center gap-2.5" {...fadeUp(0)}>
            <div className="w-8 h-8 bg-[#8b5cf6] rounded-lg flex items-center justify-center shadow-lg shadow-violet-600/30">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Orato</span>
          </motion.div>

          <motion.div className="flex items-center gap-4" {...fadeUp(0)}>
            {storedUser ? (
               <button
                onClick={() => navigate("/library")}
                className="px-5 py-2 text-sm bg-[#8b5cf6] hover:bg-violet-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-violet-600/20"
              >
                Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/auth?mode=login")}
                  className="px-2 py-1.5 text-sm text-slate-300 hover:text-white transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate("/auth?mode=signup")}
                  className="px-5 py-2 text-sm bg-[#8b5cf6] hover:bg-violet-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-violet-600/20"
                >
                  Get started
                </button>
              </>
            )}
          </motion.div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <div className="w-full px-6 pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="text-center max-w-6xl mx-auto">
            {/* Badge */}
            <motion.div {...fadeUp(0.05)} className="mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded-full text-xs font-medium text-violet-300">
                <Sparkles className="w-3.5 h-3.5" />
                AI-powered voice presentations
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h2
              className="text-6xl md:text-7xl lg:text-[84px] font-bold mb-6 tracking-tight leading-[1.05]"
              {...fadeUp(0.1)}
            >
              Present without
              <br />
              <span className="bg-gradient-to-r from-violet-300 to-purple-500 bg-clip-text text-transparent">lifting a finger</span>
            </motion.h2>

            <motion.p
              className="text-lg md:text-[20px] text-slate-400 mb-10 max-w-[560px] mx-auto leading-relaxed"
              {...fadeUp(0.15)}
            >
              Orato lets you control your PDF presentations entirely by voice.
              Navigate, zoom, and highlight — naturally.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10"
              {...fadeUp(0.2)}
            >
              <button
                onClick={() => navigate(storedUser ? "/library" : "/auth?mode=signup")}
                className="group px-8 py-3.5 bg-[#8b5cf6] hover:bg-violet-500 text-white rounded-full font-medium transition-all flex items-center gap-2 shadow-xl shadow-violet-600/25"
              >
                {storedUser ? "Go to Dashboard" : "Start free trial"}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate("/library")}
                className="group px-8 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.12] text-slate-200 rounded-full font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-slate-200" />
                See a demo
              </button>
            </motion.div>

            {/* Trust chips */}
            <motion.div
              className="flex flex-wrap justify-center gap-6 text-sm text-slate-500"
              {...fadeUp(0.25)}
            >
              {["Real-time", "No credit card", "Setup in 30 seconds"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#8b5cf6]" />
                  <span>{item}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* 🔥 BIGGER, WIDER App preview mockup 🔥 */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mt-24 relative max-w-[1200px] w-full mx-auto"
          >
            {/* Top edge glow */}
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-1/2 h-12 bg-violet-500/10 blur-3xl rounded-full" />

            <div className="relative bg-[#0a0d18] rounded-2xl border border-white/[0.07] overflow-hidden shadow-2xl shadow-black/80">
              {/* Browser bar */}
              <div className="flex items-center gap-3 px-5 py-4 bg-[#0d101d] border-b border-white/[0.05]">
                <div className="flex gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-700" />
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-700" />
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-700" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-6 py-1.5 bg-slate-800/40 rounded-md text-xs text-slate-500 font-mono">
                    app.orato.com/present
                  </div>
                </div>
              </div>

              {/* Presentation area */}
              <div className="aspect-[16/9] bg-[#05070e] relative flex items-center justify-center">
                {/* Slide mockup - Scaled up to 75% */}
                <div className="w-[75%] h-[75%] bg-[#0e1120] rounded-2xl border border-white/[0.04] p-10 flex flex-col gap-6 shadow-2xl">
                  <div className="h-5 bg-violet-400/20 rounded-md w-1/3 mb-2" />
                  <div className="space-y-4">
                    <div className="h-3 bg-white/[0.04] rounded w-full" />
                    <div className="h-3 bg-white/[0.04] rounded w-11/12" />
                    <div className="h-3 bg-white/[0.04] rounded w-4/5" />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-6 pt-4">
                    <div className="bg-white/[0.02] rounded-xl border border-white/[0.03]" />
                    <div className="bg-white/[0.02] rounded-xl border border-white/[0.03]" />
                  </div>
                </div>

                {/* Animated command chips */}
                {voiceCommands.map((cmd, i) => (
                  <motion.div
                    key={cmd}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: [0, 1, 1, 0], x: [20, 0, 0, -20] }}
                    transition={{
                      duration: 3,
                      delay: i * 3,
                      repeat: Infinity,
                      repeatDelay: (voiceCommands.length - 1) * 3,
                    }}
                    className="absolute top-12 right-12 px-5 py-2.5 bg-slate-800/90 border border-white/[0.08] rounded-full text-xs text-slate-200 backdrop-blur-md shadow-xl"
                  >
                    "{cmd}"
                  </motion.div>
                ))}

                {/* Voice UI bar */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
                  <div className="bg-[#0e1120]/95 border border-white/[0.09] rounded-2xl px-6 py-3.5 flex items-center gap-4 shadow-2xl backdrop-blur-md">
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                      className="w-2.5 h-2.5 rounded-full bg-red-500"
                    />
                    <span className="text-sm font-medium text-slate-300">Listening...</span>
                    <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center shadow-md shadow-violet-600/30">
                      <Mic className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Features */}
        <div className="max-w-[1200px] mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <h3 className="text-2xl md:text-4xl font-semibold text-white mb-4">
              Built for the modern presenter
            </h3>
            <p className="text-slate-400 text-[17px]">
              Every feature designed to keep your focus on the content, not the controls.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.45 }}
                className="p-8 bg-[#0e1120]/50 border border-white/[0.06] rounded-2xl hover:bg-[#0e1120] hover:border-white/[0.10] transition-colors"
              >
                <div className={`w-12 h-12 ${feature.bgClass} rounded-xl flex items-center justify-center mb-6`}>
                  <feature.icon className={`w-6 h-6 ${feature.iconClass}`} />
                </div>
                <h4 className="text-lg font-medium text-white mb-2">{feature.title}</h4>
                <p className="text-[15px] text-slate-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="max-w-[1200px] mx-auto px-6 py-12 pb-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="relative rounded-3xl overflow-hidden"
          >
            {/* BG */}
            <div className="absolute inset-0 bg-[#0e1120]" />
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-600/5" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />

            <div className="relative border border-white/[0.06] rounded-3xl p-14 md:p-24 text-center">
              <h3 className="text-4xl md:text-[44px] font-bold text-white mb-6 leading-tight">
                Ready to present like never before?
              </h3>
              <p className="text-slate-400 text-[17px] mb-10 max-w-xl mx-auto leading-relaxed">
                Start using Orato today and experience the future of hands-free presentations.
              </p>
              <button
                onClick={() => navigate(storedUser ? "/library" : "/auth?mode=signup")}
                className="group px-10 py-4 bg-[#8b5cf6] hover:bg-violet-500 text-white rounded-full text-lg font-medium transition-all inline-flex items-center gap-3 shadow-xl shadow-violet-600/25"
              >
                {storedUser ? "Go to Dashboard" : "Get started — it's free"}
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <p className="text-sm text-slate-500 mt-6">No credit card required</p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04] py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#8b5cf6] rounded flex items-center justify-center">
              <Mic className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-300">Orato</span>
          </div>
          <p className="text-sm text-slate-600">© 2026 Orato. Present smarter, hands-free.</p>
        </div>
      </footer>
    </div>
  );
}