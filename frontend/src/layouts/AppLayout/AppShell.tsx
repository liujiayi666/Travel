import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./AppShell.module.css";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export const AppShell = ({ sidebar, children }: AppShellProps) => {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 780px)").matches,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 780px)");
    const updateViewport = () => {
      setIsMobile(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setIsSidebarOpen(false);
      }
    };

    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobile || !isSidebarOpen) {
      return;
    }

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobile, isSidebarOpen]);

  const closeSidebar = () => {
    setIsSidebarOpen(false);
    menuButtonRef.current?.focus();
  };

  const handleSidebarClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <aside
        id="app-sidebar"
        className={`${styles.sidebar} ${
          isSidebarOpen ? styles.sidebarOpen : ""
        }`}
        role={isMobile ? "dialog" : undefined}
        aria-label={isMobile ? "Workspace navigation" : undefined}
        aria-modal={isMobile ? isSidebarOpen : undefined}
        inert={isMobile && !isSidebarOpen}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeSidebar}
          aria-label="Close navigation"
          onClick={closeSidebar}
        >
          ×
        </button>
        <div className={styles.sidebarContent} onClickCapture={handleSidebarClick}>
          {sidebar}
        </div>
      </aside>

      {isMobile && isSidebarOpen && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close navigation"
          onClick={closeSidebar}
        />
      )}

      <div className={styles.contentColumn}>
        <header className={styles.mobileBar}>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation"
            aria-controls="app-sidebar"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          >
            <svg
              viewBox="0 0 20 20"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M3 5H17M3 10H17M3 15H17" />
            </svg>
          </button>
          <span className={styles.mobileBrand}>
            <span aria-hidden="true">✦</span>
            Travel Copilot
          </span>
        </header>

        <main
          id="main-content"
          className={styles.content}
          tabIndex={-1}
          inert={isMobile && isSidebarOpen}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
