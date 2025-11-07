import { Component } from "solid-js";
import { useStyles } from "../styles/use-styles";

export const DebugDetails: Component<{ selectedKey: string }> = (props) => {
  const styles = useStyles();

  return (
    <div class={styles().stateDetails}>
      <div class={styles().stateHeader}>
        <div class={styles().stateTitle}>Chunk Details</div>
        <div class={styles().stateKey}>{props.selectedKey}</div>
      </div>

      <div class={styles().detailsGrid}>
        <div class={styles().detailSection}>
          <div class={styles().detailSectionHeader}>Metadata</div>
          <div class={styles().infoGrid}>
            <div class={styles().infoLabel}>Type:</div>
            <div class={styles().infoValueMono}>content</div>
            <div class={styles().infoLabel}>Role:</div>
            <div class={styles().infoValueMono}>assistant</div>
            <div class={styles().infoLabel}>Timestamp:</div>
            <div class={styles().infoValueMono}>{new Date().toISOString()}</div>
          </div>
        </div>

        <div class={styles().detailSection}>
          <div class={styles().detailSectionHeader}>Raw Data</div>
          <div class={styles().stateContent}>
            <pre style={{ margin: 0, "font-size": "11px", overflow: "auto" }}>
              {JSON.stringify(
                {
                  type: "content",
                  role: "assistant",
                  content: "Sample content...",
                  metadata: { tokens: 42 },
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        <div class={styles().detailSection}>
          <div class={styles().detailSectionHeader}>Actions</div>
          <div class={styles().actionsRow}>
            <button class={styles().actionButton}>
              <div class={styles().actionDotBlue} />
              Copy JSON
            </button>
            <button class={styles().actionButton}>
              <div class={styles().actionDotGreen} />
              View in Console
            </button>
            <button class={styles().actionButton}>
              <div class={styles().actionDotYellow} />
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
