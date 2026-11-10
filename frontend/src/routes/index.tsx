import { AppLayout } from "@/components/layout";
import { ChatRoute } from "@/routes/ChatRoute";
import {
  createBrowserRouter,
  Navigate,
} from "react-router";
import { AppProviders } from "@/providers/AppProviders";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppProviders />,
    errorElement: <div>error</div>,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/chat" replace />,
          },
          {
            path: "chat",
            element: <ChatRoute />,
          },
          {
            path: "chat/:conversationId",
            element: <ChatRoute />,
          },
        ],
      },
    ],
  },
]);
