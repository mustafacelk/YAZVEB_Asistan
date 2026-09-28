import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Uygulama from "./uygulama";
import HataSiniri, { birKezYenile } from "./tasarim/HataSiniri";
import "./tasarim/jetonlar.css";
import "./tasarim/temel.css";
import "./tasarim/ekranlar.css";
import "./tasarim/odul.css";
import "./tasarim/notlar.css";
import "./tasarim/dunyalar.css";

// Yeni sürüm yayınlandıysa açık kalmış sekmenin istediği eski parça artık
// yoktur (HataSiniri.tsx). Vite bunu bu olayla bildirir: bir kez yenile.
window.addEventListener("vite:preloadError", (olay) => {
  if (birKezYenile()) olay.preventDefault();
});

createRoot(document.getElementById("kok")!).render(
  <StrictMode>
    <HataSiniri>
      <Uygulama />
    </HataSiniri>
  </StrictMode>,
);
