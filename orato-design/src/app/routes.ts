import { createBrowserRouter } from "react-router";
import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";
import { Library } from "./pages/Library";
import { Presentation } from "./pages/Presentation";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/auth",
    Component: Auth,
  },
  {
    path: "/library",
    Component: Library,
  },
  {
    path: "/presentation/:id",
    Component: Presentation,
  },
]);
