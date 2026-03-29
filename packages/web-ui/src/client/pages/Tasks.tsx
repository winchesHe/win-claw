import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api.js";

interface Task {
  id: string;
  triggerAt: string;
  payload: string;
  status: "pending" | "completed" | "cancelled";
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<Task[]>("/tasks")
      .then((data) => setTasks(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCancel = (id: string) => {
    setCancelling((prev) => new Set(prev).add(id));
    apiFetch(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    })
      .then(() => fetchTasks())
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setCancelling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  return (
    <div className="tasks-page">
      {loading && <div className="tasks-status">加载中…</div>}
      {error && <div className="tasks-status tasks-error">加载失败：{error}</div>}

      {!loading && !error && tasks.length === 0 && <div className="tasks-status">暂无定时任务</div>}

      {!loading && !error && tasks.length > 0 && (
        <table className="tasks-table">
          <thead>
            <tr>
              <th>任务 ID</th>
              <th>触发时间</th>
              <th>任务内容</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td className="tasks-id">{task.id}</td>
                <td className="tasks-time">{new Date(task.triggerAt).toLocaleString()}</td>
                <td className="tasks-payload">{task.payload}</td>
                <td>
                  <span className={`tasks-status-badge tasks-status-${task.status}`}>
                    {task.status === "pending"
                      ? "待执行"
                      : task.status === "completed"
                        ? "已完成"
                        : "已取消"}
                  </span>
                </td>
                <td>
                  {task.status === "pending" && (
                    <button
                      className="tasks-cancel-btn"
                      disabled={cancelling.has(task.id)}
                      onClick={() => handleCancel(task.id)}
                    >
                      {cancelling.has(task.id) ? "取消中…" : "取消"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
