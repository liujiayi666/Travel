import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import styles from "./AccountMenu.module.css";

export interface AccountSummary {
  name: string;
  detail: string;
  initials: string;
}

export interface AccountMenuItem {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
}

interface AccountMenuProps {
  account: AccountSummary;
  items: readonly AccountMenuItem[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "That action could not be completed. Please try again.";
}

export const AccountMenu = ({ account, items }: AccountMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    firstItemRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setErrorMessage("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setErrorMessage("");
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleMenu = () => {
    setErrorMessage("");
    setIsOpen((open) => !open);
  };

  const handleItemSelect = async (item: AccountMenuItem) => {
    if (pendingItemId) {
      return;
    }

    setErrorMessage("");
    setPendingItemId(item.id);

    try {
      await item.onSelect();
      setIsOpen(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingItemId(null);
    }
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className={styles.account} ref={rootRef}>
      {isOpen && (
        <div
          id={menuId}
          className={styles.popover}
          role="group"
          aria-label="Account actions"
        >
          <div className={styles.menu}>
            {items.map((item, index) => {
              const isPending = pendingItemId === item.id;
              return (
                <button
                  ref={index === 0 ? firstItemRef : undefined}
                  type="button"
                  className={styles.menuAction}
                  key={item.id}
                  disabled={isPending}
                  onClick={() => void handleItemSelect(item)}
                >
                  {isPending ? `${item.label}…` : item.label}
                </button>
              );
            })}
          </div>

          {errorMessage && (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Account menu for ${account.name}`}
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.avatar}>{account.initials}</span>
        <span className={styles.copy}>
          <strong>{account.name}</strong>
          <small>{account.detail}</small>
        </span>
        <svg
          className={styles.chevron}
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
    </div>
  );
};
