import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./design-system/tokens.css";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);



// Capacitor native setup. Keep the PWA service worker disabled inside the
// native WebView because it can interfere with native bridge/plugin injection.
import("@capacitor/core").then(async ({ Capacitor }) => {
  if (Capacitor.isNativePlatform()) {
    const { configureNativeRuntime } = await import("./platform/nativeRuntime.js");
    await configureNativeRuntime();
    return;
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(error => {
        console.error("CSV Analytics Studio offline support could not be registered:", error);
      });
    });
  }
}).catch(error => {
  console.error("Platform initialization failed:", error);
});
