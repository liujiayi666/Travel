import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Conversation } from "./Conversation";

const auth = {
  status: "authenticated" as const,
  user: {
    id: "user-1",
    displayName: "gaga",
    email: "gaga@example.com",
    createdAt: "2026-11-12T00:00:00Z",
  },
};

describe("Conversation scrolling", () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
  });

  afterEach(() => {
    scrollTo.mockReset();
  });

  it("scrolls to the latest message when a conversation opens", () => {
    render(
      <Conversation
        auth={auth}
        messages={[
          {
            id: "message-1",
            role: "assistant",
            content: "Welcome to Hangzhou.",
          },
        ]}
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "auto",
    });
  });

  it("keeps the latest streamed content in view as it grows", () => {
    const { rerender } = render(
      <Conversation
        auth={auth}
        messages={[
          { role: "user", content: "Plan a weekend in Hangzhou." },
          { role: "assistant", content: "Start at West Lake." },
        ]}
        isSending
      />,
    );

    scrollTo.mockClear();

    rerender(
      <Conversation
        auth={auth}
        messages={[
          { role: "user", content: "Plan a weekend in Hangzhou." },
          {
            role: "assistant",
            content: "Start at West Lake, then visit Lingyin Temple.",
          },
        ]}
        isSending
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "auto",
    });
  });
});
