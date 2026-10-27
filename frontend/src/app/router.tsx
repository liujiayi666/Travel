import { AppLayout } from "@/layouts/AppLayout/AppLayout";
import { ChatPage } from "@/routes/ChatPage";
import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <div>error</div>,
    children: [{ index: true, element: <ChatPage /> }],
  },
]);
