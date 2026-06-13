import { create } from "zustand";

type WelcomeState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useWelcome = create<WelcomeState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
