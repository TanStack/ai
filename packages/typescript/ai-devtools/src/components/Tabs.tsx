import { Component, createSignal, For } from "solid-js";

interface TabsProps {
  tabs: string[];
  activeTab: number;
  onTabChange: (index: number) => void;
}

export const Tabs: Component<TabsProps> = (props) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        padding: "8px 16px",
        "border-bottom": "1px solid #333",
        background: "#1e1e1e",
      }}
    >
      <For
        each={props.tabs}
        children={(tab, index) => (
          <button
            onClick={() => props.onTabChange(index())}
            style={{
              padding: "6px 12px",
              background: props.activeTab === index() ? "#2563eb" : "#2d2d2d",
              color: props.activeTab === index() ? "#ffffff" : "#a0a0a0",
              border: "none",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              "font-weight": props.activeTab === index() ? "500" : "400",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (props.activeTab !== index()) {
                e.currentTarget.style.background = "#3d3d3d";
              }
            }}
            onMouseLeave={(e) => {
              if (props.activeTab !== index()) {
                e.currentTarget.style.background = "#2d2d2d";
              }
            }}
          >
            {tab}
          </button>
        )}
      />
    </div>
  );
};
