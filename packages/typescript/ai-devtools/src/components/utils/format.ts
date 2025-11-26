import type { Chunk } from "../../store/ai-store";

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString() + "." + date.getMilliseconds().toString().padStart(3, "0");
};

export const formatDuration = (ms?: number): string => {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const getChunkTypeColor = (type: Chunk["type"]): string => {
  switch (type) {
    case "content":
      return "#10b981"; // green
    case "tool_call":
      return "#8b5cf6"; // purple
    case "tool_result":
      return "#3b82f6"; // blue
    case "done":
      return "#6b7280"; // gray
    case "error":
      return "#ef4444"; // red
    case "approval":
      return "#f59e0b"; // orange/amber
    default:
      return "#6b7280"; // gray
  }
};

export const getStatusColor = (status: "active" | "completed" | "error"): string => {
  switch (status) {
    case "active":
      return "oklch(0.7 0.17 142)"; // green
    case "completed":
      return "oklch(0.65 0.1 260)"; // blue
    case "error":
      return "oklch(0.65 0.2 25)"; // red
    default:
      return "oklch(0.6 0.05 200)";
  }
};

export const getTypeColor = (type: "client" | "server"): string => {
  switch (type) {
    case "client":
      return "oklch(0.68 0.16 330)"; // pink
    case "server":
      return "oklch(0.68 0.15 280)"; // purple
    default:
      return "oklch(0.6 0.05 200)";
  }
};
