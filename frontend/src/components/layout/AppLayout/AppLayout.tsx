import { Outlet, useParams, useSearchParams } from "react-router";
import { useEffect } from "react";

import { useAuth, useAuthActions } from "@/components/auth";
import type { ChatSummary } from "@/components/chat/chats";
import { useConversationList } from "@/data-provider/Conversations";
import { useModal } from "@/components/common/Modal";
import type { AccountMenuItem } from "./AccountMenu";
import { AppShell } from "./AppShell";
import { Content } from "./Content";
import { navigation } from "./navigation";
import { Sidebar } from "./Sidebar";
import { ApiError } from "@/shared/api/client";

export const AppLayout = () => {
  const auth = useAuth();
  const { expireSession, logout } = useAuthActions();
  const {
    actions: { open: openModal },
  } = useModal();
  const [searchParams] = useSearchParams();
  const { conversationId: routeConversationId } = useParams();
  const currentUserId =
    auth.status === "authenticated" ? auth.user.id : null;
  const {
    data: conversations,
    error: conversationListError,
  } = useConversationList(currentUserId);
  const recentChats: readonly ChatSummary[] = (conversations ?? []).map(
    (conversation) => ({
      id: conversation.id,
      label: conversation.title,
      href: `/chat/${encodeURIComponent(conversation.id)}`,
    }),
  );

  const activeChatId = routeConversationId ?? null;
  const activeNavigationId =
    routeConversationId === undefined
      ? "new chat"
      : searchParams.get("section") ?? "trip-planner";

  const isAuthenticated = auth.status === "authenticated";
  const displayName = auth.status === "authenticated" ? auth.user.displayName : "Guest";
  const detail = auth.status === "authenticated" ? auth.user.email : "Sign in to sync trips";
  const initials = displayName.slice(0, 1).toUpperCase();

  const openAuthModal = () => {
    openModal({ type: "auth" });
  };

  useEffect(() => {
    if (
      !(
        conversationListError instanceof ApiError &&
        conversationListError.status === 401
      )
    ) {
      return;
    }

    void expireSession();
    openModal({ type: "auth" });
  }, [conversationListError, expireSession, openModal]);

  const accountMenuItems: readonly AccountMenuItem[] = isAuthenticated
    ? [
        {
          id: "sign-out",
          label: "Sign out",
          onSelect: logout,
        },
      ]
    : [
        {
          id: "sign-in",
          label: "Sign in",
          onSelect: openAuthModal,
        },
      ];

  return (
    <AppShell
      sidebar={
        <Sidebar
          navigation={navigation}
          activeNavigationId={activeNavigationId}
          recentChats={recentChats}
          activeChatId={activeChatId}
          account={{ name: displayName, detail, initials }}
          accountMenuItems={accountMenuItems}
        />
      }
    >
      <Content>
        <Outlet />
      </Content>
    </AppShell>
  );
};
