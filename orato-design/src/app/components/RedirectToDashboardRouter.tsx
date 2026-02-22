import { Navigate, Outlet } from "react-router-dom";
import useAuthStore from "../store/authStore";

export function RedirectToDashboard() {
  const storeToken = useAuthStore((state) => state.token);
  const token = storeToken || localStorage.getItem("token");


  return !token ? <Outlet /> : <Navigate to="/library" replace />;
}