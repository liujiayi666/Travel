export interface ChatSummary {
  id: string;
  label: string;
  href: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isConversationId = (value: string) =>
  UUID_PATTERN.test(value);
