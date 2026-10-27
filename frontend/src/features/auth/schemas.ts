import z from "zod";

export const userSchema = z
  .object({
    id: z.string(),
    display_name: z.string(),
    email: z.string(),
    created_at: z.string(),
  })
  .transform(({ display_name, created_at, ...rest }) => ({
    ...rest,
    displayName: display_name,
    createdAt: created_at,
  }));

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const registerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  email: z.email(),
});

export const registerRequestSchema = registerInputSchema.transform(
  ({ displayName, ...rest }) => ({
    display_name: displayName,
    ...rest,
  }),
);
