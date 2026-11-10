import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRoute } from "./ChatRoute";

vi.mock("@/components/auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "user-1",
      displayName: "gaga",
      email: "gaga@example.com",
      createdAt: "2026-11-09T00:00:00Z",
    },
  }),
  useAuthActions: () => ({
    expireSession: vi.fn(),
  }),
}));

vi.mock("@/components/common/Modal", () => ({
  useModal: () => ({ actions: { open: vi.fn() } }),
}));

vi.mock("@/components/chat", () => ({
  ChatSession: ({
    conversationId,
  }: {
    conversationId: string | null;
  }) => (
    <p data-testid="conversation-id">
      {conversationId ?? "new-chat"}
    </p>
  ),
}));

const LocationProbe = () => {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
    </p>
  );
};

const renderPage = (entry: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/chat"
            element={
              <>
                <ChatRoute />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/chat/:conversationId"
            element={
              <>
                <ChatRoute />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("ChatRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a valid conversation UUID to ChatSession", () => {
    const conversationId =
      "19b20fdc-511c-4f9c-8d7e-3b8d7d85f8c0";

    renderPage(`/chat/${conversationId}`);

    expect(screen.getByTestId("conversation-id")).toHaveTextContent(
      conversationId,
    );
  });

  it("redirects an invalid chat value to the new chat page", async () => {
    renderPage("/chat/invalid");

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/chat",
      );
      expect(screen.getByTestId("conversation-id")).toHaveTextContent(
        "new-chat",
      );
    });
  });
});
