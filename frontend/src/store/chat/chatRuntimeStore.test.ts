import { beforeEach, describe, expect, it } from "vitest";

import { useChatRuntimeStore } from "./chatRuntimeStore";

describe("chatRuntimeStore", () => {
  beforeEach(() => {
    useChatRuntimeStore.getState().clearAll();
  });

  it("moves a new chat from creation to awaiting send", () => {
    const store = useChatRuntimeStore.getState();
    const runId = store.enqueueNewChat("杭州玩两天");

    expect(useChatRuntimeStore.getState().runsById[runId]).toMatchObject({
      conversationId: null,
      phase: "creating-conversation",
    });

    useChatRuntimeStore
      .getState()
      .bindConversation(runId, "conversation-1");

    expect(useChatRuntimeStore.getState().runsById[runId]).toMatchObject({
      conversationId: "conversation-1",
      phase: "awaiting-send",
    });
  });

  it("lets only one caller claim the same run", () => {
    const runId = useChatRuntimeStore
      .getState()
      .enqueueConversationMessage("conversation-1", "继续");
    const store = useChatRuntimeStore.getState();

    expect(store.claimForSending(runId)).toBe(true);
    expect(store.claimForSending(runId)).toBe(false);
    expect(useChatRuntimeStore.getState().runsById[runId].phase).toBe(
      "sending",
    );
  });

  it("retries a failed send without creating a new run", () => {
    const runId = useChatRuntimeStore
      .getState()
      .enqueueConversationMessage("conversation-1", "继续");
    const store = useChatRuntimeStore.getState();

    store.claimForSending(runId);
    store.markFailed(runId, "temporary failure");
    store.retryFailed(runId);

    expect(useChatRuntimeStore.getState().runsById[runId]).toMatchObject({
      id: runId,
      conversationId: "conversation-1",
      phase: "awaiting-send",
      error: null,
    });
  });

  it("does not bind a run that was cleared during creation", () => {
    const runId = useChatRuntimeStore
      .getState()
      .enqueueNewChat("杭州玩两天");
    const store = useChatRuntimeStore.getState();

    store.removeRun(runId);

    expect(store.bindConversation(runId, "conversation-1")).toBe(false);
    expect(useChatRuntimeStore.getState().runsById).toEqual({});
  });

  it("clears pending work for only the unavailable conversation", () => {
    const store = useChatRuntimeStore.getState();
    store.enqueueConversationMessage("conversation-a", "A");
    store.enqueueConversationMessage("conversation-b", "B");

    store.clearConversation("conversation-a");

    expect(
      Object.values(useChatRuntimeStore.getState().runsById),
    ).toEqual([
      expect.objectContaining({
        conversationId: "conversation-b",
      }),
    ]);
  });
});
