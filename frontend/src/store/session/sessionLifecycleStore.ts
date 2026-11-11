import { create } from "zustand";

interface SessionState {
  queriesEnabled: boolean;
  disableQueries: () => void;
  enableQueries: () => void;
}

export const useSessionLifecycleStore = create<SessionState>((set) => ({
  queriesEnabled: true,
  disableQueries: () => set({ queriesEnabled: false }),
  enableQueries: () => set({ queriesEnabled: true }),
}));
