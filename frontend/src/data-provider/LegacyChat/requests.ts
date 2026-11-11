import { postJson } from "@/shared/api/client";
import { chatResponseSchema } from "./schemas";
import type { ChatRequest, ChatResponse } from "./types";

export const sendLegacyChatMessage = async (
  payload: ChatRequest,
): Promise<ChatResponse> =>
  postJson("/api/chat", payload, chatResponseSchema);
