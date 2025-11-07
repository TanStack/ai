import { Component, For } from "solid-js";

interface Stat {
  label: string;
  value: string | number;
  trend?: "up" | "down";
  color?: string;
}

const stats: Stat[] = [
  { label: "Total Requests", value: "24", trend: "up", color: "#3b82f6" },
  { label: "Total Tokens", value: "12,458", trend: "up", color: "#22c55e" },
  { label: "Avg Response Time", value: "1.2s", color: "#a855f7" },
  { label: "Cache Hits", value: "18", trend: "up", color: "#f59e0b" },
];

export const StatsPanel: Component = () => {
  return (
    <div style={{ padding: "16px", height: "100%", overflow: "auto" }}>
      <h2 style={{ margin: "0 0 16px 0", "font-size": "14px", "font-weight": "600" }}>Usage Statistics</h2>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          "margin-bottom": "24px",
        }}
      >
        <For
          each={stats}
          children={(stat) => (
            <div
              style={{
                padding: "16px",
                background: "#2d2d2d",
                "border-radius": "6px",
                border: `1px solid ${stat.color || "#444"}`,
              }}
            >
              <div style={{ "font-size": "11px", color: "#9ca3af", "margin-bottom": "8px" }}>{stat.label}</div>
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    "font-size": "24px",
                    "font-weight": "700",
                    color: stat.color || "#ffffff",
                  }}
                >
                  {stat.value}
                </span>
                {stat.trend && (
                  <span
                    style={{
                      "font-size": "16px",
                      color: stat.trend === "up" ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {stat.trend === "up" ? "↗" : "↘"}
                  </span>
                )}
              </div>
            </div>
          )}
        />
      </div>

      <h3 style={{ margin: "0 0 12px 0", "font-size": "13px", "font-weight": "600" }}>Token Breakdown</h3>
      <div
        style={{
          padding: "12px",
          background: "#2d2d2d",
          "border-radius": "6px",
        }}
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <div style={{ display: "flex", "justify-content": "space-between", "font-size": "12px" }}>
            <span style={{ color: "#9ca3af" }}>Prompt Tokens</span>
            <span style={{ color: "#3b82f6", "font-weight": "500" }}>8,234</span>
          </div>
          <div style={{ display: "flex", "justify-content": "space-between", "font-size": "12px" }}>
            <span style={{ color: "#9ca3af" }}>Completion Tokens</span>
            <span style={{ color: "#22c55e", "font-weight": "500" }}>4,224</span>
          </div>
          <div
            style={{
              height: "1px",
              background: "#444",
              margin: "4px 0",
            }}
          />
          <div style={{ display: "flex", "justify-content": "space-between", "font-size": "12px" }}>
            <span style={{ color: "#ffffff", "font-weight": "500" }}>Total</span>
            <span style={{ color: "#ffffff", "font-weight": "600" }}>12,458</span>
          </div>
        </div>
      </div>
    </div>
  );
};
