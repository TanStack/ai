import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Header, HeaderLogo, MainPanel } from "@tanstack/devtools-ui";
import { useStyles } from "../styles/use-styles";
import { MessagesList } from "./MessagesList";
import { ChunksList } from "./ChunksList";
import { DebugDetails } from "./DebugDetails";

export default function Devtools() {
  const styles = useStyles();
  const [leftPanelWidth, setLeftPanelWidth] = createSignal(300);
  const [isDragging, setIsDragging] = createSignal(false);
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<"messages" | "chunks">("messages");

  let dragStartX = 0;
  let dragStartWidth = 0;

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    dragStartX = e.clientX;
    dragStartWidth = leftPanelWidth();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return;

    e.preventDefault();
    const deltaX = e.clientX - dragStartX;
    const newWidth = Math.max(150, Math.min(800, dragStartWidth + deltaX));
    setLeftPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  onMount(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  });

  return (
    <MainPanel>
      <Header>
        <HeaderLogo flavor={{ light: "#ec4899", dark: "#ec4899" }}>TanStack AI</HeaderLogo>
      </Header>

      <div class={styles().mainContainer}>
        <div
          class={styles().leftPanel}
          style={{
            width: `${leftPanelWidth()}px`,
            "min-width": "150px",
            "max-width": "800px",
          }}
        >
          {/* Tab selector */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "12px",
              "border-bottom": "1px solid var(--border-color)",
            }}
          >
            <button
              class={styles().actionButton}
              style={{
                background: activeTab() === "messages" ? "#ec4899" : undefined,
                color: activeTab() === "messages" ? "white" : undefined,
                "border-color": activeTab() === "messages" ? "#ec4899" : undefined,
              }}
              onClick={() => setActiveTab("messages")}
            >
              Messages
            </button>
            <button
              class={styles().actionButton}
              style={{
                background: activeTab() === "chunks" ? "#ec4899" : undefined,
                color: activeTab() === "chunks" ? "white" : undefined,
                "border-color": activeTab() === "chunks" ? "#ec4899" : undefined,
              }}
              onClick={() => setActiveTab("chunks")}
            >
              Raw Chunks
            </button>
          </div>

          {activeTab() === "messages" && <MessagesList selectedKey={selectedKey} setSelectedKey={setSelectedKey} />}
          {activeTab() === "chunks" && <ChunksList selectedKey={selectedKey} setSelectedKey={setSelectedKey} />}
        </div>

        <div class={`${styles().dragHandle} ${isDragging() ? "dragging" : ""}`} onMouseDown={handleMouseDown} />

        <div class={styles().rightPanel} style={{ flex: 1 }}>
          <Show
            when={selectedKey() != null}
            fallback={<div class={styles().noSelection}>Select a message or chunk to view details</div>}
          >
            <div class={styles().panelHeader}>Details</div>
            <DebugDetails selectedKey={selectedKey()!} />
          </Show>
        </div>
      </div>
    </MainPanel>
  );
}
