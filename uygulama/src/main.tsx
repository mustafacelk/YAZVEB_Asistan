import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Uygulama from "./uygulama";
import "./tasarim/jetonlar.css";
import "./tasarim/temel.css";
import "./tasarim/ekranlar.css";
import "./tasarim/odul.css";

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <Uygulama />
  </StrictMode>,
);
