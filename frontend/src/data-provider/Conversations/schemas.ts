import z from "zod";

export const conversationCreateRequestSchema = z.object({
  message: z.string(),
});

export const conversationsRequestSchema = z.object({
  limit: z.int().optional(),
  offset: z.int().optional(),
});

export const conversationResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform(({ created_at, updated_at, ...reset }) => ({
    ...reset,
    createdAt: created_at,
    updatedAt: updated_at,
  }));

export const conversationListResponseSchema = z.array(conversationResponseSchema);

export const sendMessageRequest = z.object({
  content: z.string().min(1),
});

const sendMessageResponseMessage = z.object({
  role: z.literal("assistant"),
  content: z.string(),
});

export const sendMessageResponse = z.object({
  message: sendMessageResponseMessage,
});

export const conversationMessagesResponse = z.array(
  z
    .object({
      id: z.string(),
      conversation_id: z.string(),
      role: z.union([z.literal("assistant"), z.literal("user")]),
      content: z.string(),
      created_at: z.string(),
    })
    .transform(({ conversation_id, created_at, ...reset }) => ({
      ...reset,
      conversationId: conversation_id,
      createdAt: created_at,
    })),
);
