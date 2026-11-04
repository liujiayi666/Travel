import type z from "zod";
import type { chatRequestSchema, chatResponseSchema } from "./schemas";

export type ChatResponse = z.output<typeof chatResponseSchema>;
export type ChatRequest = z.output<typeof chatRequestSchema>;
export type ChatResponseMessage = ChatResponse["message"];

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatSendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "error"; message: string };
