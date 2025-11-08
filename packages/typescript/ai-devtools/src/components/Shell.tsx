import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Header, HeaderLogo, MainPanel } from "@tanstack/devtools-ui";
import { useStyles } from "../styles/use-styles";
import { ConversationsList } from "./ConversationsList";
import { ConversationDetails } from "./ConversationDetails";
import { clearAllConversations, state } from "../store/ai-store";

export default function Devtools() {
  const styles = useStyles();
  const [leftPanelWidth, setLeftPanelWidth] = createSignal(300);
  const [isDragging, setIsDragging] = createSignal(false);
  const [filterType, setFilterType] = createSignal<"all" | "client" | "server">("all");

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

  const conversationCount = () => Object.keys(state.conversations).length;

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
          {/* Filter tabs and action buttons */}
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "8px",
              padding: "12px",
              "border-bottom": "1px solid var(--border-color)",
            }}
          >
            <div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap" }}>
              <button
                class={styles().actionButton}
                style={{
                  background: filterType() === "all" ? "#ec4899" : undefined,
                  color: filterType() === "all" ? "white" : undefined,
                  "border-color": filterType() === "all" ? "#ec4899" : undefined,
                  "font-size": "11px",
                }}
                onClick={() => setFilterType("all")}
              >
                All
              </button>
              <button
                class={styles().actionButton}
                style={{
                  background: filterType() === "client" ? "#ec4899" : undefined,
                  color: filterType() === "client" ? "white" : undefined,
                  "border-color": filterType() === "client" ? "#ec4899" : undefined,
                  "font-size": "11px",
                }}
                onClick={() => setFilterType("client")}
              >
                Client
              </button>
              <button
                class={styles().actionButton}
                style={{
                  background: filterType() === "server" ? "#ec4899" : undefined,
                  color: filterType() === "server" ? "white" : undefined,
                  "border-color": filterType() === "server" ? "#ec4899" : undefined,
                  "font-size": "11px",
                }}
                onClick={() => setFilterType("server")}
              >
                Server
              </button>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                class={styles().actionButton}
                style={{ flex: 1, "font-size": "11px" }}
                onClick={() => clearAllConversations()}
                disabled={conversationCount() === 0}
              >
                <div class={styles().actionDotRed} />
                Clear All ({conversationCount()})
              </button>
            </div>
          </div>

          <ConversationsList filterType={filterType()} />
        </div>

        <div class={`${styles().dragHandle} ${isDragging() ? "dragging" : ""}`} onMouseDown={handleMouseDown} />

        <div class={styles().rightPanel} style={{ flex: 1 }}>
          <ConversationDetails />
        </div>
      </div>
    </MainPanel>
  );
}
