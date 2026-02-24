import { useNavigate } from "react-router-dom";
import { Mic, Zap, Shield, Sparkles, ArrowRight, CheckCircle2, Play } from "lucide-react";
import { motion } from "motion/react";
import useAuthStore from "../store/authStore";
export function Landing() {
  const navigate = useNavigate();

  const storedUser =  useAuthStore((state) => state.user);

  const features = [
    {
      icon: Mic,
      title: "Voice Control",
      description: "Navigate slides, zoom, and highlight - all hands-free"
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Instant response to your commands with AI processing"
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your presentations stay secure and private"
    },
    {
      icon: Sparkles,
      title: "Smart AI",
      description: "Understands natural language and context"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-blue-950/20 via-slate-950 to-slate-950 pointer-events-none"></div>
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-10 p-6 border-b border-slate-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.h1 
            className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            Orato
          </motion.h1>
          <motion.button
            onClick={() => navigate("/auth?mode=login")}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            { storedUser ? "Dashboard" : "Login" }
          </motion.button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-32">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-full mb-8"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300">AI-Powered Presentations</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h2 
              className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Present
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Hands-Free.
              </span>
            </motion.h2>

            {/* Subtext */}
            <motion.p 
              className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              Control your slides, zoom, and highlight with just your voice.
              <br className="hidden md:block" />
              The future of presentations is here.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
            >
              <button
                onClick={() => navigate("/auth?mode=signup")}
                className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-semibold transition-all shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-105 flex items-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => navigate("/library")}
                className="group px-8 py-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-white rounded-xl font-semibold transition-all backdrop-blur-sm flex items-center gap-2"
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </button>
            </motion.div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.4, duration: 1, type: "spring" }}
            className="relative max-w-5xl mx-auto"
          >
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-purple-600/20 blur-3xl"></div>
            
            <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-3xl border border-slate-700/50 backdrop-blur-xl overflow-hidden shadow-2xl">
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/80 border-b border-slate-700/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-slate-800/50 rounded text-xs text-slate-400">
                    orato.app/presentation
                  </div>
                </div>
              </div>

              {/* PDF Mockup */}
              <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-900 p-8">
                <div className="w-full h-full bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm p-8">
                  {/* Mock Slide Content */}
                  <div className="space-y-4">
                    <div className="h-6 bg-gradient-to-r from-blue-400/40 to-purple-400/40 rounded w-2/3"></div>
                    <div className="h-3 bg-white/20 rounded w-full"></div>
                    <div className="h-3 bg-white/20 rounded w-5/6"></div>
                    <div className="h-3 bg-white/20 rounded w-4/6"></div>
                    
                    <div className="pt-6 grid grid-cols-2 gap-4">
                      <div className="h-20 bg-white/5 rounded-lg border border-white/10"></div>
                      <div className="h-20 bg-white/5 rounded-lg border border-white/10"></div>
                    </div>
                  </div>
                </div>
                
                {/* Voice Control UI */}
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2"
                >
                  <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-full px-6 py-3 shadow-2xl flex items-center gap-3">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-2 h-2 rounded-full bg-red-500"
                    ></motion.div>
                    <span className="text-sm text-white font-medium">
                      "Next slide"
                    </span>
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Mic className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Features Section */}
        <div className="max-w-7xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h3 className="text-3xl md:text-5xl font-bold mb-4">
              Everything you need to
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"> present better</span>
            </h3>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Orato combines cutting-edge AI with intuitive design to transform how you present
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                whileHover={{ y: -5 }}
                className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm hover:border-blue-500/50 transition-all group"
              >
                <div className="w-12 h-12 bg-blue-600/10 group-hover:bg-blue-600/20 rounded-xl flex items-center justify-center mb-4 transition-colors">
                  <feature.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h4 className="text-xl font-semibold mb-2">{feature.title}</h4>
                <p className="text-slate-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Social Proof */}
        <div className="max-w-7xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-slate-800 rounded-3xl p-12 text-center backdrop-blur-sm"
          >
            <h3 className="text-3xl md:text-4xl font-bold mb-6">
              Trusted by presenters worldwide
            </h3>
            <div className="flex flex-wrap justify-center gap-8 mb-8">
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  10K+
                </div>
                <div className="text-slate-400 mt-1">Presentations</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  5K+
                </div>
                <div className="text-slate-400 mt-1">Active Users</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  99%
                </div>
                <div className="text-slate-400 mt-1">Satisfaction</div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>Free forever</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>Setup in 30 seconds</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Final CTA */}
        <div className="max-w-7xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h3 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to transform your presentations?
            </h3>
            <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
              Join thousands of presenters who are already presenting hands-free with Orato
            </p>
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="group px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-lg font-semibold transition-all shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:scale-105 inline-flex items-center gap-2"
            >
              Start Presenting Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/50 p-8 text-center text-slate-500">
        <p>© 2026 Orato. Present smarter, hands-free.</p>
      </footer>
    </div>
  );
}
