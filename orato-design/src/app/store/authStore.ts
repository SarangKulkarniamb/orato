import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  full_name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  setUser: (userData: User) => void;
}

const useAuthStore = create<AuthState>((set) => ({
  // read from localStorage to support page refreshes
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('orato_user') || 'null'),

  login: (token: string) => {
    localStorage.setItem('token', token);
    set({ token });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('orato_user');
    set({ token: null, user: null });
  },

  setUser: (userData: User) => {
    localStorage.setItem('orato_user', JSON.stringify(userData));
    set({ user: userData });
  },
}));

export default useAuthStore;