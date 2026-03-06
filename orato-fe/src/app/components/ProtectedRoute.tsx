import { Navigate, Outlet } from "react-router-dom";
import useAuthStore from "../store/authStore";

export function ProtectedRoute() {
  const storeToken = useAuthStore((state) => state.token);
  const token = storeToken || localStorage.getItem("token");

  console.log(
    "[ProtectedRoute DEBUG] token ->",
    storeToken
      ? "✅ from store"
      : token
      ? "⚠️ from localStorage":
    token ? `(${token.slice(0, 5)}...)` : "(none)"
  );
  if (token === null || token === undefined) {
    return null;
  }

  return token ? <Outlet /> : <Navigate to="/auth" replace />;
}