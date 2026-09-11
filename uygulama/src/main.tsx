import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Uygulama from "./uygulama";
import "./stil.css";

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <Uygulama />
  </StrictMode>,
);
