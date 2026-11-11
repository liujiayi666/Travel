import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getJson, postJson } from "./client";

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("JSON API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses successful GET responses with the provided schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const schema = {
      parse: vi.fn((value: unknown) => value as { ok: boolean }),
    };

    await expect(getJson("/api/example", schema)).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("serializes POST bodies and sets the JSON content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1" }));
    const schema = {
      parse: vi.fn((value: unknown) => value as { id: string }),
    };

    await expect(
      postJson("/api/example", { message: "hello" }, schema),
    ).resolves.toEqual({ id: "1" });

    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ message: "hello" }));
    expect(new Headers(options.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("throws ApiError with the HTTP status and response detail", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Conversation not found" }, 404),
    );

    await expect(
      getJson("/api/missing", { parse: (value) => value }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        status: 404,
        message: "Conversation not found",
      }),
    );
  });
});
