import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/components/auth";
import { useAuth, useAuthActions } from "@/components/auth/AuthContext";
import { useConversationList } from "@/data-provider/Conversations";
import { useSessionTransition } from "@/hooks/session";
import { useSessionLifecycleStore } from "@/store/session";
import { ApiError } from "@/shared/api/client";

const {
  getConversationListMock,
  getCurrentUserMock,
  loginUserMock,
  logoutUserMock,
} = vi.hoisted(() => ({
  getConversationListMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loginUserMock: vi.fn(),
  logoutUserMock: vi.fn(),
}));

vi.mock("@/data-provider/Auth/requests", () => ({
  getCurrentUser: getCurrentUserMock,
  loginUser: loginUserMock,
  logoutUser: logoutUserMock,
  registerUser: vi.fn(),
}));

vi.mock("@/data-provider/Conversations/requests", () => ({
  getConversationList: getConversationListMock,
  getConversationMessageList: vi.fn(),
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
}));

const user = {
  id: "user-a",
  displayName: "User A",
  email: "a@example.com",
  createdAt: "2026-11-09T00:00:00Z",
};

const conversation = {
  id: "2f361104-0066-4f0b-a758-cc00a5ebe4de",
  title: "cookie",
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
};

const userB = {
  id: "user-b",
  displayName: "User B",
  email: "b@example.com",
  createdAt: "2026-11-09T00:00:00Z",
};

const conversationB = {
  ...conversation,
  id: "445c87a-9eaa-4b36-a32c-3636c8c10364",
  title: "hello",
};

describe("auth session integration", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    loginUserMock.mockReset();
    logoutUserMock.mockReset();
    getConversationListMock.mockReset();
    getCurrentUserMock.mockRejectedValue(
      new ApiError(401, "Unauthorized"),
    );
    loginUserMock.mockImplementation(async () => {
      getCurrentUserMock.mockResolvedValue(user);
      return user;
    });
    getConversationListMock.mockResolvedValue([conversation]);
    logoutUserMock.mockResolvedValue(undefined);
    useSessionLifecycleStore.getState().enableQueries();
  });

  it("loads the conversation list after login commits the new user", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const SessionProvider = ({
      children,
    }: {
      children: ReactNode;
    }) => {
      const sessionTransition = useSessionTransition();

      return (
        <AuthProvider sessionTransition={sessionTransition}>
          {children}
        </AuthProvider>
      );
    };

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SessionProvider>{children}</SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const actions = useAuthActions();
        const conversationList = useConversationList(
          auth.status === "authenticated"
            ? auth.user.id
            : null,
        );

        return { actions, auth, conversationList };
      },
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.auth.status).toBe("anonymous");
    });

    await act(async () => {
      await result.current.actions.login({
        email: "a@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(result.current.auth.status).toBe("authenticated");
      expect(result.current.conversationList.data).toEqual([
        conversation,
      ]);
    });
  });

  it("reloads conversations when replacing user A with user B", async () => {
    let activeUser = user;
    getCurrentUserMock.mockImplementation(async () => activeUser);
    getConversationListMock.mockImplementation(async () => [
      activeUser.id === userB.id ? conversationB : conversation,
    ]);
    loginUserMock.mockImplementation(async () => {
      activeUser = userB;
      return userB;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const SessionProvider = ({
      children,
    }: {
      children: ReactNode;
    }) => {
      const sessionTransition = useSessionTransition();

      return (
        <AuthProvider sessionTransition={sessionTransition}>
          {children}
        </AuthProvider>
      );
    };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SessionProvider>{children}</SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const actions = useAuthActions();
        const conversationList = useConversationList(
          auth.status === "authenticated"
            ? auth.user.id
            : null,
        );

        return { actions, auth, conversationList };
      },
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user,
      });
      expect(result.current.conversationList.data).toEqual([
        conversation,
      ]);
    });

    await act(async () => {
      await result.current.actions.login({
        email: "b@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user: userB,
      });
      expect(result.current.conversationList.data).toEqual([
        conversationB,
      ]);
    });
  });

  it("reloads conversations after logout and a later sign in", async () => {
    let activeUser: typeof user | null = user;
    getCurrentUserMock.mockImplementation(async () => activeUser);
    getConversationListMock.mockImplementation(async () => [
      activeUser?.id === userB.id ? conversationB : conversation,
    ]);
    logoutUserMock.mockImplementation(async () => {
      activeUser = null;
    });
    loginUserMock.mockImplementation(async () => {
      activeUser = userB;
      return userB;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const SessionProvider = ({
      children,
    }: {
      children: ReactNode;
    }) => {
      const sessionTransition = useSessionTransition();

      return (
        <AuthProvider sessionTransition={sessionTransition}>
          {children}
        </AuthProvider>
      );
    };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SessionProvider>{children}</SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const actions = useAuthActions();
        const conversationList = useConversationList(
          auth.status === "authenticated"
            ? auth.user.id
            : null,
        );

        return { actions, auth, conversationList };
      },
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user,
      });
      expect(result.current.conversationList.data).toEqual([
        conversation,
      ]);
    });

    await act(async () => {
      await result.current.actions.logout();
    });

    await waitFor(() => {
      expect(result.current.auth).toEqual({ status: "anonymous" });
    });

    await act(async () => {
      await result.current.actions.login({
        email: "b@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user: userB,
      });
      expect(result.current.conversationList.data).toEqual([
        conversationB,
      ]);
    });
  });

  it("reloads conversations when the same user signs in again", async () => {
    let activeUser: typeof user | null = user;
    getCurrentUserMock.mockImplementation(async () => activeUser);
    getConversationListMock.mockImplementation(async () => [
      conversation,
    ]);
    logoutUserMock.mockImplementation(async () => {
      activeUser = null;
    });
    loginUserMock.mockImplementation(async () => {
      activeUser = user;
      return user;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const SessionProvider = ({
      children,
    }: {
      children: ReactNode;
    }) => {
      const sessionTransition = useSessionTransition();

      return (
        <AuthProvider sessionTransition={sessionTransition}>
          {children}
        </AuthProvider>
      );
    };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SessionProvider>{children}</SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    const { result } = renderHook(
      () => {
        const auth = useAuth();
        const actions = useAuthActions();
        const conversationList = useConversationList(
          auth.status === "authenticated"
            ? auth.user.id
            : null,
        );

        return { actions, auth, conversationList };
      },
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user,
      });
      expect(result.current.conversationList.data).toEqual([
        conversation,
      ]);
    });

    const callsBeforeLogout =
      getConversationListMock.mock.calls.length;

    await act(async () => {
      await result.current.actions.logout();
    });

    await waitFor(() => {
      expect(result.current.auth).toEqual({ status: "anonymous" });
    });

    await act(async () => {
      await result.current.actions.login({
        email: "a@example.com",
        password: "password123",
      });
    });

    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user,
      });
      expect(
        getConversationListMock.mock.calls.length,
      ).toBeGreaterThan(callsBeforeLogout);
      expect(result.current.conversationList.data).toEqual([
        conversation,
      ]);
    });
  });
});
