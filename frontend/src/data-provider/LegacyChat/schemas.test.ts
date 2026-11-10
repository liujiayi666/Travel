import { describe, expect, it } from "vitest";
import { chatRequestSchema, chatResponseSchema } from "./schemas";

describe("legacy chat schemas", () => {
  it("accepts and normalizes a single message request", () => {
    expect(chatRequestSchema.parse({ message: "  杭州周末去哪玩？ " })).toEqual({
      message: "杭州周末去哪玩？",
    });
  });

  it("accepts an assistant message in the response", () => {
    expect(
      chatResponseSchema.parse({
        message: {
          role: "assistant",
          content: "去西湖。",
        },
      }),
    ).toEqual({
      message: {
        role: "assistant",
        content: "去西湖。",
      },
    });
  });

  it("rejects a request that lets the client choose a role", () => {
    expect(() =>
      chatRequestSchema.parse({
        message: {
          role: "user",
          content: "杭州周末去哪玩？",
        },
      }),
    ).toThrow();
  });
});
