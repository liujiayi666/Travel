import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Composer } from "./Composer";

const meta = {
  title: "Chat/Composer",
  component: Composer,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    state: {
      draft: "Plan a quiet five-day trip to Kyoto.",
      phase: "ready",
    },
    actions: {
      changeDraft: fn(),
      submit: fn(),
    },
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const CheckingSession: Story = {
  args: {
    state: {
      draft: "",
      phase: "checking",
    },
  },
};

export const SessionError: Story = {
  args: {
    state: {
      draft: "Plan a quiet five-day trip to Kyoto.",
      phase: "error",
    },
  },
};
