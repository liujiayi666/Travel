import type z from "zod";
import type {
  chatRequestSchema,
  chatResponseSchema,
} from "./schemas";

export type ChatRequest = z.output<typeof chatRequestSchema>;
export type ChatResponse = z.output<typeof chatResponseSchema>;
export type ChatResponseMessage = ChatResponse["message"];
