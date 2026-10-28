import type { ReactNode } from "react";
import { Link } from "react-router";
import type { ChatSummary } from "@features/chat/chats";
import {
  AccountMenu,
  type AccountMenuItem,
} from "./AccountMenu";
import styles from "./Sidebar.module.css";

export interface NavigationItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

export type RecentChat = ChatSummary;

export interface Account {
  name: string;
  detail: string;
  initials: string;
}

interface SidebarProps {
  navigation: readonly NavigationItem[];
  activeNavigationId: string;
  recentChats: readonly RecentChat[];
  activeChatId: string | null;
  account: Account;
  accountMenuItems: readonly AccountMenuItem[];
}

export const Sidebar = ({
  navigation,
  activeNavigationId,
  recentChats,
  activeChatId,
  account,
  accountMenuItems,
}: SidebarProps) => {
  return (
    <div className={styles.sidebar}>
      <div className={styles.body}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            ✦
          </span>
          <span>Travel Copilot</span>
        </div>

        <nav aria-label="Workspace navigation">
          <p className={styles.sectionLabel}>Workspace</p>
          <div className={styles.navList}>
            {navigation.map((item) => {
              const isActive = item.id === activeNavigationId;
              return (
                <Link
                  className={isActive ? styles.activeNav : styles.navItem}
                  key={item.id}
                  to={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {isActive && <i aria-hidden="true" />}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={styles.recent}>
          <p className={styles.sectionLabel}>Recent chats</p>
          <div className={styles.navList}>
            {recentChats.map((chat) => {
              const isActive = chat.id === activeChatId;
              return (
                <Link
                  className={isActive ? styles.activeChat : styles.chatItem}
                  key={chat.id}
                  to={chat.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {chat.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.accountArea}>
        <AccountMenu account={account} items={accountMenuItems} />
      </div>
    </div>
  );
};
