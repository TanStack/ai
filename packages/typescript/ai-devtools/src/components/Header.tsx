import { Component } from "solid-js";

export const Header: Component = () => {
  return (
    <div
      style={{
        padding: "12px 16px",
        "border-bottom": "1px solid #333",
        background: "#1a1a1a",
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
      }}
    >
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <span style={{ "font-size": "20px" }}>🤖</span>
        <h1 style={{ margin: "0", "font-size": "16px", "font-weight": "600" }}>TanStack AI Devtools</h1>
      </div>
      <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
        <span
          style={{
            "font-size": "11px",
            color: "#22c55e",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              background: "#22c55e",
              "border-radius": "50%",
              display: "inline-block",
            }}
          />
          Connected
        </span>
      </div>
    </div>
  );
};
