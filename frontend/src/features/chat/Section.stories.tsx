import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Section } from "./Section";

const meta = {
  title: "Chat/Section",
  component: Section,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    auth: { status: "anonymous" },
    primaryActionLabel: "Sign in",
    onPrimaryAction: fn(),
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Anonymous: Story = {};

export const SignedIn: Story = {
  args: {
    auth: {
      status: "authenticated",
      user: {
        id: "user-1",
        displayName: "gaga",
        email: "gaga@outlook.com",
        createdAt: "2026-10-27T00:00:00Z",
      },
    },
    primaryActionLabel: "New trip",
  },
};

export const SessionError: Story = {
  args: {
    auth: {
      status: "error",
      message: "Unable to restore your session.",
    },
  },
};
