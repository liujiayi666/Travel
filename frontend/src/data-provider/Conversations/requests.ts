import { getJson, postJson } from "@/shared/api/client";
import {
  conversationListResponseSchema,
  conversationMessagesResponse,
  conversationResponseSchema,
  sendMessageResponse,
} from "./schemas";
import type {
  ConversationCreateRequest,
  ConversationCreateResponse,
  ConversationListResponse,
  ConversationMessagesResponse,
  MessageSendRequest,
  MessageSendResponse,
} from "./types";

//获取历史列表
export const getConversationList = async (): Promise<ConversationListResponse> =>
  getJson("/api/conversations", conversationListResponseSchema);

//获取指定对话的messages 记录
export const getConversationMessageList = async (
  conversationId: string,
): Promise<ConversationMessagesResponse> =>
  getJson(
    `/api/conversations/${conversationId}/messages`,
    conversationMessagesResponse,
  );

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
  postJson(
    `/api/conversations/${conversationId}/messages`,
    payload,
    sendMessageResponse,
  );
