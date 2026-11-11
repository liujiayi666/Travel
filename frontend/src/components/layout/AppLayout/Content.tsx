import type { ReactNode } from "react";
import styles from "./Content.module.css";

interface ContentProps {
  children: ReactNode;
}

export const Content = ({ children }: ContentProps) => {
  return <div className={styles.content}>{children}</div>;
};
