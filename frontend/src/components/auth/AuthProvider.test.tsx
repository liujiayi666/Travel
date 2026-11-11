import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IUseSessionTransition } from "@/hooks/session/useSessionTransition";
import { useSessionLifecycleStore } from "@/store/session";
import { ApiError } from "@/shared/api/client";
import { authKeys } from "@/data-provider/Auth";
import { useAuth, useAuthActions } from "./AuthContext";
import { AuthProvider } from "./AuthProvider";

const {
  getCurrentUserMock,
  loginUserMock,
  logoutUserMock,
  registerUserMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  loginUserMock: vi.fn(),
  logoutUserMock: vi.fn(),
  registerUserMock: vi.fn(),
}));

vi.mock("@/data-provider/Auth/requests", () => ({
  getCurrentUser: getCurrentUserMock,
  loginUser: loginUserMock,
  logoutUser: logoutUserMock,
  registerUser: registerUserMock,
}));

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

const renderAuth = (
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) => {
  const sessionTransition: IUseSessionTransition = {
    begin: vi.fn(() => {
      useSessionLifecycleStore.getState().disableQueries();
    }),
    commit: vi.fn((user) => {
      queryClient.setQueryData(authKeys.currentUser(), user);
    }),
    abort: vi.fn(() => {
      useSessionLifecycleStore.getState().enableQueries();
    }),
  };
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider sessionTransition={sessionTransition}>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );

  return {
    queryClient,
    sessionTransition,
    ...renderHook(
      () => ({
        auth: useAuth(),
        actions: useAuthActions(),
      }),
      { wrapper: Wrapper },
    ),
  };
};

describe("AuthProvider session lifecycle", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    loginUserMock.mockReset();
    logoutUserMock.mockReset();
    registerUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue(userA);
    logoutUserMock.mockResolvedValue(undefined);
    useSessionLifecycleStore.getState().enableQueries();
  });

  it("begins transition before logout and commits anonymous user", async () => {
    const { result, sessionTransition } = renderAuth();

    await waitFor(() => {
      expect(result.current.auth.status).toBe("authenticated");
    });

    await act(async () => {
      await result.current.actions.logout();
    });

    expect(sessionTransition.begin).toHaveBeenCalledOnce();
    expect(sessionTransition.commit).toHaveBeenCalledWith(null);
    await waitFor(() => {
      expect(result.current.auth).toEqual({ status: "anonymous" });
    });
  });

  it("begins transition before replacing user A with user B", async () => {
    loginUserMock.mockResolvedValue(userB);
    const { result, sessionTransition } = renderAuth();

    await waitFor(() => {
      expect(result.current.auth.status).toBe("authenticated");
    });

    await act(async () => {
      await result.current.actions.login({
        email: "b@example.com",
        password: "password123",
      });
    });

    expect(sessionTransition.begin).toHaveBeenCalledOnce();
    expect(sessionTransition.commit).toHaveBeenCalledWith(userB);
    await waitFor(() => {
      expect(result.current.auth).toEqual({
        status: "authenticated",
        user: userB,
      });
    });
  });

  it("aborts transition and preserves user A when login fails", async () => {
    loginUserMock.mockRejectedValue(new ApiError(401, "Bad credentials"));
    const { result, sessionTransition } = renderAuth();

    await waitFor(() => {
      expect(result.current.auth.status).toBe("authenticated");
    });

    await act(async () => {
      await expect(
        result.current.actions.login({
          email: "b@example.com",
          password: "wrong-password",
        }),
      ).rejects.toThrow("Bad credentials");
    });

    expect(sessionTransition.begin).toHaveBeenCalledOnce();
    expect(sessionTransition.commit).not.toHaveBeenCalled();
    expect(sessionTransition.abort).toHaveBeenCalledOnce();
    expect(result.current.auth).toEqual({
      status: "authenticated",
      user: userA,
    });
  });

  it("expires a rejected session without calling logout again", async () => {
    const { result, sessionTransition } = renderAuth();

    await waitFor(() => {
      expect(result.current.auth.status).toBe("authenticated");
    });

    await act(async () => {
      await result.current.actions.expireSession();
    });

    expect(sessionTransition.begin).toHaveBeenCalledOnce();
    expect(sessionTransition.commit).toHaveBeenCalledWith(null);
    expect(logoutUserMock).not.toHaveBeenCalled();
    expect(result.current.auth).toEqual({ status: "anonymous" });
  });
});
