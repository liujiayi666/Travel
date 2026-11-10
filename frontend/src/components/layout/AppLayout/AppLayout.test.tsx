import type { AuthState } from "@/components/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/client";
import { AppLayout } from "./AppLayout";

const {
  authMock,
  conversationListErrorMock,
  expireSessionMock,
  logoutMock,
  openModalMock,
} = vi.hoisted(() => ({
  authMock: {
    state: {
      status: "authenticated",
      user: {
        id: "user-1",
        displayName: "gaga",
        email: "gaga@example.com",
        createdAt: "2026-11-09T00:00:00Z",
      },
    } as AuthState,
  },
  conversationListErrorMock: { current: null as unknown },
  expireSessionMock: vi.fn(),
  logoutMock: vi.fn(),
  openModalMock: vi.fn(),
}));

vi.mock("@/components/auth", () => ({
  useAuth: () => authMock.state,
  useAuthActions: () => ({
    expireSession: expireSessionMock,
    logout: logoutMock,
  }),
}));

vi.mock("@/data-provider/Conversations", () => ({
  useConversationList: () => ({
    data: [],
    error: conversationListErrorMock.current,
  }),
}));

vi.mock("@/components/common/Modal", () => ({
  useModal: () => ({ actions: { open: openModalMock } }),
}));

const conversationId = "19b20fdc-511c-4f9c-8d7e-3b8d7d85f8c0";

const LayoutRoutes = () => (
  <MemoryRouter initialEntries={[`/chat/${conversationId}`]}>
    <Routes>
      <Route path="/chat" element={<AppLayout />}>
        <Route
          path=":conversationId"
          element={<p>conversation content</p>}
        />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderLayout = () =>
  render(
    <LayoutRoutes />
  );

describe("AppLayout session URL", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    expireSessionMock.mockReset();
    expireSessionMock.mockResolvedValue(undefined);
    openModalMock.mockReset();
    conversationListErrorMock.current = null;
    authMock.state = {
      status: "authenticated",
      user: {
        id: "user-1",
        displayName: "gaga",
        email: "gaga@example.com",
        createdAt: "2026-11-09T00:00:00Z",
      },
    };
  });

  it("delegates sign out to the auth session lifecycle", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(
      screen.getByRole("button", { name: /account menu/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sign out" }),
    );

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledOnce();
    });
  });

  it("expires the session when the conversation list returns 401", async () => {
    conversationListErrorMock.current = new ApiError(
      401,
      "Unauthorized",
    );

    renderLayout();

    await waitFor(() => {
      expect(expireSessionMock).toHaveBeenCalledOnce();
      expect(openModalMock).toHaveBeenCalledWith({ type: "auth" });
    });
  });
});
