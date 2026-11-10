import type { User } from "@/data-provider/Auth";

export type AuthState =
  | { status: "checking" }
  | { status: "authenticated"; user: User }
  | { status: "anonymous" }
  | { status: "error"; message: string };
