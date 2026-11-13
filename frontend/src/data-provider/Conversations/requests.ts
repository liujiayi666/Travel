import { getJson, httpRequest, postJson } from "@/shared/api/client";
import {
  conversationListResponseSchema,
  conversationMessagesResponse,
  conversationResponseSchema,
  sendMessageResponse,
  streamRunCompletedSchema,
  streamRunFailedSchema,
  streamRunStartedSchema,
  streamTextDeltaSchema,
} from "./schemas";
import {
  MessageStreamEventType,
  type ConversationCreateRequest,
  type ConversationCreateResponse,
  type ConversationListResponse,
  type ConversationMessagesRequest,
  type ConversationMessagesResponse,
  type MessageSendRequest,
  type MessageSendResponse,
  type MessageStreamEvent,
  type StreamMessageOptions,
} from "./types";
import { parseSseStream, type SseEvent } from "@/shared/api/sseUtils";

//获取历史列表
export const getConversationList = async (): Promise<ConversationListResponse> =>
  getJson("/api/conversations", conversationListResponseSchema);

//获取指定对话的messages 记录
export const getConversationMessageList = async (
  conversationId: string,
  { limit, offset }: ConversationMessagesRequest = {},
): Promise<ConversationMessagesResponse> => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return getJson(
    `/api/conversations/${conversationId}/messages${query}`,
    conversationMessagesResponse,
  );
};

//创建会话
export const createConversation = async (
  payload: ConversationCreateRequest,
): Promise<ConversationCreateResponse> =>
  postJson("/api/conversations", payload, conversationResponseSchema);

//发送单条消息
export const sendMessage = async (
  payload: MessageSendRequest,
  conversationId: string,
): Promise<MessageSendResponse> =>
  postJson(`/api/conversations/${conversationId}/messages`, payload, sendMessageResponse);

export const parseMessagesStreamEvent = (sseEvent: SseEvent): MessageStreamEvent | null => {
  let payload: unknown;

  try {
    payload = JSON.parse(sseEvent.data);
  } catch {
    throw new Error(`Invalid JSON payload for ${sseEvent.event}`);
  }

  switch (sseEvent.event) {
    case MessageStreamEventType.RunStarted:
      return {
        type: MessageStreamEventType.RunStarted,
        ...streamRunStartedSchema.parse(payload),
      };
    case "text.delta":
      return {
        type: "text.delta",
        ...streamTextDeltaSchema.parse(payload),
      };

    case "run.completed":
      return {
        type: "run.completed",
        ...streamRunCompletedSchema.parse(payload),
      };

    case "run.failed":
      return {
        type: "run.failed",
        ...streamRunFailedSchema.parse(payload),
      };
    default:
      return null;
  }
};

export async function* streamMessage(
  payload: MessageSendRequest,
  conversationId: string,
  options: StreamMessageOptions,
): AsyncGenerator<MessageStreamEvent> {
  const response = await httpRequest(`/api/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  for await (const sseEvent of parseSseStream(response.body)) {
    const event = parseMessagesStreamEvent(sseEvent);
    if (event !== null) {
      yield event;
    }
  }
}
