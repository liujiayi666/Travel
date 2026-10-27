import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MemoryRouter } from "react-router";

import { Sidebar } from "./Sidebar";

const meta = {
  title: "Layout/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: 260 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    navigation: [
      {
        id: "trip-planner",
        label: "Trip planner",
        icon: "＋",
        href: "/?section=trip-planner",
      },
      {
        id: "my-trips",
        label: "My trips",
        icon: "▤",
        href: "/?section=my-trips",
      },
      {
        id: "explore",
        label: "Explore places",
        icon: "◎",
        href: "/?section=explore",
      },
      {
        id: "saved-guides",
        label: "Saved guides",
        icon: "▱",
        href: "/?section=saved-guides",
      },
    ],
    activeNavigationId: "trip-planner",
    recentChats: [
      {
        id: "kyoto",
        label: "Kyoto in five days",
        href: "/?section=trip-planner&chat=kyoto",
      },
      {
        id: "islands",
        label: "Bali or Phuket?",
        href: "/?section=trip-planner&chat=islands",
      },
    ],
    activeChatId: "kyoto",
    account: {
      name: "Jamie Lee",
      detail: "jamie@example.com",
      initials: "J",
    },
    accountMenuItems: [
      {
        id: "sign-out",
        label: "Sign out",
        onSelect: fn(),
      },
    ],
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const AccountMenuOpen: Story = {
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

export const SignedOut: Story = {
  args: {
    account: {
      name: "Guest",
      detail: "Sign in to sync trips",
      initials: "G",
    },
    accountMenuItems: [
      {
        id: "sign-in",
        label: "Sign in",
        onSelect: fn(),
      },
    ],
  },
};
