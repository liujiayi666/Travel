import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  StrictMode,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";
import { useChatRuntimeStore } from "@/store/chat";
import { useChatRuntime } from "./useChatRuntime";

const {
  createConversationMock,
  getConversationMessageListMock,
  sendMessageMock,
} = vi.hoisted(() => ({
  createConversationMock: vi.fn(),
  getConversationMessageListMock: vi.fn(),
  sendMessageMock: vi.fn(),
}));

vi.mock("@/data-provider/Conversations/requests", () => ({
  createConversation: createConversationMock,
  getConversationList: vi.fn().mockResolvedValue([]),
  getConversationMessageList: getConversationMessageListMock,
  sendMessage: sendMessageMock,
}));

const conversationId = "19b20fdc-511c-4f9c-8d7e-3b8d7d85f8c0";
const createdConversation = {
  id: conversationId,
  title: "杭州玩两天",
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  let latestPath = "";

  const LocationProbe = () => {
    const location = useLocation();

    useLayoutEffect(() => {
      latestPath = location.pathname;
    }, [location.pathname]);

    return null;
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LocationProbe />
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );

  return {
    getPath: () => latestPath,
    queryClient,
    Wrapper,
  };
};

describe("useChatRuntime", () => {
  beforeEach(() => {
    useChatRuntimeStore.getState().clearAll();
    createConversationMock.mockReset();
    getConversationMessageListMock.mockReset();
    sendMessageMock.mockReset();
    getConversationMessageListMock.mockResolvedValue([]);
  });

  it("navigates after creating and sends once for the bound conversation", async () => {
    createConversationMock.mockResolvedValue(createdConversation);
    sendMessageMock.mockResolvedValue({
      message: { role: "assistant", content: "先去西湖。" },
    });

    const { getPath, Wrapper } = createWrapper();
    const onAuthRequired = vi.fn();
    const { result, rerender } = renderHook(
      ({ conversationId: currentConversationId }) =>
        useChatRuntime(
          "user-1",
          currentConversationId,
          onAuthRequired,
        ),
      {
        wrapper: Wrapper,
        initialProps: { conversationId: null as string | null },
      },
    );

    await act(async () => {
      await result.current.submitMessage("杭州玩两天");
    });

    expect(createConversationMock).toHaveBeenCalledWith({
      message: "杭州玩两天",
    });
    expect(getPath()).toBe(`/chat/${conversationId}`);
    expect(
      Object.values(useChatRuntimeStore.getState().runsById),
    ).toEqual([
      expect.objectContaining({
        conversationId,
        phase: "awaiting-send",
      }),
    ]);

    rerender({ conversationId });

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      expect(useChatRuntimeStore.getState().runsById).toEqual({});
    });
  });

  it("keeps the conversation and retries the same run after a send failure", async () => {
    createConversationMock.mockResolvedValue(createdConversation);
    sendMessageMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        message: { role: "assistant", content: "先去西湖。" },
      });

    const { Wrapper } = createWrapper();
    const onAuthRequired = vi.fn();
    const { result, rerender } = renderHook(
      ({ conversationId: currentConversationId }) =>
        useChatRuntime(
          "user-1",
          currentConversationId,
          onAuthRequired,
        ),
      {
        wrapper: Wrapper,
        initialProps: { conversationId: null as string | null },
      },
    );

    await act(async () => {
      await result.current.submitMessage("杭州玩两天");
    });

    rerender({ conversationId });

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      expect(
        Object.values(useChatRuntimeStore.getState().runsById)[0],
      ).toMatchObject({
        conversationId,
        phase: "failed",
        content: "杭州玩两天",
      });
    });

    await act(async () => {
      await result.current.submitMessage("杭州玩两天");
    });

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledTimes(2);
      expect(createConversationMock).toHaveBeenCalledTimes(1);
      expect(useChatRuntimeStore.getState().runsById).toEqual({});
    });
  });

  it("opens authentication when conversation creation returns 401", async () => {
    createConversationMock.mockRejectedValue(
      new ApiError(401, "Unauthorized"),
    );

    const { getPath, Wrapper } = createWrapper();
    const onAuthRequired = vi.fn();
    const { result } = renderHook(
      () =>
        useChatRuntime("user-1", null, onAuthRequired),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.submitMessage("杭州玩两天");
    });

    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(getPath()).toBe("/");
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(
      Object.values(useChatRuntimeStore.getState().runsById)[0],
    ).toMatchObject({
      phase: "failed",
      error: "Please sign in again.",
    });
  });

  it("finishes the initial send when the runtime unmounts during creation", async () => {
    let resolveCreate!: (conversation: typeof createdConversation) => void;
    createConversationMock.mockReturnValue(
      new Promise<typeof createdConversation>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    sendMessageMock.mockResolvedValue({
      message: { role: "assistant", content: "先去西湖。" },
    });

    const { getPath, Wrapper } = createWrapper();
    const { result, unmount } = renderHook(
      () => useChatRuntime("user-1", null, vi.fn()),
      { wrapper: Wrapper },
    );

    let submitPromise!: Promise<boolean>;
    act(() => {
      submitPromise = result.current.submitMessage("杭州玩两天");
    });

    unmount();
    resolveCreate(createdConversation);

    await act(async () => {
      await submitPromise;
    });

    expect(getPath()).toBe("/");
    expect(sendMessageMock).toHaveBeenCalledOnce();
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
  });

  it("ignores a creation error after the session reset", async () => {
    let rejectCreate!: (error: unknown) => void;
    createConversationMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectCreate = reject;
      }),
    );

    const { Wrapper } = createWrapper();
    const onAuthRequired = vi.fn();
    const { result, unmount } = renderHook(
      () => useChatRuntime("user-1", null, onAuthRequired),
      { wrapper: Wrapper },
    );

    let submitPromise!: Promise<boolean>;
    act(() => {
      submitPromise = result.current.submitMessage("杭州玩两天");
    });

    useChatRuntimeStore.getState().clearAll();
    unmount();
    rejectCreate(new ApiError(401, "Unauthorized"));

    await act(async () => {
      await submitPromise;
    });

    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
  });

  it("retries history synchronization without resending the message", async () => {
    sendMessageMock.mockResolvedValue({
      message: { role: "assistant", content: "先去西湖。" },
    });
    const runId = useChatRuntimeStore
      .getState()
      .enqueueConversationMessage(conversationId, "杭州玩两天");
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValue();

    const { result } = renderHook(
      () =>
        useChatRuntime("user-1", conversationId, vi.fn()),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(useChatRuntimeStore.getState().runsById[runId]).toMatchObject({
        phase: "sync-failed",
        error: "history unavailable",
      });
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retrySync();
    });

    await waitFor(() => {
      expect(useChatRuntimeStore.getState().runsById).toEqual({});
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("ignores an in-flight send that returns after session reset", async () => {
    let resolveSend!: (response: {
      message: { role: "assistant"; content: string };
    }) => void;
    sendMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    useChatRuntimeStore
      .getState()
      .enqueueConversationMessage(conversationId, "杭州玩两天");
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(
      queryClient,
      "invalidateQueries",
    );
    const onAuthRequired = vi.fn();

    const { unmount } = renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          onAuthRequired,
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledOnce();
    });

    useChatRuntimeStore.getState().clearAll();
    queryClient.clear();
    unmount();
    resolveSend({
      message: { role: "assistant", content: "先去西湖。" },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
  });

  it("ignores an in-flight send rejection after session reset", async () => {
    let rejectSend!: (error: unknown) => void;
    sendMessageMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectSend = reject;
      }),
    );
    useChatRuntimeStore
      .getState()
      .enqueueConversationMessage(conversationId, "杭州玩两天");
    const onAuthRequired = vi.fn();
    const { Wrapper } = createWrapper();
    const { unmount } = renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          onAuthRequired,
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledOnce();
    });

    useChatRuntimeStore.getState().clearAll();
    unmount();
    rejectSend(new ApiError(401, "Unauthorized"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
  });

  it("marks the run failed when sending returns 404", async () => {
    sendMessageMock.mockRejectedValue(
      new ApiError(404, "Conversation not found"),
    );
    useChatRuntimeStore
      .getState()
      .enqueueConversationMessage(conversationId, "杭州玩两天");
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          vi.fn(),
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(
        Object.values(useChatRuntimeStore.getState().runsById)[0],
      ).toMatchObject({
        phase: "failed",
        content: "杭州玩两天",
        error: "This conversation is no longer available.",
      });
    });
    expect(result.current.historyState.status).not.toBe("idle");
  });

  it("loads older history pages in chronological order", async () => {
    const newestPage = Array.from({ length: 20 }, (_, index) => ({
      id: `new-${index}`,
      conversationId,
      role: "user" as const,
      content: `Message ${index + 1}`,
      createdAt: "2026-11-09T00:00:00Z",
    }));
    const olderPage = [
      {
        id: "old-1",
        conversationId,
        role: "user" as const,
        content: "Oldest",
        createdAt: "2026-11-08T00:00:00Z",
      },
      {
        id: "old-2",
        conversationId,
        role: "assistant" as const,
        content: "Older reply",
        createdAt: "2026-11-08T00:01:00Z",
      },
    ];
    getConversationMessageListMock.mockImplementation(
      async (_id: string, { offset = 0 }: { offset?: number }) =>
        offset === 0 ? newestPage : olderPage,
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          vi.fn(),
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(20);
      expect(result.current.hasOlderMessages).toBe(true);
    });

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(22);
    });
    expect(
      result.current.messages.slice(0, 2).map((message) => message.content),
    ).toEqual(["Oldest", "Older reply"]);
    expect(getConversationMessageListMock).toHaveBeenLastCalledWith(
      conversationId,
      { limit: 20, offset: 20 },
    );
  });

  it("expires authentication when history returns 401", async () => {
    getConversationMessageListMock.mockRejectedValue(
      new ApiError(401, "Unauthorized"),
    );
    const onAuthRequired = vi.fn();
    const { Wrapper } = createWrapper();

    renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          onAuthRequired,
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(onAuthRequired).toHaveBeenCalledOnce();
    });
  });

  it("exposes history errors without navigating away", async () => {
    getConversationMessageListMock.mockRejectedValue(
      new ApiError(404, "Conversation not found"),
    );
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useChatRuntime(
          "user-1",
          conversationId,
          vi.fn(),
        ),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.historyState).toMatchObject({
        status: "error",
        error: expect.any(ApiError),
      });
    });
  });
});
