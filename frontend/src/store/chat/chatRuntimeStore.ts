import { create } from "zustand";

export type ChatRunPhase =
  | "creating-conversation"
  | "awaiting-send"
  | "sending"
  | "syncing-history"
  | "sync-failed"
  | "failed";

export interface ChatRun {
  id: string;
  conversationId: string | null;
  content: string;
  phase: ChatRunPhase;
  error: string | null;
}

export interface ChatRuntimeState {
  runsById: Record<string, ChatRun>;

  enqueueNewChat(content: string): string;
  enqueueConversationMessage(conversationId: string, content: string): string;
  bindConversation(runId: string, conversationId: string): boolean;
  claimForSending(runId: string): boolean;
  markSyncing(runId: string): void;
  markSyncFailed(runId: string, error: string): void;
  beginSyncRetry(runId: string): boolean;
  markFailed(runId: string, error: string): void;
  retryFailed(runId: string): void;
  removeRun(runId: string): void;
  clearConversation(conversationId: string | null): void;
  clearAll(): void;
}

export const useChatRuntimeStore = create<ChatRuntimeState>((set) => ({
  runsById: {},

  enqueueNewChat: (content: string) => {
    const id = crypto.randomUUID();

    set((state) => {
      const runsById = Object.fromEntries(
        Object.entries(state.runsById).filter(
          ([, run]) =>
            !(
              run.conversationId === null &&
              run.phase === "failed"
            ),
        ),
      );

      return {
        runsById: {
          ...runsById,
          [id]: {
            id,
            conversationId: null,
            content,
            phase: "creating-conversation",
            error: null,
          },
        },
      };
    });

    return id;
  },

  enqueueConversationMessage: (conversationId: string, content: string) => {
    const id = crypto.randomUUID();

    set((state) => {
      const runsById = Object.fromEntries(
        Object.entries(state.runsById).filter(
          ([, run]) =>
            !(
              run.conversationId === conversationId &&
              run.phase === "failed"
            ),
        ),
      );

      return {
        runsById: {
          ...runsById,
          [id]: {
            id,
            conversationId,
            content,
            phase: "awaiting-send",
            error: null,
          },
        },
      };
    });

    return id;
  },

  bindConversation: (runId: string, conversationId: string) => {
    let bound = false;

    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "creating-conversation") {
        return state;
      }

      bound = true;
      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            conversationId,
            phase: "awaiting-send",
          },
        },
      };
    });

    return bound;
  },

  claimForSending: (runId: string) => {
    let claimed = false;
    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "awaiting-send") {
        return state;
      }

      claimed = true;
      return {
        runsById: {
          ...state.runsById,
          [runId]: { ...run, phase: "sending", error: null },
        },
      };
    });
    return claimed;
  },

  markSyncing: (runId: string) => {
    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "sending") return state;

      return {
        runsById: {
          ...state.runsById,
          [runId]: { ...run, phase: "syncing-history" },
        },
      };
    });
  },

  markSyncFailed: (runId: string, error: string) => {
    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "syncing-history") return state;

      return {
        runsById: {
          ...state.runsById,
          [runId]: { ...run, phase: "sync-failed", error },
        },
      };
    });
  },

  beginSyncRetry: (runId: string) => {
    let started = false;

    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "sync-failed") return state;

      started = true;
      return {
        runsById: {
          ...state.runsById,
          [runId]: { ...run, phase: "syncing-history", error: null },
        },
      };
    });

    return started;
  },

  markFailed: (runId: string, error: string) => {
    set((state) => {
      const run = state.runsById[runId];
      if (!run) return state;

      return {
        runsById: {
          ...state.runsById,
          [runId]: { ...run, phase: "failed", error },
        },
      };
    });
  },

  retryFailed: (runId: string) => {
    set((state) => {
      const run = state.runsById[runId];
      if (!run || run.phase !== "failed") return state;

      return {
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            phase: run.conversationId ? "awaiting-send" : "creating-conversation",
            error: null,
          },
        },
      };
    });
  },

  removeRun: (runId: string) => {
    set((state) => {
      const { [runId]: _removed, ...runsById } = state.runsById;
      return { runsById };
    });
  },

  clearConversation: (conversationId: string | null) => {
    set((state) => ({
      runsById: Object.fromEntries(
        Object.entries(state.runsById).filter(
          ([, run]) => run.conversationId !== conversationId,
        ),
      ),
    }));
  },

  clearAll: () => set({ runsById: {} }),
}));
