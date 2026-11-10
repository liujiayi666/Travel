import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { authKeys } from "@/data-provider/Auth";
import { conversationKeys } from "@/data-provider/Conversations";
import { useChatRuntimeStore } from "@/store/chat";
import { useSessionLifecycleStore } from "@/store/session";
import { useSessionTransition } from "./useSessionTransition";

const userA = {
  id: "user-a",
  displayName: "User A",
  email: "a@example.com",
  createdAt: "2026-11-09T00:00:00Z",
};

const userB = {
  id: "user-b",
  displayName: "User B",
  email: "b@example.com",
  createdAt: "2026-11-09T00:00:00Z",
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/chat/private-conversation"]}>
        <LocationProbe />
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );

  return {
    queryClient,
    getPath: () => latestPath,
    Wrapper,
  };
};

describe("useSessionTransition", () => {
  beforeEach(() => {
    useChatRuntimeStore.getState().clearAll();
    useSessionLifecycleStore.getState().enableQueries();
  });

  it("pauses queries, commits the next user, then resumes immediately", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSessionTransition(), {
      wrapper: Wrapper,
    });

    queryClient.setQueryData(authKeys.currentUser(), userA);

    act(() => {
      result.current.begin();
    });

    expect(
      useSessionLifecycleStore.getState().queriesEnabled,
    ).toBe(false);

    act(() => {
      result.current.commit(userB);
    });

    expect(
      useSessionLifecycleStore.getState().queriesEnabled,
    ).toBe(true);
    expect(queryClient.getQueryData(authKeys.currentUser())).toEqual(
      userB,
    );
  });

  it("aborts a transition and restores queries", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSessionTransition(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.begin();
      result.current.abort();
    });

    expect(
      useSessionLifecycleStore.getState().queriesEnabled,
    ).toBe(true);
  });

  it("resets only conversation state for an unavailable conversation", async () => {
    const { getPath, queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData(authKeys.currentUser(), userA);
    queryClient.setQueryData(
      conversationKeys.messages("user-a", "conversation-a"),
      [],
    );
    useChatRuntimeStore
      .getState()
      .enqueueConversationMessage("conversation-a", "private message");

    const { result } = renderHook(() => useSessionTransition(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.resetConversationState("conversation-a");
    });

    expect(
      queryClient.getQueryData(authKeys.currentUser()),
    ).toEqual(userA);
    expect(
      queryClient.getQueryData(
        conversationKeys.messages("user-a", "conversation-a"),
      ),
    ).toBeUndefined();
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
    expect(getPath()).toBe("/chat");
  });
});
