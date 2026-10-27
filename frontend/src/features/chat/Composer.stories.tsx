import type { Meta, StoryObj } from "@storybook/react-vite";

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
    isAuthenticated: true,
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const SignedOut: Story = {
  args: {
    isAuthenticated: false,
  },
};
