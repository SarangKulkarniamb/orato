import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; 
import { Mail, Lock, User, AlertCircle, Loader2, Mic } from "lucide-react";
import api from "../api/api"; 
import useAuthStore from "../store/authStore";

export function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // New states for API handling
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zustand action
  const loginAction = useAuthStore((state) => state.login);

  
const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    console.log(`[AUTH DEBUG] 1. Starting form submission in mode: ${mode}`);

    try {
      if (mode === "signup") {
        console.log("[AUTH DEBUG] 2. Attempting registration...");
        const regRes = await api.post("/auth/register", {
          full_name: fullName,
          email,
          password,
        });
        console.log("[AUTH DEBUG] 3. Registration successful! Response:", regRes.data);
      }

      console.log("[AUTH DEBUG] 4. Attempting login...");
      const loginRes = await api.post("/auth/login", { email, password });
      
      console.log("[AUTH DEBUG] 5. Login response received:", loginRes.data);

      // Verify the token actually exists in the response
      const token = loginRes.data.access_token;
      if (!token) {
        console.error("[AUTH DEBUG] 🚨 CRITICAL: access_token is missing from the response!");
      }

      console.log("[AUTH DEBUG] 6. Saving token via Zustand action...");
      loginAction(token);

      // fetch user profile immediately so we can show email in library etc.
      try {
        const profile = await api.get("/auth/me");
        console.log("[AUTH DEBUG] 6a. Retrieved profile:", profile.data);
        // use store helper imported above
        useAuthStore.getState().setUser(profile.data);
      } catch (profileErr) {
        console.error("[AUTH DEBUG] 6b. Failed to fetch profile after login", profileErr);
      }

      // Verify it actually saved to the browser
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('orato_user');
      console.log("[AUTH DEBUG] 7. Token in localStorage:", savedToken ? "✅" : "❌");
      console.log("[AUTH DEBUG] 7a. User in localStorage:", savedUser ? "✅" : "❌");

      console.log("[AUTH DEBUG] 8. Triggering navigate('/library')...");
      navigate("/library");
      
    } catch (err: any) {
      console.error("[AUTH DEBUG] 🚨 Error caught in catch block:", err);
      
      const errorMessage = err.response?.data?.detail || "Something went wrong. Please try again.";
      if (Array.isArray(errorMessage)) {
        setError(errorMessage[0].msg);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
      console.log("[AUTH DEBUG] 9. Loading state set to false.");
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-white flex items-center justify-center px-6 py-12 relative overflow-hidden font-sans">
      
      {/* Ambient Glows (Matches Landing Page) */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[600px] h-[500px] bg-violet-600/[0.07] rounded-full blur-[120px]" />
        <div className="absolute w-[400px] h-[300px] bg-cyan-500/[0.04] rounded-full blur-[100px] translate-y-24" />
      </div>

      <motion.div 
        className="relative z-10 w-full max-w-[420px]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-[#8b5cf6] rounded-2xl flex items-center justify-center shadow-lg shadow-violet-600/30 mx-auto mb-5">
            <Mic className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-[15px] text-slate-400">
            {mode === "login" ? "Enter your details to access your presentations." : "Start presenting hands-free today."}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#0e1120] border border-white/[0.06] rounded-3xl p-8 shadow-2xl relative">
          
          {/* Error Message Display */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center text-red-400 text-sm overflow-hidden"
              >
                <AlertCircle className="w-4 h-4 mr-2.5 flex-shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Full Name Field - Only show on Signup */}
            <AnimatePresence>
              {mode === "signup" && (
                <motion.div
                  initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                  animate={{ opacity: 1, height: "auto", overflow: "visible" }}
                  exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                >
                  <label htmlFor="fullName" className="block text-[13px] font-medium text-slate-300 mb-2 mt-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-[#080b14] border border-white/[0.08] hover:border-white/[0.15] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                      placeholder="John Doe"
                      required={mode === "signup"}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#080b14] border border-white/[0.08] hover:border-white/[0.15] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#080b14] border border-white/[0.08] hover:border-white/[0.15] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#8b5cf6] hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3.5 mt-2 font-medium transition-all shadow-lg shadow-violet-600/20 hover:shadow-violet-600/40 flex items-center justify-center gap-2.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                mode === "login" ? "Sign In" : "Create Account"
              )}
            </button>
          </form>

          {/* Toggle Mode */}
          <div className="mt-7 pt-6 border-t border-white/[0.06] text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-[14px] text-slate-400 hover:text-white transition-colors"
            >
              {mode === "login" ? (
                <>Don't have an account? <span className="text-violet-400 font-medium ml-1 hover:text-violet-300">Sign up</span></>
              ) : (
                <>Already have an account? <span className="text-violet-400 font-medium ml-1 hover:text-violet-300">Sign in</span></>
              )}
            </button>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-[13px] text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center gap-1.5 mx-auto"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Back to home
          </button>
        </div>
      </motion.div>
    </div>
  );
}











