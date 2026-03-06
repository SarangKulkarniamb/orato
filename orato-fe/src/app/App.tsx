import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing.tsx";
import { Auth } from "./pages/Auth.tsx";
import { Library } from "./pages/Library.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { RedirectToDashboard } from "./components/RedirectToDashboardRouter.tsx";
import { Presentation } from "./pages/Presentation.tsx";
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