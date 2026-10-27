import { RouterProvider } from "react-router";
import { AuthProvider } from "@features/auth/AuthProvider";
import { ModalOutlet } from "@app/modal/ModalOutlet";
import { router } from "@app/router";
import { ModalProvider } from "@shared/components/Modal/ModalProvider";

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <RouterProvider router={router} />
        <ModalOutlet />
      </ModalProvider>
    </AuthProvider>
  );
}
