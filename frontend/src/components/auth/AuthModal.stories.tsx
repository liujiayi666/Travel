import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AuthModal } from "./AuthModal";

const meta = {
  title: "Auth/AuthModal",
  component: AuthModal,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    onClose: fn(),
    onLogin: async () => undefined,
    onRegister: async () => undefined,
  },
} satisfies Meta<typeof AuthModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};

export const CreateAccount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Create an account" }),
    );
    await expect(
      canvas.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
  },
};

export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(canvas.getByText("Invalid email address")).toBeVisible();
  },
};
