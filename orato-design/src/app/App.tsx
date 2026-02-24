import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";
import { Library } from "./pages/Library";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RedirectToDashboard } from "./components/RedirectToDashboardRouter.tsx";
import { Presentation } from "./pages/Presentation";
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />

        <Route element={<RedirectToDashboard />}>
            <Route path="/auth" element={<Auth />} />
        </Route>
        

        {/* Protected Routes Group */}
        <Route element={<ProtectedRoute />}>
          <Route path="/library" element={<Library />} />
          <Route path="presentation/:id" element = {<Presentation/>} />
          {/* Add more protected routes here */}
        </Route>



        {/* Catch-all: Redirect unknown paths to Home or Auth */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}