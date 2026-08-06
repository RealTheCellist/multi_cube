import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ModelLabApp from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ModelLabApp />
  </StrictMode>,
);
