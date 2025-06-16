import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RecordEditor from "./record-editor";
import SettingsPage from "./settings";
import RequestsPage from "./requests";
import SoqlQueryPage from "./query";
import { HeroUIProvider } from "@heroui/react";
import { ToastProvider } from "@heroui/toast";
import { createHashRouter, RouterProvider, Navigate } from "react-router";
import { Outlet } from "react-router";
import NavBar from "./components/nav-bar";
import "./index.css";

export default function IndexPage() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <NavBar />
      <main className="flex-grow overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <IndexPage />,
    children: [
      { index: true, element: <Navigate to="/record" replace /> },
      { path: "record", element: <RecordEditor /> },
      { path: "query", element: <SoqlQueryPage /> },
      { path: "requests", element: <RequestsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HeroUIProvider>
      <ToastProvider
        placement="top-center"
        toastProps={{
          timeout: 2000,
          shouldShowTimeoutProgress: true,
        }}
      />
      <RouterProvider router={router} />
    </HeroUIProvider>
  </StrictMode>,
);
