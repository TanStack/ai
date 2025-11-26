import { createSignal, onCleanup, onMount } from "solid-js";
import { Header, HeaderLogo, MainPanel } from "@tanstack/devtools-ui";
import { useStyles } from "../styles/use-styles";
import { ConversationsList } from "./ConversationsList";
import { ConversationDetails } from "./ConversationDetails";
import { AIProvider, useAIStore } from "../store/ai-context";

export default function Devtools() {
  return (
    <AIProvider>
      <DevtoolsContent />
    </AIProvider>
  );
}

function DevtoolsContent() {
  const { state, clearAllConversations } = useAIStore();
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
          <div class={styles().shell.filterContainer}>
            <div class={styles().shell.filterButtonsRow}>
              <button
                class={`${styles().shell.filterButton} ${
                  filterType() === "all" ? styles().shell.filterButtonActive : ""
                }`}
                onClick={() => setFilterType("all")}
              >
                All
              </button>
              <button
                class={`${styles().shell.filterButton} ${
                  filterType() === "client" ? styles().shell.filterButtonActive : ""
                }`}
                onClick={() => setFilterType("client")}
              >
                Client
              </button>
              <button
                class={`${styles().shell.filterButton} ${
                  filterType() === "server" ? styles().shell.filterButtonActive : ""
                }`}
                onClick={() => setFilterType("server")}
              >
                Server
              </button>
            </div>
            <div class={styles().shell.actionsRow}>
              <button
                class={`${styles().actionButton} ${styles().shell.clearAllButton}`}
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
