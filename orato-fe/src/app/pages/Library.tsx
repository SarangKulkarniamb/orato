import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Play, LogOut, Upload, Mic, MoreHorizontal, Trash2, Clock, Loader2, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useAuthStore from "../store/authStore";
import api from "../api/api";

interface Document {
  id: string;
  title: string;
  dateAdded: string;
  url: string;
  hue: "violet" | "cyan" | "fuchsia" | "emerald";
}

const hueMap = {
  violet: {
    bg: "bg-violet-500/[0.08]",
    border: "border-violet-500/10",
    icon: "text-violet-400",
    glow: "bg-violet-500/10",
  },
  cyan: {
    bg: "bg-cyan-500/[0.08]",
    border: "border-cyan-500/10",
    icon: "text-cyan-400",
    glow: "bg-cyan-500/10",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/[0.08]",
    border: "border-fuchsia-500/10",
    icon: "text-fuchsia-400",
    glow: "bg-fuchsia-500/10",
  },
  emerald: {
    bg: "bg-emerald-500/[0.08]",
    border: "border-emerald-500/10",
    icon: "text-emerald-400",
    glow: "bg-emerald-500/10",
  },
};

const hues: Document["hue"][] = ["violet", "cyan", "fuchsia", "emerald"];

// Helper to consistently assign a color based on the document ID
const getConsistentHue = (id: string): Document["hue"] => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hues[Math.abs(hash) % hues.length];
};

export function Library() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const token = useAuthStore((state) => state.token);
  const storedUser = useAuthStore((state) => state.user);
  const logoutAction = useAuthStore((state) => state.logout);
  const setUserAction = useAuthStore((state) => state.setUser);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate("/auth");
      return;
    }

    const initLibrary = async () => {
      try {
        if (!storedUser) {
          const userRes = await api.get("/auth/me");
          setUserAction(userRes.data);
        }

        const docsRes = await api.get("/auth/my-docs");
        const formattedDocs = docsRes.data.map((doc: any) => ({
          id: doc.id,
          title: doc.filename.replace(".pdf", ""),
          dateAdded: new Date(doc.uploaded_at).toLocaleDateString("en-US", { 
            month: "short", day: "numeric", year: "numeric" 
          }),
          url: doc.url,
          hue: getConsistentHue(doc.id) 
        }));
        setDocuments(formattedDocs);
      } catch (err) {
        console.error("Failed to load library data", err);
      } finally {
        setIsLoading(false);
      }
    };

    initLibrary();
  }, [token, navigate, storedUser, setUserAction]);

  const handleLogout = () => {
    logoutAction();
    navigate("/");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    try {
      const response = await api.post("/auth/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newDoc: Document = {
        id: response.data.id,
        title: response.data.filename.replace(".pdf", ""),
        dateAdded: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        url: `http://127.0.0.1:8000/uploads/${response.data.filename}`,
        hue: getConsistentHue(response.data.id)
      };
      
      setDocuments((prev) => [newDoc, ...prev]);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  };

  const handlePresent = (docId: string) => {
    navigate(`/presentation/${docId}`);
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm("Are you sure you want to delete this presentation?")) return;

    try {
      await api.delete(`/auth/delete-doc/${docId}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
      setMenuOpenId(null);
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete document");
    }
  };

  if (isLoading || !storedUser) {
    return (
      <div className="min-h-screen bg-[#080b14] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
      </div>
    );
  }

  const initial = storedUser.email[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen bg-[#080b14]" onClick={() => setMenuOpenId(null)}>
      {/* Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/[0.05] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/[0.03] rounded-full blur-[90px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 bg-[#080b14]/80 border-b border-white/[0.05] sticky top-0 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#8b5cf6] rounded-lg flex items-center justify-center shadow-lg shadow-violet-600/25">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-white">Orato</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:inline">{storedUser.email}</span>
            <div className="w-8 h-8 bg-violet-500/15 border border-violet-500/25 rounded-full flex items-center justify-center text-violet-400 text-xs font-bold">
              {initial}
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-white/[0.06]"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1.5 tracking-tight">Your presentations</h2>
            <p className="text-sm text-slate-400">
              {documents.length} document{documents.length !== 1 ? "s" : ""} · Upload PDFs to present with voice
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#8b5cf6] hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-violet-600/20 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isUploading ? "Processing..." : "Upload PDF"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          
          {/* Upload card */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className={`aspect-[3/4] rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group ${isUploading ? 'border-violet-500/50 bg-violet-500/[0.05]' : 'border-white/[0.08] hover:border-violet-500/30 bg-white/[0.01] hover:bg-violet-500/[0.02]'}`}
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 group-hover:bg-violet-500/15 flex items-center justify-center transition-colors">
              {isUploading ? <Loader2 className="w-6 h-6 text-violet-400 animate-spin" /> : <Plus className="w-6 h-6 text-violet-400" />}
            </div>
            <div className="text-center px-4">
              <p className="text-[15px] font-medium text-slate-300 mb-1">{isUploading ? "AI Processing..." : "Upload PDF"}</p>
              <p className="text-xs text-slate-500">{isUploading ? "Extracting context" : "Click to browse files"}</p>
            </div>
          </motion.div>

          {/* Document cards */}
          <AnimatePresence>
            {documents.map((doc, index) => {
              const h = hueMap[doc.hue];
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  className="aspect-[3/4] rounded-2xl bg-[#0e1120] border border-white/[0.08] overflow-hidden group relative hover:border-white/[0.12] transition-colors shadow-lg cursor-pointer"
                  // 🔥 FIX: Make the entire card clickable to open the presentation
                  onClick={() => handlePresent(doc.id)} 
                >
                  {/* Thumbnail Area */}
                  <div className={`h-3/4 relative flex items-center justify-center ${h.bg}`}>
                    {/* Subtle center glow */}
                    <div className={`absolute inset-0 ${h.glow} opacity-50 blur-2xl`} />
                    <FileText className={`w-14 h-14 ${h.icon} opacity-30 relative z-10`} />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                      <motion.button
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.94 }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-950 rounded-xl p-3.5 shadow-xl"
                      >
                        <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
                      </motion.button>
                    </div>

                    {/* 3-dot menu */}
                    <div className="absolute top-3 right-3 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 🔥 Prevents card click from firing
                          setMenuOpenId(menuOpenId === doc.id ? null : doc.id);
                        }}
                        className="w-8 h-8 rounded-lg bg-[#0e1120]/80 border border-white/[0.08] flex items-center justify-center text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {menuOpenId === doc.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-10 w-36 bg-[#171b2e] border border-white/[0.09] rounded-xl overflow-hidden shadow-2xl"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // 🔥 Prevents menu click from bubbling
                                handlePresent(doc.id);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Present
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // 🔥 Prevents menu click from bubbling
                                handleDelete(doc.id);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/[0.08] flex items-center gap-2.5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Info footer */}
                  <div className="h-1/4 px-5 py-4 bg-[#0e1120] border-t border-white/[0.04] flex flex-col justify-center">
                    <h3 className="text-[15px] font-semibold text-slate-100 truncate mb-1.5">{doc.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {doc.dateAdded}
                      </span>
                      <span>PDF</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {documents.length === 0 && !isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-28 text-center"
          >
            <div className="w-16 h-16 bg-slate-800/60 rounded-xl flex items-center justify-center mx-auto mb-5 border border-white/[0.05]">
              <Upload className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-white text-xl font-semibold mb-2">No presentations yet</h3>
            <p className="text-sm text-slate-500">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-violet-400 hover:text-violet-300 transition-colors font-medium mr-1.5"
              >
                Upload your first PDF
              </button>
              to start using Orato's AI features.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  );
}