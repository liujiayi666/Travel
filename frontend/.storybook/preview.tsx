import "@fontsource-variable/inter";
import type { Preview } from "@storybook/react-vite";

import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: "todo",
    },
    options: {
      storySort: {
        order: ["Layout", "Chat", "Auth", "UI"],
      },
    },
  },
};

export default preview;
