import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthContext";

export const ProtectedRoute = () => {
  const auth = useAuth();

  switch (auth.status) {
    case "checking":
      return <p>正在确认登录状态…</p>;

    case "error":
      return (
        <div>
          <p>认证状态无法确认</p>
          {/* <button onClick={refresh}>重试</button> */}
        </div>
      );

    case "anonymous":
      return <Navigate to="/login" replace />;

    case "authenticated":
      return <Outlet />;
  }
};
