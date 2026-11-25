import z from "zod";

export const conversationCreateRequestSchema = z.object({
  message: z.string(),
});

export const conversationsRequestSchema = z.object({
  limit: z.int().optional(),
  offset: z.int().optional(),
});

export const conversationMessagesRequestSchema = conversationsRequestSchema;

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

export const sendMessageResponse = z
  .object({
    run_id: z.string(),
    message: sendMessageResponseMessage,
  })
  .transform(({ run_id, ...rest }) => ({
    ...rest,
    runId: run_id,
  }));

export const conversationMessageResponseSchema = z
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
  }));

export const conversationMessagesResponse = z.array(conversationMessageResponseSchema);

export const streamRunStartedSchema = z.object({
  runId: z.string(),
  conversationId: z.string(),
});

export const streamTextDeltaSchema = z.object({
  runId: z.string(),
  delta: z.string(),
});

export const streamRunCompletedSchema = z.object({
  runId: z.string(),
  userMessage: conversationMessageResponseSchema,
  assistantMessage: conversationMessageResponseSchema,
});

export const streamRunFailedSchema = z.object({
  runId: z.string(),
  code: z.enum([
    "provider_timeout",
    "provider_error",
    "internal_error",
    "conversation_busy",
  ]),
  message: z.string(),
});
