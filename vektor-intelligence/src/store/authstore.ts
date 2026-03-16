import { create } from "zustand";
import { VektorUser } from "@/types/user";

interface AuthState {
  user: VektorUser | null;
  loading: boolean;
  setUser: (user: VektorUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));