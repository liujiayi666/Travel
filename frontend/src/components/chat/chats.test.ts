import { describe, expect, it } from "vitest";

import { isConversationId } from "./chats";

describe("isConversationId", () => {
  it.each(["", "toString", "__proto__", "kyoto"])(
    "rejects invalid URL value %s",
    (requestedChatId) => {
      expect(isConversationId(requestedChatId)).toBe(false);
    },
  );

  it("keeps a valid conversation UUID", () => {
    const conversationId = "19b20fdc-511c-4f9c-8d7e-3b8d7d85f8c0";

    expect(isConversationId(conversationId)).toBe(true);
  });
});
