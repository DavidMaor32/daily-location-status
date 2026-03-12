// Frontend bootstrap module that mounts the React app into the browser DOM.
// Responsibility: initialize the client runtime and render the root App component.

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
