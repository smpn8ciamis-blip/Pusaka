import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AcademicYearProvider } from "./contexts/AcademicYearContext";
import { initPwa } from "./lib/webPush";
import { initChunkReload } from "./lib/chunkReload";

initChunkReload();
initPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <AcademicYearProvider>
          <App />
        </AcademicYearProvider>
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>
);

