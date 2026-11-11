import { create } from "zustand";

export type ChatRunPhase =
  | "creating-conversation" // Conversation 创建请求进行中，客户端还没有 conversationId。
  | "awaiting-send" // Conversation 已创建并绑定 ID，等待页面认领并发送首条 Message。
  | "sending" // Message 发送请求进行中。
  | "syncing-history" // Message 已发送成功，正在重新拉取服务端历史。
  | "sync-failed" // Message 已发送成功，但历史刷新失败；保留 run，只允许重试同步。
  | "failed"; // Conversation 创建或 Message 发送失败；保留消息内容供用户重试。

export interface ChatRun {
  id: string;
  conversationId: string | null;
  content: string;
  phase: ChatRunPhase;
  error: string | null;
}

export interface ChatRuntimeState {
  runsById: Record<string, ChatRun>;

  /**
   * 在 New Chat 页面提交消息时创建 run。
   * 初始阶段为 creating-conversation，conversationId 为空；返回新 run 的 id。
   */
  enqueueNewChat(content: string): string;

  /**
   * 在已有 Conversation 中提交消息时创建 run。
   * 初始阶段为 awaiting-send，等待页面 effect 认领发送；返回新 run 的 id。
   */
  enqueueConversationMessage(conversationId: string, content: string): string;

  /**
   * Conversation 创建成功后绑定服务端 ID。
   * 仅当 run 仍存在且处于 creating-conversation 时，将阶段推进到 awaiting-send。
   * 返回是否绑定成功，用于忽略 session reset 后迟到的创建响应。
   */
  bindConversation(runId: string, conversationId: string): boolean;

  /**
   * 原子认领待发送的 run：awaiting-send -> sending。
   * 页面 effect 和后台补发都可能调用；只有第一个调用成功，防止同一消息重复发送。
   */
  claimForSending(runId: string): boolean;

  /**
   * Message 发送成功、开始刷新服务端历史时调用：sending -> syncing-history。
   */
  markSyncing(runId: string): void;

  /**
   * Message 已发送但历史刷新失败时调用：syncing-history -> sync-failed。
   * 保留 run 和原消息，避免误重发；之后只能重试历史同步。
   */
  markSyncFailed(runId: string, error: string): void;

  /**
   * 用户点击历史刷新时调用：sync-failed -> syncing-history，并清除错误。
   * 返回是否成功进入重试；不会重新发送 Message。
   */
  beginSyncRetry(runId: string): boolean;

  /**
   * Conversation 创建或 Message 发送失败时调用：任意现存 run -> failed。
   * 保留 content 和 error，供 UI 展示错误并恢复草稿。
   */
  markFailed(runId: string, error: string): void;

  /**
   * 用户以相同内容重试 failed run：
   * New Chat 回到 creating-conversation，已有 Conversation 回到 awaiting-send。
   */
  retryFailed(runId: string): void;

  /**
   * 删除一个已完成的 run。
   * 通常在历史同步成功，或确认该 run 已属于失效 session 后调用。
   */
  removeRun(runId: string): void;

  /**
   * 删除某个 Conversation 的全部 run；传 null 时清理 New Chat run。
   * 用于 Conversation 返回 404，或业务确认当前会话全部状态需要重置时。
   */
  clearConversation(conversationId: string | null): void;

  /**
   * 删除所有 run。
   * 用于退出登录、切换账号或其他 session reset，防止旧请求状态泄漏到新身份。
   */
  clearAll(): void;
}

export const useChatRuntimeStore = create<ChatRuntimeState>((set) => ({
  runsById: {},

  enqueueNewChat: (content: string) => {
    const id = crypto.randomUUID();

    set((state) => {
      //清理旧的失败的new conversation
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
