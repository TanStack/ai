import { Component, For } from "solid-js";

interface ConfigItem {
  key: string;
  value: string | number | boolean;
  category: string;
}

const configs: ConfigItem[] = [
  { key: "Provider", value: "OpenAI", category: "Model" },
  { key: "Model", value: "gpt-4", category: "Model" },
  { key: "Temperature", value: 0.7, category: "Parameters" },
  { key: "Max Tokens", value: 2048, category: "Parameters" },
  { key: "Top P", value: 1.0, category: "Parameters" },
  { key: "Streaming", value: true, category: "Options" },
  { key: "Tools Enabled", value: true, category: "Options" },
];

export const ConfigPanel: Component = () => {
  const categories = Array.from(new Set(configs.map((c) => c.category)));

  return (
    <div style={{ padding: "16px", height: "100%", overflow: "auto" }}>
      <h2 style={{ margin: "0 0 16px 0", "font-size": "14px", "font-weight": "600" }}>Current Configuration</h2>

      <For
        each={categories}
        children={(category) => (
          <div style={{ "margin-bottom": "20px" }}>
            <h3
              style={{
                margin: "0 0 8px 0",
                "font-size": "12px",
                "font-weight": "600",
                color: "#9ca3af",
                "text-transform": "uppercase",
                "letter-spacing": "0.5px",
              }}
            >
              {category}
            </h3>
            <div
              style={{
                background: "#2d2d2d",
                "border-radius": "6px",
                overflow: "hidden",
              }}
            >
              <For
                each={configs.filter((c) => c.category === category)}
                children={(config, index) => (
                  <div
                    style={{
                      display: "flex",
                      "justify-content": "space-between",
                      padding: "10px 12px",
                      "border-bottom":
                        index() < configs.filter((c) => c.category === category).length - 1
                          ? "1px solid #1e1e1e"
                          : "none",
                    }}
                  >
                    <span style={{ "font-size": "13px", color: "#e5e5e5" }}>{config.key}</span>
                    <span
                      style={{
                        "font-size": "13px",
                        color: typeof config.value === "boolean" ? (config.value ? "#22c55e" : "#ef4444") : "#3b82f6",
                        "font-weight": "500",
                        "font-family": "monospace",
                      }}
                    >
                      {typeof config.value === "boolean" ? (config.value ? "✓ enabled" : "✗ disabled") : config.value}
                    </span>
                  </div>
                )}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
};
