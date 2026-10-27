import type { Meta, StoryObj } from "@storybook/react-vite";

import { Conversation } from "./Conversation";

const meta = {
  title: "Chat/Conversation",
  component: Conversation,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720, minHeight: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    auth: { status: "anonymous" },
  },
} satisfies Meta<typeof Conversation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

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
