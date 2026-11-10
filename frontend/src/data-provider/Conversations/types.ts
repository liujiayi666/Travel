import type z from "zod";
import type {
  conversationCreateRequestSchema,
  conversationListResponseSchema,
  conversationMessagesResponse,
  conversationResponseSchema,
  conversationsRequestSchema,
  sendMessageRequest,
  sendMessageResponse,
} from "./schemas";

export type ConversationCreateRequest = z.output<typeof conversationCreateRequestSchema>;
export type ConversationCreateResponse = z.output<typeof conversationResponseSchema>;
export type ConversationListRequest = z.output<typeof conversationsRequestSchema>;
export type ConversationListResponse = z.output<typeof conversationListResponseSchema>;

export type MessageSendRequest = z.output<typeof sendMessageRequest>;
export type MessageSendResponse = z.output<typeof sendMessageResponse>;

export type ConversationMessagesResponse = z.output<typeof conversationMessagesResponse>;
