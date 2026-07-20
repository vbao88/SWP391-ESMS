import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useGuestCartStore = create(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clearCart: () => set({ items: [] }),
    }),
    { name: "esms-guest-cart" },
  ),
);
