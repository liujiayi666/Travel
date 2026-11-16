const DEFAULT_FLUSH_MS = 32;

export interface StreamingTextBuffer {
  push(delta: string): void;
  flush(): void;
}

export const createStreamingTextBuffer = (
  onFlush: (text: string) => void,
  flushMs = DEFAULT_FLUSH_MS,
): StreamingTextBuffer => {
  let pending = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (pending.length === 0) {
      return;
    }

    const text = pending;
    pending = "";
    onFlush(text);
  };

  return {
    push(delta) {
      if (delta.length === 0) {
        return;
      }

      pending += delta;
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          flush();
        }, flushMs);
      }
    },
    flush,
  };
};
