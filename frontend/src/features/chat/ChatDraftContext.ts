import { createContext, use } from "react";

export interface ChatDraftActions {
  updateDraft: (chatId: string, draft: string) => void;
  clearDraft: (chatId: string) => void;
}

export interface ChatDraftContextValue {
  state: {
    draftsByChatId: Readonly<Record<string, string>>;
  };
  actions: ChatDraftActions;
}

export const ChatDraftContext = createContext<ChatDraftContextValue | null>(
  null,
);

const useChatDraftContext = () => {
  const context = use(ChatDraftContext);
  if (context === null) {
    throw new Error("useChatDraft must be used inside ChatDraftProvider");
  }

  return context;
};

export const useChatDraft = (chatId: string) => {
  const context = useChatDraftContext();

  return {
    draft: context.state.draftsByChatId[chatId] ?? "",
    changeDraft: (draft: string) =>
      context.actions.updateDraft(chatId, draft),
    clearDraft: () => context.actions.clearDraft(chatId),
  };
};
