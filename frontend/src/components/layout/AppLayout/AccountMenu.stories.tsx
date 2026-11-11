import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AccountMenu } from "./AccountMenu";

const meta = {
  title: "Layout/AccountMenu",
  component: AccountMenu,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 260,
          padding: 14,
          background: "#f7f8f7",
          borderRadius: 16,
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    account: {
      name: "gaga",
      detail: "gaga@outlook.com",
      initials: "G",
    },
    items: [
      {
        id: "sign-out",
        label: "Sign out",
        onSelect: () => undefined,
      },
    ],
  },
} satisfies Meta<typeof AccountMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /account menu/i }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Sign out" })).toBeVisible(),
    );
  },
};

export const SignOutError: Story = {
  args: {
    items: [
      {
        id: "sign-out",
        label: "Sign out",
        onSelect: async () => {
          throw new Error("Could not sign out. Please try again.");
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /account menu/i }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not sign out",
    );
  },
};
