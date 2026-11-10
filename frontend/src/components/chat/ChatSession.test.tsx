import type { AuthState } from "@/components/auth";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatDraftProvider } from "./draft/ChatDraftProvider";
import { ChatSession } from "./ChatSession";

const { runtimeMock } = vi.hoisted(() => ({
  runtimeMock: vi.fn(),
}));

vi.mock("@/hooks/chat", () => ({
  useChatRuntime: runtimeMock,
}));

const authenticatedState: AuthState = {
  status: "authenticated",
  user: {
    id: "user-1",
    displayName: "gaga",
    email: "gaga@example.com",
    createdAt: "2026-11-03T00:00:00Z",
  },
};

const makeRuntime = (overrides: Record<string, unknown> = {}) => ({
  run: null,
  messages: [],
  historyPending: false,
  historyError: null,
  isBusy: false,
  isSending: false,
  syncFailed: false,
  error: null,
  submitMessage: vi.fn().mockResolvedValue(true),
  retrySync: vi.fn(),
  ...overrides,
});

const renderChatSession = (
  auth: AuthState = authenticatedState,
  conversationId: string | null = "conversation-1",
) => {
  const onAuthRequired = vi.fn();

  render(
    <ChatDraftProvider currentUserId="user-1">
      <ChatSession
        conversationId={conversationId}
        auth={auth}
        onAuthRequired={onAuthRequired}
        onConversationUnavailable={vi.fn()}
      />
    </ChatDraftProvider>,
  );

  return {
    onAuthRequired,
    input: screen.getByLabelText("Describe your trip"),
    submit: screen.getByRole("button", {
      name: /Start planning|Sending message/,
    }),
  };
};

describe("ChatSession", () => {
  beforeEach(() => {
    runtimeMock.mockReset();
    runtimeMock.mockReturnValue(makeRuntime());
  });

  it("submits through the runtime and clears the draft", async () => {
    const user = userEvent.setup();
    const runtime = makeRuntime();
    runtimeMock.mockReturnValue(runtime);
    const view = renderChatSession();

    await user.type(view.input, "杭州周末去哪玩？");
    await user.click(view.submit);

    expect(runtime.submitMessage).toHaveBeenCalledWith(
      "杭州周末去哪玩？",
    );
    expect(view.input).toHaveValue("");
  });

  it("renders server history", () => {
    runtimeMock.mockReturnValue(
      makeRuntime({
        messages: [
          { role: "user", content: "杭州玩两天" },
          { role: "assistant", content: "先去西湖。" },
        ],
      }),
    );

    renderChatSession();

    expect(screen.getByText("杭州玩两天")).toBeInTheDocument();
    expect(screen.getByText("先去西湖。")).toBeInTheDocument();
    expect(
      screen.queryByText("Hi, gaga. Where are you thinking of going?"),
    ).not.toBeInTheDocument();
  });

  it("shows the welcome message only for an empty new chat", () => {
    renderChatSession(authenticatedState, null);

    expect(
      screen.getByText("Hi, gaga. Where are you thinking of going?"),
    ).toBeInTheDocument();
  });

  it("does not show the welcome message for an empty existing conversation", () => {
    renderChatSession();

    expect(
      screen.queryByText("Hi, gaga. Where are you thinking of going?"),
    ).not.toBeInTheDocument();
  });

  it("renders a pending user message while sending", () => {
    runtimeMock.mockReturnValue(
      makeRuntime({
        run: {
          id: "run-1",
          conversationId: "conversation-1",
          content: "杭州玩两天",
          phase: "sending",
          error: null,
        },
        isBusy: true,
        isSending: true,
      }),
    );

    renderChatSession();

    expect(screen.getByText("杭州玩两天")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Thinking…");
    expect(
      screen.getByRole("button", { name: "Sending message" }),
    ).toBeDisabled();
  });

  it("opens authentication without calling the runtime when anonymous", async () => {
    const user = userEvent.setup();
    const runtime = makeRuntime();
    runtimeMock.mockReturnValue(runtime);
    const view = renderChatSession({ status: "anonymous" });

    await user.type(view.input, "杭州玩两天");
    await user.click(view.submit);

    expect(view.onAuthRequired).toHaveBeenCalledOnce();
    expect(runtime.submitMessage).not.toHaveBeenCalled();
    expect(view.input).toHaveValue("杭州玩两天");
  });

  it("restores a failed run into the draft", async () => {
    runtimeMock.mockReturnValue(
      makeRuntime({
        run: {
          id: "run-1",
          conversationId: "conversation-1",
          content: "杭州玩两天",
          phase: "failed",
          error: "Language model request timed out",
        },
        error: "Language model request timed out",
      }),
    );

    const view = renderChatSession();

    expect(
      await screen.findByText("Language model request timed out"),
    ).toBeInTheDocument();
    expect(view.input).toHaveValue("杭州玩两天");
  });

  it("offers history refresh without restoring the draft after sync failure", async () => {
    const user = userEvent.setup();
    const runtime = makeRuntime({
      run: {
        id: "run-1",
        conversationId: "conversation-1",
        content: "杭州玩两天",
        phase: "sync-failed",
        error: "history unavailable",
      },
      isBusy: true,
      syncFailed: true,
      error: "history unavailable",
    });
    runtimeMock.mockReturnValue(runtime);
    const view = renderChatSession();

    expect(screen.getByText("杭州玩两天")).toBeInTheDocument();
    expect(screen.getByText("history unavailable")).toBeInTheDocument();
    expect(view.input).toHaveValue("");

    await user.click(
      screen.getByRole("button", { name: "Refresh conversation" }),
    );

    expect(runtime.retrySync).toHaveBeenCalledOnce();
  });
});
