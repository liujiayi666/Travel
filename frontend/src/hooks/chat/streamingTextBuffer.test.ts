import { afterEach, describe, expect, it, vi } from "vitest";

import { createStreamingTextBuffer } from "./streamingTextBuffer";

describe("createStreamingTextBuffer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces deltas and flushes the final text immediately", () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = createStreamingTextBuffer(onFlush, 32);

    buffer.push("先");
    buffer.push("去");
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(31);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledWith("先去");

    buffer.push("西湖");
    buffer.flush();
    expect(onFlush).toHaveBeenLastCalledWith("西湖");
  });
});
