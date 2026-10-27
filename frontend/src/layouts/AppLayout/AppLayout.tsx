import { Outlet, useSearchParams } from "react-router";

import {
  useAuth,
  useAuthActions,
} from "@features/auth/AuthContext";
import { useModal } from "@shared/components/Modal/ModalContext";
import type { AccountMenuItem } from "./AccountMenu";
import { AppShell } from "./AppShell";
import { Content } from "./Content";
import { navigation, recentChats } from "./navigation";
import { Sidebar } from "./Sidebar";

export const AppLayout = () => {
  const auth = useAuth();
  const { logout } = useAuthActions();
  const {
    actions: { open: openModal },
  } = useModal();
  const [searchParams] = useSearchParams();
  const activeNavigationId =
    searchParams.get("section") ?? "trip-planner";
  const activeChatId = searchParams.get("chat") ?? "kyoto";

  const isAuthenticated = auth.status === "authenticated";
  const displayName =
    auth.status === "authenticated" ? auth.user.displayName : "Guest";
  const detail =
    auth.status === "authenticated"
      ? auth.user.email
      : "Sign in to sync trips";
  const initials = displayName.slice(0, 1).toUpperCase();

  const openAuthModal = () => {
    openModal({ type: "auth" });
  };

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
