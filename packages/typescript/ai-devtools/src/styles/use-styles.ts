import * as goober from 'goober'
import { createEffect, createSignal } from 'solid-js'
import { useTheme } from '@tanstack/devtools-ui'
import { tokens } from './tokens'

const stylesFactory = (theme: 'light' | 'dark') => {
  const { colors, font, size, alpha, border } = tokens
  const { fontFamily, size: fontSize } = font
  const css = goober.css
  const t = (light: string, dark: string) => (theme === 'light' ? light : dark)

  return {
    mainContainer: css`
      display: flex;
      flex: 1;
      min-height: 80%;
      overflow: hidden;
      padding: ${size[2]};
    `,
    dragHandle: css`
      width: 8px;
      background: ${t(colors.gray[300], colors.darkGray[600])};
      cursor: col-resize;
      position: relative;
      transition: all 0.2s ease;
      user-select: none;
      pointer-events: all;
      margin: 0 ${size[1]};
      border-radius: 2px;

      &:hover {
        background: ${t(colors.blue[600], colors.blue[500])};
        margin: 0 ${size[1]};
      }

      &.dragging {
        background: ${t(colors.blue[700], colors.blue[600])};
        margin: 0 ${size[1]};
      }

      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 2px;
        height: 20px;
        background: ${t(colors.gray[400], colors.darkGray[400])};
        border-radius: 1px;
        pointer-events: none;
      }

      &:hover::after,
      &.dragging::after {
        background: ${t(colors.blue[500], colors.blue[300])};
      }
    `,
    leftPanel: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      flex-shrink: 0;
    `,
    rightPanel: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      flex: 1;
    `,
    panelHeader: css`
      font-size: ${fontSize.md};
      font-weight: ${font.weight.bold};
      color: ${t(colors.blue[700], colors.blue[400])};
      padding: ${size[2]};
      border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      background: ${t(colors.gray[100], colors.darkGray[800])};
      flex-shrink: 0;
    `,
    utilList: css`
      flex: 1;
      overflow-y: auto;
      padding: ${size[1]};
      min-height: 0;
    `,
    utilGroup: css`
      margin-bottom: ${size[2]};
    `,
    utilGroupHeader: css`
      font-size: ${fontSize.xs};
      font-weight: ${font.weight.semibold};
      color: ${t(colors.gray[600], colors.gray[400])};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: ${size[1]};
      padding: ${size[1]} ${size[2]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
    `,
    utilRow: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${size[2]};
      margin-bottom: ${size[1]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;

      &:hover {
        background: ${t(colors.gray[300], colors.darkGray[600])};
        border-color: ${t(colors.gray[400], colors.darkGray[500])};
      }
    `,
    utilRowSelected: css`
      background: ${t(colors.blue[100], colors.blue[900] + alpha[20])};
      border-color: ${t(colors.blue[600], colors.blue[500])};
      box-shadow: 0 0 0 1px
        ${t(colors.blue[600] + alpha[30], colors.blue[500] + alpha[30])};
    `,
    utilKey: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[900], colors.gray[100])};
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    utilStatus: css`
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[600], colors.gray[400])};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: ${size[1]} ${size[1]};
      background: ${t(colors.gray[300], colors.darkGray[600])};
      border-radius: ${border.radius.sm};
      margin-left: ${size[1]};
    `,
    stateDetails: css`
      flex: 1;
      overflow-y: auto;
      padding: ${size[2]};
      min-height: 0;
    `,
    stateHeader: css`
      margin-bottom: ${size[2]};
      padding-bottom: ${size[2]};
      border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
    `,
    stateTitle: css`
      font-size: ${fontSize.md};
      font-weight: ${font.weight.bold};
      color: ${t(colors.blue[700], colors.blue[400])};
      margin-bottom: ${size[1]};
    `,
    stateKey: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[600], colors.gray[400])};
      word-break: break-all;
    `,
    stateContent: css`
      background: ${t(colors.gray[100], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      padding: ${size[2]};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
    `,
    detailsGrid: css`
      display: grid;
      grid-template-columns: 1fr;
      gap: ${size[2]};
      align-items: start;
    `,
    detailSection: css`
      background: ${t(colors.white, colors.darkGray[700])};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
      border-radius: ${border.radius.md};
      padding: ${size[2]};
    `,
    detailSectionHeader: css`
      font-size: ${fontSize.sm};
      font-weight: ${font.weight.bold};
      color: ${t(colors.gray[800], colors.gray[200])};
      margin-bottom: ${size[1]};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    `,
    actionsRow: css`
      display: flex;
      flex-wrap: wrap;
      gap: ${size[2]};
    `,
    actionButton: css`
      display: inline-flex;
      align-items: center;
      gap: ${size[1]};
      padding: ${size[1]} ${size[2]};
      border-radius: ${border.radius.md};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[500])};
      background: ${t(colors.gray[200], colors.darkGray[600])};
      color: ${t(colors.gray[900], colors.gray[100])};
      font-size: ${fontSize.xs};
      cursor: pointer;
      user-select: none;
      transition:
        background 0.15s,
        border-color 0.15s;
      &:hover {
        background: ${t(colors.gray[300], colors.darkGray[500])};
        border-color: ${t(colors.gray[400], colors.darkGray[400])};
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        &:hover {
          background: ${t(colors.gray[200], colors.darkGray[600])};
          border-color: ${t(colors.gray[300], colors.darkGray[500])};
        }
      }
    `,
    actionDotBlue: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.blue[400]};
    `,
    actionDotGreen: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.green[400]};
    `,
    actionDotRed: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.red[400]};
    `,
    actionDotYellow: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.yellow[400]};
    `,
    actionDotOrange: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.pink[400]};
    `,
    actionDotPurple: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.purple[400]};
    `,
    infoGrid: css`
      display: grid;
      grid-template-columns: auto 1fr;
      gap: ${size[1]};
      row-gap: ${size[1]};
      align-items: center;
    `,
    infoLabel: css`
      color: ${t(colors.gray[600], colors.gray[400])};
      font-size: ${fontSize.xs};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    `,
    infoValueMono: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[900], colors.gray[100])};
      word-break: break-all;
    `,
    noSelection: css`
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${t(colors.gray[500], colors.gray[500])};
      font-style: italic;
      text-align: center;
      padding: ${size[4]};
    `,
    // Keep existing styles for backward compatibility
    sectionContainer: css`
      display: flex;
      flex-wrap: wrap;
      gap: ${size[4]};
    `,
    section: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      box-shadow: ${tokens.shadow.md(
      t(colors.gray[400] + alpha[80], colors.black + alpha[80]),
    )};
      padding: ${size[4]};
      margin-bottom: ${size[4]};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      min-width: 0;
      max-width: 33%;
      max-height: fit-content;
    `,
    sectionHeader: css`
      font-size: ${fontSize.lg};
      font-weight: ${font.weight.bold};
      margin-bottom: ${size[2]};
      color: ${t(colors.blue[600], colors.blue[400])};
      letter-spacing: 0.01em;
      display: flex;
      align-items: center;
      gap: ${size[2]};
    `,
    sectionEmpty: css`
      color: ${t(colors.gray[500], colors.gray[500])};
      font-size: ${fontSize.sm};
      font-style: italic;
      margin: ${size[2]} 0;
    `,
    instanceList: css`
      display: flex;
      flex-direction: column;
      gap: ${size[2]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
    `,
    instanceCard: css`
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      padding: ${size[3]};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
      font-size: ${fontSize.sm};
      color: ${t(colors.gray[900], colors.gray[100])};
      font-family: ${fontFamily.mono};
      overflow-x: auto;
      transition:
        box-shadow 0.3s,
        background 0.3s;
    `,
    // Shell component styles
    shell: {
      filterContainer: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
        padding: ${size[3]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      `,
      filterButtonsRow: css`
        display: flex;
        gap: ${size[1.5]};
        flex-wrap: wrap;
      `,
      filterButton: css`
        display: inline-flex;
        align-items: center;
        gap: ${size[1]};
        padding: ${size[1]} ${size[2]};
        border-radius: ${border.radius.md};
        border: 1px solid ${t(colors.gray[300], colors.darkGray[500])};
        background: ${t(colors.gray[200], colors.darkGray[600])};
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.xs};
        cursor: pointer;
        user-select: none;
        transition:
          background 0.15s,
          border-color 0.15s;
        &:hover {
          background: ${t(colors.gray[300], colors.darkGray[500])};
          border-color: ${t(colors.gray[400], colors.darkGray[400])};
        }
      `,
      filterButtonActive: css`
        background: ${colors.pink[400]};
        color: ${colors.white};
        border-color: ${colors.pink[400]};
        &:hover {
          background: ${colors.pink[500]};
          border-color: ${colors.pink[500]};
        }
      `,
      actionsRow: css`
        display: flex;
        gap: ${size[1.5]};
      `,
      clearAllButton: css`
        flex: 1;
        font-size: ${fontSize.xs};
      `,
    },
    // ConversationsList component styles
    conversationsList: {
      rowContent: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        flex: 1;
      `,
      rowInfo: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
      `,
      typeDot: css`
        width: 8px;
        height: 8px;
        border-radius: 50%;
      `,
      label: css`
        font-weight: ${font.weight.semibold};
      `,
      toolCallsBadge: css`
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        border-radius: ${border.radius.sm};
        background: oklch(0.35 0.1 280);
        color: oklch(0.8 0.12 280);
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
      `,
      statusDot: css`
        width: 6px;
        height: 6px;
        border-radius: 50%;
        margin-left: auto;
      `,
      stats: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        font-size: 0.85em;
        opacity: 0.7;
      `,
      statItem: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
      `,
      tokensBadge: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
        padding: 2px 6px;
        border-radius: ${border.radius.sm};
        background: oklch(0.35 0.08 220);
        color: oklch(0.75 0.12 220);
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
      `,
      loadingIndicator: css`
        font-size: 0.85em;
        margin-left: ${size[2]};
        color: oklch(0.7 0.17 142);
      `,
    },
    // ConversationDetails component styles
    conversationDetails: {
      emptyState: css`
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: ${fontSize.sm};
      `,
      container: css`
        display: flex;
        flex-direction: column;
        height: 100%;
      `,
      headerContent: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      headerRow: css`
        display: flex;
        align-items: center;
        gap: ${size[3]};
      `,
      headerLabel: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
      `,
      statusBadge: css`
        font-size: ${fontSize.xs};
        padding: 2px ${size[2]};
        border-radius: ${border.radius.sm};
      `,
      statusActive: css`
        background: ${colors.blue[500]}20;
        color: ${colors.blue[500]};
      `,
      statusCompleted: css`
        background: ${colors.green[500]}20;
        color: ${colors.green[500]};
      `,
      statusError: css`
        background: ${colors.red[500]}20;
        color: ${colors.red[500]};
      `,
      metaInfo: css`
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[600], colors.gray[400])};
      `,
      usageInfo: css`
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[600], colors.gray[400])};
        display: flex;
        align-items: center;
        gap: ${size[2]};
      `,
      usageLabel: css`
        font-weight: ${font.weight.semibold};
        color: ${colors.blue[500]};
      `,
      usageBold: css`
        font-weight: ${font.weight.semibold};
      `,
      toggleButton: css`
        background: transparent;
        border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
        color: ${t(colors.gray[600], colors.gray[400])};
        padding: ${size[1]} ${size[2]};
        border-radius: ${border.radius.sm};
        font-size: ${fontSize.xs};
        cursor: pointer;
        transition: all 0.15s ease;
        margin-top: ${size[2]};
        &:hover {
          background: ${t(colors.gray[100], colors.darkGray[700])};
          color: ${t(colors.gray[700], colors.gray[300])};
        }
      `,
      extendedInfo: css`
        margin-top: ${size[3]};
        padding: ${size[3]};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        border-radius: ${border.radius.md};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      `,
      infoSection: css`
        margin-bottom: ${size[3]};
        &:last-child {
          margin-bottom: 0;
        }
      `,
      infoLabel: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[700], colors.gray[300])};
        display: block;
        margin-bottom: ${size[1]};
      `,
      toolsList: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${size[1]};
      `,
      toolBadge: css`
        display: inline-flex;
        align-items: center;
        padding: 2px ${size[2]};
        background: ${colors.purple[500]}20;
        color: ${colors.purple[400]};
        border-radius: ${border.radius.sm};
        font-size: ${fontSize.xs};
        font-family: ${fontFamily.mono};
      `,
      jsonPreview: css`
        margin: 0;
        padding: ${size[2]};
        background: ${t(colors.gray[100], colors.darkGray[900])};
        border-radius: ${border.radius.sm};
        font-size: ${fontSize.xs};
        font-family: ${fontFamily.mono};
        overflow-x: auto;
        max-height: 200px;
        overflow-y: auto;
        color: ${t(colors.gray[700], colors.gray[300])};
        white-space: pre-wrap;
        word-break: break-word;
      `,
      tabsContainer: css`
        display: flex;
        gap: ${size[2]};
        padding: ${size[3]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      `,
      tabButtonActive: css`
        background: ${colors.pink[400]};
        color: ${colors.white};
        border-color: ${colors.pink[400]};
      `,
      contentArea: css`
        flex: 1;
        overflow: auto;
        padding: ${size[3]};
      `,
      emptyMessages: css`
        padding: ${size[6]};
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: ${fontSize.sm};
        text-align: center;
      `,
      messagesList: css`
        display: flex;
        flex-direction: column;
        gap: ${size[3]};
      `,
      messageCard: css`
        padding: ${size[4]};
        border-radius: ${border.radius.lg};
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      `,
      messageCardUser: css`
        background: linear-gradient(135deg, oklch(0.25 0.04 260) 0%, oklch(0.22 0.03 260) 100%);
        border: 1.5px solid oklch(0.5 0.15 260);
      `,
      messageCardAssistant: css`
        background: linear-gradient(135deg, oklch(0.25 0.04 142) 0%, oklch(0.22 0.03 142) 100%);
        border: 1.5px solid oklch(0.5 0.15 142);
      `,
      messageHeader: css`
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: ${size[3]};
      `,
      avatarUser: css`
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: oklch(0.5 0.2 260);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: ${font.weight.bold};
        font-size: ${fontSize.sm};
        color: ${colors.white};
        flex-shrink: 0;
      `,
      avatarAssistant: css`
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: oklch(0.5 0.2 142);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: ${font.weight.bold};
        font-size: ${fontSize.sm};
        color: ${colors.white};
        flex-shrink: 0;
      `,
      roleLabel: css`
        flex: 1;
      `,
      roleLabelUser: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.7 0.15 260);
        text-transform: capitalize;
      `,
      roleLabelAssistant: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.7 0.15 142);
        text-transform: capitalize;
      `,
      timestamp: css`
        font-size: 10px;
        color: oklch(0.6 0.05 260);
        font-family: ${fontFamily.mono};
      `,
      messageUsage: css`
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-family: ${fontFamily.mono};
        color: oklch(0.65 0.12 142);
        margin-left: auto;
        padding: 2px 6px;
        background: oklch(0.2 0.03 142);
        border-radius: 4px;
      `,
      messageUsageIcon: css`
        font-size: 10px;
      `,
      thinkingDetails: css`
        margin-bottom: ${size[2]};
        border: 1px solid oklch(0.35 0.1 280);
        border-radius: 6px;
        background: oklch(0.18 0.02 280);
        overflow: hidden;
      `,
      thinkingSummary: css`
        padding: ${size[2]};
        cursor: pointer;
        font-size: ${fontSize.sm};
        color: oklch(0.75 0.1 280);
        font-weight: ${font.weight.semibold};
        &:hover {
          background: oklch(0.22 0.03 280);
        }
      `,
      thinkingContent: css`
        padding: ${size[2]};
        font-size: ${fontSize.xs};
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        color: oklch(0.7 0.05 280);
        font-family: ${fontFamily.mono};
        border-top: 1px solid oklch(0.3 0.05 280);
        max-height: 300px;
        overflow-y: auto;
      `,
      messageContent: css`
        font-size: ${fontSize.sm};
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        color: oklch(0.85 0.02 260);
        font-family: system-ui, -apple-system, sans-serif;
      `,
      toolCallsContainer: css`
        margin-top: ${size[2]};
        display: flex;
        flex-direction: column;
        gap: 6px;
      `,
      toolCall: css`
        padding: ${size[2]};
        border-radius: 6px;
        font-size: ${fontSize.xs};
      `,
      toolCallNormal: css`
        background: oklch(0.22 0.02 260);
        border: 1px solid oklch(0.3 0.05 280);
      `,
      toolCallApproval: css`
        background: oklch(0.22 0.08 60);
        border: 1px solid oklch(0.4 0.12 60);
      `,
      toolCallHeader: css`
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: ${size[1]};
      `,
      toolCallName: css`
        font-weight: ${font.weight.semibold};
      `,
      toolCallNameNormal: css`
        color: oklch(0.75 0.15 280);
      `,
      toolCallNameApproval: css`
        color: oklch(0.75 0.15 60);
      `,
      toolStateBadge: css`
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
      `,
      toolStateBadgeNormal: css`
        background: oklch(0.35 0.1 280);
        color: oklch(0.8 0.1 280);
      `,
      toolStateBadgeApproval: css`
        background: oklch(0.35 0.12 60);
        color: oklch(0.85 0.1 60);
      `,
      approvalRequiredBadge: css`
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        background: oklch(0.45 0.15 30);
        color: oklch(0.95 0.05 60);
        font-weight: ${font.weight.semibold};
      `,
      toolArguments: css`
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        color: oklch(0.7 0.05 260);
        white-space: pre-wrap;
        word-break: break-all;
      `,
      toolSection: css`
        margin-top: ${size[2]};
        border-top: 1px solid oklch(0.28 0.03 260);
        padding-top: ${size[2]};
      `,
      toolSectionLabel: css`
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        color: oklch(0.6 0.08 260);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: ${size[1]};
      `,
      toolJsonContainer: css`
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        color: oklch(0.8 0.05 260);
        background: oklch(0.18 0.02 260);
        border-radius: 4px;
        padding: ${size[2]};
        overflow-x: auto;
        max-height: 300px;
        overflow-y: auto;
      `,
      chunksDetails: css`
        margin-top: ${size[3]};
      `,
      chunksSummary: css`
        cursor: pointer;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        color: oklch(0.65 0.08 260);
        padding: ${size[2]};
        background: oklch(0.2 0.02 260);
        border-radius: 6px;
        border: 1px solid oklch(0.28 0.03 260);
        user-select: none;
      `,
      chunksSummaryContent: css`
        display: flex;
        flex-direction: column;
        gap: 6px;
      `,
      chunksSummaryHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
      `,
      chunkBadge: css`
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 9px;
      `,
      chunkBadgeTool: css`
        background: oklch(0.3 0.1 280);
        color: oklch(0.75 0.12 280);
      `,
      chunkBadgeError: css`
        background: oklch(0.3 0.15 25);
        color: oklch(0.75 0.2 25);
      `,
      chunkBadgeSuccess: css`
        background: oklch(0.3 0.1 142);
        color: oklch(0.75 0.15 142);
      `,
      chunkBadgeApproval: css`
        background: oklch(0.3 0.15 50);
        color: oklch(0.75 0.2 50);
      `,
      chunkBadgeCount: css`
        background: oklch(0.3 0.08 260);
        color: oklch(0.75 0.1 260);
        font-weight: ${font.weight.semibold};
      `,
      contentPreview: css`
        font-family: ${fontFamily.mono};
        font-size: 10px;
        color: oklch(0.75 0.05 260);
        white-space: pre-wrap;
        word-break: break-word;
        max-width: 100%;
        font-weight: ${font.weight.normal};
        margin-top: 2px;
      `,
      chunksContainer: css`
        margin-top: ${size[2]};
        padding: ${size[2]};
        background: oklch(0.18 0.02 260);
        border-radius: 6px;
        border: 1px solid oklch(0.25 0.03 260);
      `,
      chunksList: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      chunkItem: css`
        padding: 6px ${size[2]};
        border-radius: ${border.radius.sm};
        background: oklch(0.22 0.02 260);
        border: 1px solid oklch(0.28 0.03 260);
        font-size: 10px;
      `,
      chunkItemLarge: css`
        padding: ${size[2]} 10px;
        border-radius: 6px;
        background: oklch(0.22 0.02 260);
        border: 1px solid oklch(0.28 0.03 260);
        font-size: ${fontSize.xs};
      `,
      chunkHeader: css`
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: ${size[1]};
      `,
      chunkHeaderLarge: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        margin-bottom: 6px;
      `,
      chunkNumber: css`
        font-size: 9px;
        font-weight: ${font.weight.semibold};
        color: oklch(0.6 0.05 260);
        min-width: 24px;
      `,
      chunkNumberLarge: css`
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        color: oklch(0.6 0.05 260);
        min-width: 32px;
      `,
      chunkTypeBadge: css`
        display: flex;
        align-items: center;
        gap: 3px;
      `,
      chunkTypeBadgeLarge: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
      `,
      chunkTypeDot: css`
        width: 5px;
        height: 5px;
        border-radius: 50%;
      `,
      chunkTypeDotLarge: css`
        width: 6px;
        height: 6px;
        border-radius: 50%;
      `,
      chunkTypeLabel: css`
        font-weight: ${font.weight.semibold};
        color: oklch(0.7 0.08 260);
      `,
      chunkTypeLabelLarge: css`
        font-weight: ${font.weight.semibold};
        color: oklch(0.75 0.08 260);
      `,
      chunkToolBadge: css`
        padding: 1px ${size[1]};
        border-radius: 3px;
        background: oklch(0.3 0.1 280);
        color: oklch(0.75 0.12 280);
        font-size: 9px;
        font-weight: ${font.weight.semibold};
      `,
      chunkToolBadgeLarge: css`
        padding: 2px 6px;
        border-radius: 3px;
        background: oklch(0.3 0.1 280);
        color: oklch(0.75 0.12 280);
        font-size: 10px;
        font-weight: ${font.weight.semibold};
      `,
      chunkTimestamp: css`
        margin-left: auto;
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: 9px;
      `,
      chunkTimestampLarge: css`
        margin-left: auto;
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: 10px;
      `,
      rawJsonButton: css`
        padding: 1px ${size[1]};
        border-radius: 2px;
        border: 1px solid oklch(0.32 0.05 260);
        color: oklch(0.7 0.08 260);
        font-size: 8px;
        cursor: pointer;
        font-family: ${fontFamily.mono};
        font-weight: ${font.weight.semibold};
      `,
      rawJsonButtonInactive: css`
        background: oklch(0.28 0.03 260);
      `,
      rawJsonButtonActive: css`
        background: oklch(0.35 0.1 260);
      `,
      rawJsonButtonLarge: css`
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid oklch(0.32 0.05 260);
        color: oklch(0.7 0.08 260);
        font-size: 10px;
        cursor: pointer;
        font-family: ${fontFamily.mono};
        font-weight: ${font.weight.semibold};
      `,
      chunkContent: css`
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        padding: ${size[1]} 6px;
        background: oklch(0.2 0.01 260);
        border-radius: 3px;
        color: oklch(0.8 0.05 260);
        font-size: 10px;
      `,
      chunkContentLarge: css`
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        padding: 6px ${size[2]};
        background: oklch(0.2 0.01 260);
        border-radius: ${border.radius.sm};
        color: oklch(0.8 0.05 260);
        font-size: ${fontSize.xs};
      `,
      chunkError: css`
        color: oklch(0.65 0.2 25);
        font-family: ${fontFamily.mono};
        padding: ${size[1]} 6px;
        background: oklch(0.2 0.05 25);
        border-radius: 3px;
      `,
      chunkErrorLarge: css`
        color: oklch(0.65 0.2 25);
        font-family: ${fontFamily.mono};
        padding: 6px ${size[2]};
        background: oklch(0.2 0.05 25);
        border-radius: ${border.radius.sm};
      `,
      chunkFinish: css`
        color: oklch(0.7 0.12 142);
        padding: ${size[1]} 6px;
        background: oklch(0.2 0.03 142);
        border-radius: 3px;
        font-weight: ${font.weight.semibold};
      `,
      chunkFinishLarge: css`
        color: oklch(0.7 0.12 142);
        padding: 6px ${size[2]};
        background: oklch(0.2 0.03 142);
        border-radius: ${border.radius.sm};
        font-weight: ${font.weight.semibold};
      `,
      chunkApproval: css`
        padding: 6px ${size[2]};
        background: oklch(0.25 0.12 50);
        border-radius: ${border.radius.sm};
        border: 1px solid oklch(0.35 0.15 50);
      `,
      chunkApprovalLarge: css`
        padding: ${size[2]};
        background: oklch(0.25 0.12 50);
        border-radius: 6px;
        border: 1px solid oklch(0.35 0.15 50);
      `,
      chunkApprovalTitle: css`
        color: oklch(0.75 0.15 50);
        font-weight: ${font.weight.semibold};
        margin-bottom: ${size[1]};
        font-size: 10px;
      `,
      chunkApprovalTitleLarge: css`
        color: oklch(0.75 0.15 50);
        font-weight: ${font.weight.semibold};
        margin-bottom: 6px;
        font-size: ${fontSize.xs};
      `,
      chunkApprovalInput: css`
        font-family: ${fontFamily.mono};
        font-size: 9px;
        color: oklch(0.7 0.08 50);
        white-space: pre-wrap;
        word-break: break-word;
      `,
      chunkApprovalInputLarge: css`
        font-family: ${fontFamily.mono};
        font-size: 10px;
        color: oklch(0.7 0.08 50);
        white-space: pre-wrap;
        word-break: break-word;
      `,
      rawJson: css`
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        padding: 6px;
        background: oklch(0.16 0.01 260);
        border-radius: 3px;
        color: oklch(0.75 0.08 260);
        font-size: 9px;
        max-height: 200px;
        overflow-y: auto;
      `,
      rawJsonLarge: css`
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        padding: ${size[2]};
        background: oklch(0.16 0.01 260);
        border-radius: ${border.radius.sm};
        color: oklch(0.75 0.08 260);
        font-size: 10px;
        max-height: 300px;
        overflow-y: auto;
      `,
      noChunks: css`
        padding: ${size[3]};
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: ${fontSize.xs};
      `,
      streamContainer: css`
        padding: ${size[3]};
        background: oklch(0.18 0.02 260);
        border-radius: ${border.radius.lg};
        border: 1px solid oklch(0.25 0.03 260);
      `,
      streamHeader: css`
        margin-bottom: ${size[3]};
        padding-bottom: ${size[2]};
        border-bottom: 1px solid oklch(0.25 0.03 260);
      `,
      streamHeaderRow: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        margin-bottom: ${size[1]};
      `,
      streamTitle: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.8 0.05 260);
      `,
      streamSubtitle: css`
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[500], colors.gray[500])};
      `,
      messageGroups: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      messageGroupDetails: css`
        margin-bottom: ${size[1]};
      `,
      messageGroupSummary: css`
        cursor: pointer;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        color: oklch(0.65 0.08 260);
        padding: 10px;
        background: oklch(0.2 0.02 260);
        border-radius: 6px;
        border: 1px solid oklch(0.28 0.03 260);
        user-select: none;
      `,
      messageGroupContent: css`
        display: flex;
        flex-direction: column;
        gap: 6px;
      `,
      messageGroupHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
      `,
      messageId: css`
        font-family: ${fontFamily.mono};
        font-size: 9px;
        color: oklch(0.6 0.05 260);
        font-weight: ${font.weight.normal};
      `,
    },
  }
}

export function useStyles() {
  const { theme } = useTheme()
  const [styles, setStyles] = createSignal(stylesFactory(theme()))
  createEffect(() => {
    setStyles(stylesFactory(theme()))
  })
  return styles
}
