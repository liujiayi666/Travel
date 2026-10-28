import { describe, expect, it } from "vitest";

import { defaultChatId, resolveChatId } from "./chats";

describe("resolveChatId", () => {
  it.each(["toString", "__proto__"])(
    "rejects unsafe URL key %s",
    (requestedChatId) => {
      const params = new URLSearchParams(`?chat=${requestedChatId}`);

      expect(resolveChatId(params.get("chat"))).toBe(defaultChatId);
    },
  );

  it("keeps a known chat ID", () => {
    expect(resolveChatId("islands")).toBe("islands");
  });
});
