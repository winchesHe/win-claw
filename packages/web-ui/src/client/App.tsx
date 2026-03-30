import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.js";
import Dashboard from "./pages/Dashboard.js";
import Sessions from "./pages/Sessions.js";
import ToolLogs from "./pages/ToolLogs.js";
import Logs from "./pages/Logs.js";
import Tasks from "./pages/Tasks.js";
import Memories from "./pages/Memories.js";
import Config from "./pages/Config.js";
import Skills from "./pages/Skills.js";
import Mcp from "./pages/Mcp.js";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/tool-logs" element={<ToolLogs />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/memories" element={<Memories />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/mcp" element={<Mcp />} />
          <Route path="/config" element={<Config />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
