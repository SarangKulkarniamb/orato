import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Play, LogOut, Upload, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion"; 
import useAuthStore from "../store/authStore";
import api from "../api/api";

interface Document {
  id: string;
  title: string;
  dateAdded: string;
  thumbnail: string;
  url: string;
}

export function Library() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const token = useAuthStore((state) => state.token);
  const storedUser = useAuthStore((state) => state.user);
  const logoutAction = useAuthStore((state) => state.logout);
  const setUserAction = useAuthStore((state) => state.setUser);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch documents and user profile on mount
  useEffect(() => {
    if (!token) {
      navigate("/auth");
      return;
    }

    const initLibrary = async () => {
      try {
        // Fetch User Profile if not in store
        if (!storedUser) {
          const userRes = await api.get("/auth/me");
          setUserAction(userRes.data);
        }

        // Fetch Documents from Backend
        const docsRes = await api.get("/auth/my-docs");
        const formattedDocs = docsRes.data.map((doc: any) => ({
          id: doc.id,
          title: doc.filename,
          dateAdded: new Date(doc.uploaded_at).toLocaleDateString("en-US", { 
            month: "short", day: "numeric", year: "numeric" 
          }),
          thumbnail: "#3b82f6", // Default color, or generate based on ID
          url: doc.url
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 2. Real API Upload Handler
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

      // Add the new doc to state immediately
      const newDoc: Document = {
        id: response.data.id,
        title: response.data.filename,
        dateAdded: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        thumbnail: "#3b82f6",
        url: `http://127.0.0.1:8000/uploads/${response.data.filename}` // Construct local URL
      };
      
      setDocuments((prev) => [newDoc, ...prev]);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
    }
  };

  const handlePresent = (docId: string) => {
    navigate(`/presentation/${docId}`);
  };

  if (isLoading || !storedUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Orato</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm hidden sm:inline">{storedUser.full_name}</span>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              {storedUser.email[0].toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition-colors p-2"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Your Presentations</h2>
            <p className="text-slate-400">Upload and manage your PDF presentations</p>
          </div>
        </div>

        {/* Document Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Upload Card */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleUploadClick}
            className="aspect-[3/4] rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 hover:border-blue-600/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group"
          >
            <div className="w-16 h-16 rounded-full bg-blue-600/10 group-hover:bg-blue-600/20 flex items-center justify-center transition-colors">
              {isUploading ? <Loader2 className="w-8 h-8 text-blue-500 animate-spin" /> : <Plus className="w-8 h-8 text-blue-500" />}
            </div>
            <div className="text-center">
              <p className="text-white font-semibold mb-1">
                {isUploading ? "Uploading..." : "Upload New Presentation"}
              </p>
              <p className="text-slate-500 text-sm">Select a PDF file</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </motion.div>

          {/* Document Cards */}
          {documents.map((doc, index) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredDoc(doc.id)}
              onMouseLeave={() => setHoveredDoc(null)}
              className="aspect-[3/4] rounded-xl bg-slate-900 border border-slate-800 overflow-hidden cursor-pointer group relative"
            >
              {/* Thumbnail Area */}
              <div 
                className="h-3/4 flex items-center justify-center relative bg-slate-800"
                style={{ background: `linear-gradient(135deg, ${doc.thumbnail}, ${doc.thumbnail}dd)` }}
              >
                <FileText className="w-20 h-20 text-white/30" />
                
                {/* Overlay UI */}
                {hoveredDoc === doc.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center gap-4"
                  >
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      onClick={() => handlePresent(doc.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-2xl transition-colors"
                    >
                      <Play className="w-8 h-8 fill-white" />
                    </motion.button>
                  </motion.div>
                )}
              </div>

              {/* Info Section */}
              <div className="h-1/4 p-4 bg-slate-900 border-t border-slate-800 flex flex-col justify-center">
                <h3 className="text-white font-semibold truncate mb-1">{doc.title}</h3>
                <p className="text-slate-500 text-sm">{doc.dateAdded}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {documents.length === 0 && !isUploading && (
          <div className="mt-24 text-center">
            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800">
              <Upload className="w-10 h-10 text-slate-700" />
            </div>
            <h3 className="text-white text-xl font-semibold mb-2">No presentations yet</h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              Upload your first PDF presentation to start using Orato's AI features.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}