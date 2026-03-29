import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.js";

const pageTitles: Record<string, string> = {
  "/": "概览",
  "/sessions": "对话历史",
  "/tool-logs": "工具日志",
  "/logs": "日志查看",
  "/tasks": "定时任务",
  "/memories": "记忆管理",
  "/config": "配置管理",
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "Winches Agent";

  return (
    <div className="layout">
      <div
        className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>
      <div className="main-content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen((v) => !v)} aria-label="菜单">
            ☰
          </button>
          <span className="topbar-title">{title}</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
