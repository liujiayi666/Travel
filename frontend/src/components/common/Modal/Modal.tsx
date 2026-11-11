import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import styles from "./Modal.module.css";

type ModalSize = "small" | "medium" | "large";

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
}

type ModalLabelProps =
  | { ariaLabel: string; ariaLabelledBy?: never }
  | { ariaLabel?: never; ariaLabelledBy: string };

type ModalProps = ModalBaseProps & ModalLabelProps;

export const Modal = ({
  open,
  onClose,
  children,
  size = "medium",
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdrop = true,
}: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles[size]}`}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={handleBackdropClick}
      onCancel={handleCancel}
    >
      <div className={styles.panel}>{children}</div>
    </dialog>
  );
};
