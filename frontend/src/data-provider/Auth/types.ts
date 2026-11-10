import type z from "zod";
import {
  loginInputSchema,
  registerInputSchema,
  registerRequestSchema,
  type userSchema,
} from "./schemas";

export type UserResponse = z.input<typeof userSchema>;
export type User = z.output<typeof userSchema>;

export type LoginInput = z.output<typeof loginInputSchema>;
export type RegisterInput = z.output<typeof registerInputSchema>;
export type RegisterRequest = z.output<typeof registerRequestSchema>;
