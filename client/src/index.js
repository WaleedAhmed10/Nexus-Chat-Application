import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import App from "./App";
import "./index.css";

if (process.env.REACT_APP_SERVER_URL) {
  axios.defaults.baseURL = process.env.REACT_APP_SERVER_URL;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<React.StrictMode><App /></React.StrictMode>);
