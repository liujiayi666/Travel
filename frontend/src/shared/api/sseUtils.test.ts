import { describe, expect, it } from "vitest";

import { parseSseStream } from "./sseUtils";

const encoder = new TextEncoder();

function streamFromChunks(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<Array<{ event: string; data: string }>> {
  const events: Array<{ event: string; data: string }> = [];

  for await (const event of parseSseStream(stream)) {
    events.push(event);
  }

  return events;
}

describe("parseSseStream", () => {
  it("parses multiple events delivered in one chunk", async () => {
    const body = [
      "event: run.started",
      'data: {"runId":"run-1"}',
      "",
      "event: text.delta",
      'data: {"runId":"run-1","delta":"先去"}',
      "",
    ].join("\n");

    await expect(
      collect(streamFromChunks([encoder.encode(body)])),
    ).resolves.toEqual([
      {
        event: "run.started",
        data: '{"runId":"run-1"}',
      },
      {
        event: "text.delta",
        data: '{"runId":"run-1","delta":"先去"}',
      },
    ]);
  });

  it("preserves Chinese text when a UTF-8 character crosses chunks", async () => {
    const payload =
      'event: text.delta\ndata: {"delta":"西湖"}\n\n';
    const chineseCharacterIndex = payload.indexOf("西");
    const prefix = encoder.encode(
      payload.slice(0, chineseCharacterIndex),
    );
    const chineseBytes = encoder.encode("西");

    const chunks = [
      prefix,
      chineseBytes.slice(0, 1),
      chineseBytes.slice(1),
      encoder.encode(
        payload.slice(chineseCharacterIndex + 1),
      ),
    ];

    await expect(
      collect(streamFromChunks(chunks)),
    ).resolves.toEqual([
      {
        event: "text.delta",
        data: '{"delta":"西湖"}',
      },
    ]);
  });

  it("supports CRLF framing and ignores heartbeat comments", async () => {
    const body =
      ": heartbeat\r\n\r\n" +
      "event: run.completed\r\n" +
      'data: {"runId":"run-1"}\r\n\r\n';

    await expect(
      collect(streamFromChunks([encoder.encode(body)])),
    ).resolves.toEqual([
      {
        event: "run.completed",
        data: '{"runId":"run-1"}',
      },
    ]);
  });

  it("propagates stream read failures", async () => {
    const failure = new Error("network interrupted");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });

    await expect(collect(stream)).rejects.toThrow(
      "network interrupted",
    );
  });
});
