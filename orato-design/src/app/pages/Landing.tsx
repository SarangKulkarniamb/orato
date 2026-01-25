import { useNavigate } from "react-router";
import { Mic } from "lucide-react";
import { motion } from "motion/react";

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Orato</h1>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-6">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Visual Element */}
          <motion.div 
            className="mb-12 relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div className="relative w-full max-w-2xl mx-auto aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 overflow-hidden">
              {/* PDF Mockup */}
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="w-full h-full bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm flex flex-col">
                  <div className="flex-1 p-6 space-y-3">
                    <div className="h-3 bg-white/20 rounded w-3/4"></div>
                    <div className="h-3 bg-white/20 rounded w-full"></div>
                    <div className="h-3 bg-white/20 rounded w-5/6"></div>
                  </div>
                </div>
              </div>
              
              {/* Microphone Icon Overlay */}
              <div className="absolute bottom-6 right-6">
                <div className="bg-blue-600 p-4 rounded-full shadow-2xl shadow-blue-500/50">
                  <Mic className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h2 
            className="text-6xl md:text-7xl font-bold mb-6 tracking-tight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            Present Hands-Free.
          </motion.h2>

          {/* Subtext */}
          <motion.p 
            className="text-xl md:text-2xl text-slate-400 mb-12 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            The AI-powered PDF presenter. Control your slides, zoom, and highlight using only your voice.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-lg font-semibold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 hover:scale-105"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate("/auth?mode=login")}
              className="px-8 py-4 bg-transparent border-2 border-slate-600 hover:border-slate-500 text-white rounded-lg text-lg font-semibold transition-all hover:bg-slate-800/50"
            >
              Login
            </button>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-slate-500 text-sm">
        <p>© 2026 Orato. Present smarter.</p>
      </footer>
    </div>
  );
}
