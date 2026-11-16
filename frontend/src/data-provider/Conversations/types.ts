import type z from "zod";
import type {
  conversationCreateRequestSchema,
  conversationListResponseSchema,
  conversationMessageResponseSchema,
  conversationMessagesRequestSchema,
  conversationMessagesResponse,
  conversationResponseSchema,
  conversationsRequestSchema,
  sendMessageRequest,
  sendMessageResponse,
  streamRunCompletedSchema,
  streamRunFailedSchema,
  streamRunStartedSchema,
  streamTextDeltaSchema,
} from "./schemas";

export type ConversationCreateRequest = z.output<typeof conversationCreateRequestSchema>;
export type ConversationCreateResponse = z.output<typeof conversationResponseSchema>;
export type ConversationListRequest = z.output<typeof conversationsRequestSchema>;
export type ConversationListResponse = z.output<typeof conversationListResponseSchema>;
export type ConversationMessagesRequest = z.output<typeof conversationMessagesRequestSchema>;

export type MessageSendRequest = z.output<typeof sendMessageRequest>;
export type MessageSendResponse = z.output<typeof sendMessageResponse>;

//list
export type ConversationMessagesResponse = z.output<typeof conversationMessagesResponse>;

//sigle message
export type ConversationMessageResponse = z.output<typeof conversationMessageResponseSchema>;

export type StreamRunStartedPayload = z.output<typeof streamRunStartedSchema>;

export type StreamTextDeltaPayload = z.output<typeof streamTextDeltaSchema>;

export type StreamRunCompletedPayload = z.output<typeof streamRunCompletedSchema>;

export type StreamRunFailedPayload = z.output<typeof streamRunFailedSchema>;

export const MessageStreamEventType = {
  RunStarted: "run.started",
  TextDelta: "text.delta",
  RunCompleted: "run.completed",
  RunFailed: "run.failed",
} as const;

export type MessageSseType = (typeof MessageStreamEventType)[keyof typeof MessageStreamEventType];

export type MessageStreamEvent =
  | ({
      type: typeof MessageStreamEventType.RunStarted;
    } & StreamRunStartedPayload)
  | ({
      type: typeof MessageStreamEventType.TextDelta;
    } & StreamTextDeltaPayload)
  | ({
      type: typeof MessageStreamEventType.RunCompleted;
    } & StreamRunCompletedPayload)
  | ({
      type: typeof MessageStreamEventType.RunFailed;
    } & StreamRunFailedPayload);

export interface StreamMessageOptions {
  signal?: AbortSignal;
  // onEvent: (event: MessageStreamEvent) => void;
}
