import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { MessageStreamEvent } from "./types";
import {
  parseMessagesStreamEvent,
  streamMessage,
} from "./requests";

const fetchMock = vi.fn();
const encoder = new TextEncoder();

function streamResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

const conversationId = "conversation-1";
const runId = "run-1";
const userMessage = {
  id: "message-user",
  conversation_id: conversationId,
  role: "user",
  content: "杭州玩两天",
  created_at: "2026-11-12T00:00:00Z",
};
const assistantMessage = {
  id: "message-assistant",
  conversation_id: conversationId,
  role: "assistant",
  content: "先去西湖。",
  created_at: "2026-11-12T00:00:01Z",
};

describe("parseMessagesStreamEvent", () => {
  it("parses all application-owned stream event types", () => {
    expect(
      parseMessagesStreamEvent({
        event: "run.started",
        data: JSON.stringify({ runId, conversationId }),
      }),
    ).toEqual({
      type: "run.started",
      runId,
      conversationId,
    });

    expect(
      parseMessagesStreamEvent({
        event: "text.delta",
        data: JSON.stringify({ runId, delta: "先去" }),
      }),
    ).toEqual({
      type: "text.delta",
      runId,
      delta: "先去",
    });

    expect(
      parseMessagesStreamEvent({
        event: "run.failed",
        data: JSON.stringify({
          runId,
          code: "provider_error",
          message: "generation failed",
        }),
      }),
    ).toEqual({
      type: "run.failed",
      runId,
      code: "provider_error",
      message: "generation failed",
    });
  });

  it("converts persisted messages in run.completed", () => {
    const event = parseMessagesStreamEvent({
      event: "run.completed",
      data: JSON.stringify({
        runId,
        userMessage,
        assistantMessage,
      }),
    });

    expect(event).toEqual({
      type: "run.completed",
      runId,
      userMessage: {
        id: "message-user",
        conversationId,
        role: "user",
        content: "杭州玩两天",
        createdAt: "2026-11-12T00:00:00Z",
      },
      assistantMessage: {
        id: "message-assistant",
        conversationId,
        role: "assistant",
        content: "先去西湖。",
        createdAt: "2026-11-12T00:00:01Z",
      },
    });
  });

  it("ignores unknown events and rejects malformed payloads", () => {
    expect(
      parseMessagesStreamEvent({
        event: "heartbeat",
        data: "{}",
      }),
    ).toBeNull();

    expect(() =>
      parseMessagesStreamEvent({
        event: "text.delta",
        data: "{broken",
      }),
    ).toThrow("Invalid JSON payload for text.delta");
  });
});

describe("streamMessage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams typed events from the application SSE endpoint", async () => {
    const body = [
      "event: run.started",
      `data: ${JSON.stringify({ runId, conversationId })}`,
      "",
      "event: text.delta",
      `data: ${JSON.stringify({ runId, delta: "先去西湖。" })}`,
      "",
      "event: run.completed",
      `data: ${JSON.stringify({
        runId,
        userMessage,
        assistantMessage,
      })}`,
      "",
    ].join("\n");
    fetchMock.mockResolvedValue(streamResponse(body));
    const events: MessageStreamEvent[] = [];
    const controller = new AbortController();

    for await (const event of streamMessage(
      { content: "杭州玩两天" },
      conversationId,
      {
        signal: controller.signal,
      },
    )) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "text.delta",
      "run.completed",
    ]);
    expect(
      events
        .filter((event) => event.type === "text.delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("先去西湖。");
    expect(events.at(-1)).toMatchObject({
      type: "run.completed",
      assistantMessage: {
        id: "message-assistant",
        conversationId,
        content: "先去西湖。",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/conversations/${conversationId}/messages/stream`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "杭州玩两天" }),
        signal: controller.signal,
      }),
    );
  });
});
