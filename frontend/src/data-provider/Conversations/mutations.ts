import { useMutation } from "@tanstack/react-query";

import {
  createConversation,
  sendMessage,
} from "./requests";
import type {
  ConversationCreateRequest,
  MessageSendRequest,
} from "./types";

export const useCreateConversationMutation = () =>
  useMutation({
    mutationFn: (payload: ConversationCreateRequest) =>
      createConversation(payload),
  });

export const useSendMessageMutation = () =>
  useMutation({
    mutationFn: ({
      conversationId,
      payload,
    }: {
      conversationId: string;
      payload: MessageSendRequest;
    }) => sendMessage(payload, conversationId),
  });
