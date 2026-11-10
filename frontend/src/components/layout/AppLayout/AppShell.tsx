import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export const AppShell = ({ sidebar, children }: AppShellProps) => {
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarContent}>
          {sidebar}
        </div>
      </aside>

      <div className={styles.contentColumn}>
        <main id="main-content" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
};
