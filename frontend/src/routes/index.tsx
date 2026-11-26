import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout";
import {
  createBrowserRouter,
  Navigate,
} from "react-router";
import { AppProviders } from "@/providers/AppProviders";

const ChatRoute = lazy(() =>
  import("@/routes/ChatRoute").then((module) => ({
    default: module.ChatRoute,
  })),
);

const ChatRouteBoundary = () => (
  <Suspense
    fallback={
      <div className="route-loading" role="status" aria-live="polite">
        Loading conversation…
      </div>
    }
  >
    <ChatRoute />
  </Suspense>
);

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
            element: <ChatRouteBoundary />,
          },
          {
            path: "chat/:conversationId",
            element: <ChatRouteBoundary />,
          },
        ],
      },
    ],
  },
]);
