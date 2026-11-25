import { describe, expect, it } from "vitest";

import { sendMessageResponse } from "./schemas";

describe("sendMessageResponse", () => {
  it("keeps the run id and assistant message", () => {
    const response = sendMessageResponse.parse({
      run_id: "run-1",
      message: {
        role: "assistant",
        content: "去西湖。",
      },
    });

    expect(response).toEqual({
      runId: "run-1",
      message: {
        role: "assistant",
        content: "去西湖。",
      },
    });
  });
});
