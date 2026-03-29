import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "概览" },
  { to: "/sessions", label: "对话历史" },
  { to: "/tool-logs", label: "工具日志" },
  { to: "/logs", label: "日志查看" },
  { to: "/tasks", label: "定时任务" },
  { to: "/memories", label: "记忆管理" },
  { to: "/config", label: "配置管理" },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="sidebar-header">Winches Agent</div>
      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}
