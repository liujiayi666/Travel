import z from "zod";

const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().min(1),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export const chatResponseSchema = z.object({
  message: assistantMessageSchema,
});
