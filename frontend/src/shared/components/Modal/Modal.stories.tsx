import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { Modal } from "./Modal";

const meta = {
  title: "UI/Modal",
  component: Modal,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    ariaLabel: "Example dialog",
    onClose: fn(),
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    children: (
      <div style={{ padding: 28 }}>
        <h2>Modal title</h2>
        <p style={{ marginTop: 8 }}>
          This is a reusable modal surface with close and backdrop behavior.
        </p>
      </div>
    ),
  },
};
