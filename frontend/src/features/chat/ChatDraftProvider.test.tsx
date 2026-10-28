import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useChatDraft } from "./ChatDraftContext";
import { ChatDraftProvider } from "./ChatDraftProvider";

const DraftHarness = () => {
  const [chatId, setChatId] = useState("kyoto");
  const { draft, changeDraft } = useChatDraft(chatId);

  return (
    <div>
      <button type="button" onClick={() => setChatId("kyoto")}>
        Open Kyoto
      </button>
      <button type="button" onClick={() => setChatId("islands")}>
        Open Islands
      </button>
      <textarea
        aria-label="Draft"
        value={draft}
        onChange={(event) => changeDraft(event.target.value)}
      />
    </div>
  );
};

describe("ChatDraftProvider", () => {
  it("keeps separate drafts while switching between chats", async () => {
    const user = userEvent.setup();

    render(
      <ChatDraftProvider currentUserId={null}>
        <DraftHarness />
      </ChatDraftProvider>,
    );

    await user.type(screen.getByLabelText("Draft"), "Kyoto in five days");
    await user.click(screen.getByRole("button", { name: "Open Islands" }));
    expect(screen.getByLabelText("Draft")).toHaveValue("");

    await user.type(screen.getByLabelText("Draft"), "Bali or Phuket?");
    await user.click(screen.getByRole("button", { name: "Open Kyoto" }));
    expect(screen.getByLabelText("Draft")).toHaveValue("Kyoto in five days");
  });

  it("preserves anonymous drafts across login and clears them on logout", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ChatDraftProvider currentUserId={null}>
        <DraftHarness />
      </ChatDraftProvider>,
    );

    await user.type(screen.getByLabelText("Draft"), "Keep this draft");
    rerender(
      <ChatDraftProvider currentUserId="user-1">
        <DraftHarness />
      </ChatDraftProvider>,
    );
    expect(screen.getByLabelText("Draft")).toHaveValue("Keep this draft");

    rerender(
      <ChatDraftProvider currentUserId={null}>
        <DraftHarness />
      </ChatDraftProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Draft")).toHaveValue("");
    });
  });
});
