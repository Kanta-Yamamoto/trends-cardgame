import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./cards/cards.css";
import "./cards/generic.css";
import "./cards/rare.css";
import "./cards/rare5.css";
import "./cards/stats.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root がありません");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
