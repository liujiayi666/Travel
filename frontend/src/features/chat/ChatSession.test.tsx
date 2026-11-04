import type { AuthState } from "@features/auth/type";
import type { ChatResponse } from "@features/chat/type";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatDraftProvider } from "./ChatDraftProvider";
import { ChatSession } from "./ChatSession";

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock("@features/chat/api", () => ({
  sendMessage: sendMessageMock,
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

const renderChatSession = () => {
  const onAuthRequired = vi.fn();
  const onPrimaryAction = vi.fn();

  render(
    <ChatDraftProvider currentUserId="user-1">
      <ChatSession
        chatId="kyoto"
        auth={authenticatedState}
        onAuthRequired={onAuthRequired}
        onPrimaryAction={onPrimaryAction}
      />
    </ChatDraftProvider>,
  );

  return {
    onAuthRequired,
    input: screen.getByLabelText("Describe your trip"),
    submit: screen.getByRole("button", { name: "Start planning" }),
  };
};

describe("ChatSession", () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
  });

  it("shows the user message and assistant response", async () => {
    const user = userEvent.setup();
    sendMessageMock.mockResolvedValue({
      message: { role: "assistant", content: "去西湖。" },
    });
    const view = renderChatSession();

    await user.type(view.input, "杭州周末去哪玩？");
    await user.click(view.submit);

    expect(await screen.findByText("去西湖。")).toBeInTheDocument();
    expect(screen.getByText("杭州周末去哪玩？")).toBeInTheDocument();
    expect(sendMessageMock).toHaveBeenCalledWith({
      message: "杭州周末去哪玩？",
    });
    expect(view.input).toHaveValue("");
  });

  it("replaces the previous turn because A6 is single-turn", async () => {
    const user = userEvent.setup();
    sendMessageMock
      .mockResolvedValueOnce({
        message: { role: "assistant", content: "First answer" },
      })
      .mockResolvedValueOnce({
        message: { role: "assistant", content: "Second answer" },
      });
    const view = renderChatSession();

    await user.type(view.input, "First question");
    await user.click(view.submit);
    expect(await screen.findByText("First answer")).toBeInTheDocument();

    await user.type(view.input, "Second question");
    await user.click(view.submit);
    expect(await screen.findByText("Second answer")).toBeInTheDocument();
    expect(screen.queryByText("First question")).not.toBeInTheDocument();
    expect(screen.queryByText("First answer")).not.toBeInTheDocument();
  });

  it("shows loading and disables duplicate submissions", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (response: ChatResponse) => void;
    sendMessageMock.mockReturnValue(
      new Promise<ChatResponse>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const view = renderChatSession();

    await user.type(view.input, "杭州玩两天");
    await user.click(view.submit);

    expect(await screen.findByRole("status")).toHaveTextContent("Thinking…");
    expect(
      screen.getByRole("button", { name: "Sending message" }),
    ).toBeDisabled();
    expect(view.input).toBeDisabled();
    expect(sendMessageMock).toHaveBeenCalledOnce();

    resolveRequest({
      message: { role: "assistant", content: "先去西湖。" },
    });
    expect(await screen.findByText("先去西湖。")).toBeInTheDocument();
  });

  it("shows an error, restores the draft, and allows retry", async () => {
    const user = userEvent.setup();
    sendMessageMock.mockRejectedValue(
      new Error("Language model request timed out"),
    );
    const view = renderChatSession();

    await user.type(view.input, "杭州玩两天");
    await user.click(view.submit);

    expect(
      await screen.findByText("Language model request timed out"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not send your message.",
    );
    expect(
      screen.getByRole("button", { name: "Start planning" }),
    ).toBeEnabled();
    expect(view.input).toHaveValue("杭州玩两天");
    expect(
      screen.queryByText("杭州玩两天", { selector: "p" }),
    ).not.toBeInTheDocument();
  });

  it("opens authentication and restores the draft after a 401", async () => {
    const user = userEvent.setup();
    sendMessageMock.mockResolvedValue(null);
    const view = renderChatSession();

    await user.type(view.input, "杭州玩两天");
    await user.click(view.submit);

    await waitFor(() => {
      expect(view.onAuthRequired).toHaveBeenCalledOnce();
    });
    expect(view.input).toHaveValue("杭州玩两天");
    expect(
      screen.queryByText("杭州玩两天", { selector: "p" }),
    ).not.toBeInTheDocument();
  });
});
