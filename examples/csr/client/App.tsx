import { APITester } from "./APITester";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";
import { TodoApp } from "./TodoApp";

export function App() {
  return (
    <div className="app">
      <div className="logo-container">
        <img src={logo} alt="Bun Logo" className="logo bun-logo" />
        <img src={reactLogo} alt="React Logo" className="logo react-logo" />
      </div>

      <h1>Bun + React + bunny</h1>
      <p>
        The React shell is bundled by Bun. Every API call below hits a controller in{" "}
        <code>examples/csr/controllers/</code>, validated and routed by <code>bunny</code>.
      </p>

      <TodoApp />

      <h2>Try any endpoint</h2>
      <APITester />
    </div>
  );
}

export default App;
