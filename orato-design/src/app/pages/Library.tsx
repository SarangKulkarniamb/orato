import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Plus, FileText, Play, LogOut, Upload } from "lucide-react";
import { motion } from "motion/react";

interface Document {
  id: string;
  title: string;
  dateAdded: string;
  thumbnail: string;
}

export function Library() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [hoveredDoc, setHoveredDoc] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is logged in
    const userStr = localStorage.getItem("orato_user");
    if (!userStr) {
      navigate("/auth");
      return;
    }
    setUser(JSON.parse(userStr));

    // Load mock documents
    const mockDocs: Document[] = [
      {
        id: "doc_1",
        title: "Q4 Sales Presentation",
        dateAdded: "Feb 14, 2026",
        thumbnail: "#4F46E5",
      },
      {
        id: "doc_2",
        title: "Product Roadmap 2026",
        dateAdded: "Feb 12, 2026",
        thumbnail: "#06B6D4",
      },
      {
        id: "doc_3",
        title: "Team Meeting Notes",
        dateAdded: "Feb 10, 2026",
        thumbnail: "#8B5CF6",
      },
      {
        id: "doc_4",
        title: "Marketing Strategy",
        dateAdded: "Feb 8, 2026",
        thumbnail: "#EC4899",
      },
    ];
    setDocuments(mockDocs);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("orato_user");
    navigate("/");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      const newDoc: Document = {
        id: `doc_${Date.now()}`,
        title: file.name.replace(".pdf", ""),
        dateAdded: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        thumbnail: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      };
      setDocuments([newDoc, ...documents]);
    }
  };

  const handlePresent = (docId: string) => {
    navigate(`/presentation/${docId}`);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Orato</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm hidden sm:inline">{user.email}</span>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              {user.email[0].toUpperCase()}
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
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Your Presentations</h2>
          <p className="text-slate-400">Upload and manage your PDF presentations</p>
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
              <Plus className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold mb-1">Upload New Presentation</p>
              <p className="text-slate-500 text-sm">Click to select PDF</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              className="hidden"
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
              {/* Thumbnail */}
              <div 
                className="h-3/4 flex items-center justify-center relative"
                style={{ background: `linear-gradient(135deg, ${doc.thumbnail}, ${doc.thumbnail}dd)` }}
              >
                <FileText className="w-20 h-20 text-white/30" />
                
                {/* Play Button Overlay */}
                {hoveredDoc === doc.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center"
                  >
                    <motion.button
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
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
        {documents.length === 0 && (
          <div className="mt-12 text-center">
            <Upload className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No presentations yet. Upload your first PDF to get started!</p>
          </div>
        )}
      </main>
    </div>
  );
}
