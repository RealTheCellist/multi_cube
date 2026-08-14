import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TetraLabApp from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TetraLabApp />
  </StrictMode>,
);
