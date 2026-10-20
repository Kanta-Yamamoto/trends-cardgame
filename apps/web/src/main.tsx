import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
// 書体はアプリに同梱する（Google Fonts に繋がらない環境・スマホアプリ・オフラインでも同じ見た目に）
import "@fontsource/m-plus-1/400.css";
import "@fontsource/m-plus-1/700.css";
import "@fontsource/m-plus-1/800.css";
import "@fontsource/m-plus-1/900.css";
import "@fontsource/lilita-one/400.css";
import "@fontsource/dela-gothic-one/400.css";
import "./cards/cards.css";
import "./cards/generic.css";
import "./cards/rare.css";
import "./cards/rare5.css";
import "./cards/stats.css";
import "./styles/app.css";
import { isStandalone, registerPwa } from "./pwa";
import { lockZoom } from "./viewport";

registerPwa();
// ホーム画面のアプリとして開いているときは、どの画面でも拡大縮小しない（アプリらしく）
if (isStandalone()) lockZoom();

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
