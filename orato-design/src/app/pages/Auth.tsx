import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion"; 
import { Mail, Lock, User, AlertCircle, Loader2 } from "lucide-react";
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6 py-12">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>

      <motion.div 
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Orato</h1>
          <p className="text-slate-400">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          
          {/* Error Message Display */}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Full Name Field - Only show on Signup */}
            {mode === "signup" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                    placeholder="John Doe"
                    required={mode === "signup"}
                  />
                </div>
              </motion.div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
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
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg py-3 font-semibold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 flex items-center justify-center"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                mode === "login" ? "Sign In" : "Create Account"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-900 text-slate-500">Or continue with</span>
            </div>
          </div>

          {/* Toggle Mode */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {mode === "login" ? (
                <>Don't have an account? <span className="text-blue-500">Sign up</span></>
              ) : (
                <>Already have an account? <span className="text-blue-500">Sign in</span></>
              )}
            </button>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </motion.div>
    </div>
  );
}