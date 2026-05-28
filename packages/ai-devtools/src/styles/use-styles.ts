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
    shellRoot: css`
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: calc(var(--tsd-main-panel-height, 100%) - 1px);
      max-height: calc(var(--tsd-main-panel-height, 100%) - 1px);
      min-height: 0;
      overflow: hidden;
    `,
    mainContainer: css`
      display: flex;
      flex: 1;
      height: auto;
      min-height: 0;
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
      height: 100%;
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
      height: 100%;
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
      sectionHeader: css`
        padding: ${size[3]} ${size[4]};
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[100], colors.gray[200])};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: center;
        background: ${t(colors.gray[700], colors.darkGray[600])};
        border-bottom: 1px solid ${t(colors.gray[600], colors.darkGray[500])};
      `,
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
      rowMain: css`
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      `,
      rowTop: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: ${size[2]};
      `,
      rowRight: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
        flex-shrink: 0;
      `,
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
        min-width: 0;
        flex: 1;
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
        font-size: 10px;
        opacity: 0.7;
        flex-wrap: wrap;
      `,
      statItem: css`
        display: flex;
        align-items: center;
        gap: 2px;
        white-space: nowrap;
      `,
      tokensBadge: css`
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 1px 5px;
        border-radius: ${border.radius.sm};
        background: oklch(0.35 0.08 220);
        color: oklch(0.75 0.12 220);
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        white-space: nowrap;
      `,
      loadingIndicator: css`
        font-size: 12px;
        color: oklch(0.7 0.17 142);
        animation: spin 1s linear infinite;
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `,
    },
    hookDashboard: {
      container: css`
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      `,
      summary: css`
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: ${size[2]};
        padding: ${size[3]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        background: ${t(colors.gray[50], colors.darkGray[800])};
      `,
      summaryItem: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 1px;
      `,
      summaryValue: css`
        color: ${t(colors.gray[900], colors.gray[50])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.md};
        font-weight: ${font.weight.bold};
        line-height: 1;
      `,
      summaryLabel: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        letter-spacing: 0;
        text-transform: uppercase;
      `,
      clearButton: css`
        align-self: center;
        border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[700])};
        color: ${t(colors.gray[700], colors.gray[200])};
        cursor: pointer;
        grid-column: 1 / -1;
        font-size: ${fontSize.xs};
        padding: ${size[1]} ${size[2]};
        width: 100%;
        &:hover:not(:disabled) {
          border-color: ${t(colors.red[300], colors.red[600])};
          color: ${t(colors.red[700], colors.red[300])};
        }
        &:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
      `,
      empty: css`
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: ${fontSize.sm};
        padding: ${size[4]};
        text-align: center;
      `,
      list: css`
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: ${size[2]};
        overflow-y: auto;
        padding: ${size[2]};
      `,
      categorySection: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1.5]};
      `,
      categoryHeader: css`
        align-items: center;
        color: ${t(colors.gray[600], colors.gray[400])};
        display: flex;
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        justify-content: space-between;
        padding: ${size[1]} ${size[1]};
        text-transform: uppercase;
      `,
      categoryLabel: css`
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      categoryCount: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[200], colors.darkGray[700])};
        color: ${t(colors.gray[600], colors.gray[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      categoryRows: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      row: css`
        display: flex;
        width: 100%;
        min-width: 0;
        cursor: pointer;
        flex-direction: column;
        gap: ${size[2]};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        color: inherit;
        padding: ${size[3]};
        text-align: left;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          box-shadow 0.15s ease;
        &:hover {
          border-color: ${t(colors.blue[300], colors.blue[700])};
          background: ${t(colors.blue[50], colors.blue[900] + '20')};
        }
      `,
      rowLive: css`
        border-color: ${t(colors.green[300], colors.green[700])};
        box-shadow: inset 3px 0 0 ${t(colors.green[500], colors.green[400])};
      `,
      rowUpdating: css`
        border-color: ${t(colors.blue[400], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 3px 0 0 ${t(colors.blue[500], colors.blue[400])};
      `,
      rowSelected: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '35')};
        box-shadow: none;
      `,
      rowMain: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
      `,
      rowTitleLine: css`
        align-items: center;
        display: flex;
        gap: ${size[1]};
        min-width: 0;
      `,
      rowTitle: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      rowId: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      rowMeta: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${size[1]};
      `,
      lifecycleBadge: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.green[50], colors.green[900] + '30')};
        color: ${t(colors.green[700], colors.green[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        padding: 1px ${size[1.5]};
      `,
      lifecycleStreaming: css`
        background: ${t(colors.blue[50], colors.blue[900] + '35')};
        color: ${t(colors.blue[700], colors.blue[300])};
      `,
      lifecycleErrored: css`
        background: ${t(colors.red[50], colors.red[900] + '35')};
        color: ${t(colors.red[700], colors.red[300])};
      `,
      kindBadge: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.purple[50], colors.purple[900] + '30')};
        color: ${t(colors.purple[700], colors.purple[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      countBadge: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[100], colors.darkGray[600])};
        color: ${t(colors.gray[600], colors.gray[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      liveIndicator: css`
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: ${t(colors.green[500], colors.green[400])};
        box-shadow: 0 0 0 0 ${t(colors.green[400], colors.green[500])};
        flex-shrink: 0;
        animation: hookLivePulse 1.2s ease-out infinite;
        @keyframes hookLivePulse {
          0% {
            box-shadow: 0 0 0 0 ${t(colors.green[400], colors.green[500])};
          }
          70% {
            box-shadow: 0 0 0 6px transparent;
          }
          100% {
            box-shadow: 0 0 0 0 transparent;
          }
        }
      `,
      updateBadge: css`
        border-radius: 999px;
        background: ${t(colors.blue[600], colors.blue[500])};
        color: ${colors.white};
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        padding: 1px ${size[1.5]};
        white-space: nowrap;
      `,
    },
    hookDetails: {
      empty: css`
        align-items: center;
        color: ${t(colors.gray[500], colors.gray[500])};
        display: flex;
        flex: 1;
        font-size: ${fontSize.sm};
        justify-content: center;
        padding: ${size[4]};
        text-align: center;
      `,
      overview: css`
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: ${size[4]};
        overflow-y: auto;
        padding: ${size[4]};
      `,
      overviewHeader: css`
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: ${size[3]};
      `,
      overviewTitle: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.lg};
        font-weight: ${font.weight.bold};
      `,
      overviewSubtitle: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: ${fontSize.sm};
        margin-top: ${size[1]};
      `,
      overviewMetricGrid: css`
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: ${size[3]};
        @media (max-width: 900px) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      `,
      overviewMetricCard: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[1]};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[800])};
        padding: ${size[3]};
      `,
      overviewGroups: css`
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: ${size[3]};
        @media (max-width: 960px) {
          grid-template-columns: 1fr;
        }
      `,
      overviewGroupCard: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[2]};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[800])};
        padding: ${size[3]};
      `,
      overviewGroupHeader: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: ${t(colors.gray[700], colors.gray[200])};
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
      `,
      overviewHookButton: css`
        display: flex;
        width: 100%;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: ${size[3]};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[50], colors.darkGray[700])};
        color: inherit;
        cursor: pointer;
        padding: ${size[2]} ${size[3]};
        text-align: left;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
        &:hover {
          border-color: ${t(colors.blue[300], colors.blue[700])};
          background: ${t(colors.blue[50], colors.blue[900] + '20')};
        }
      `,
      overviewHookMain: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
      `,
      overviewHookTitle: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      overviewHookId: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      overviewHookMeta: css`
        display: flex;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: ${size[1]};
      `,
      container: css`
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      `,
      header: css`
        display: flex;
        align-items: center;
        flex-shrink: 0;
        gap: ${size[3]};
        justify-content: space-between;
        padding: ${size[3]} ${size[4]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        background: ${t(colors.gray[50], colors.darkGray[800])};
      `,
      headerMain: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[1]};
      `,
      titleRow: css`
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: ${size[2]};
        min-width: 0;
      `,
      title: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.md};
        font-weight: ${font.weight.bold};
      `,
      lifecycle: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.green[50], colors.green[900] + '30')};
        color: ${t(colors.green[700], colors.green[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        padding: 1px ${size[1.5]};
      `,
      kind: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        color: ${t(colors.blue[700], colors.blue[300])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      identity: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        display: flex;
        flex-wrap: wrap;
        gap: ${size[2]};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
      `,
      metrics: css`
        display: grid;
        align-items: stretch;
        flex-shrink: 0;
        grid-template-columns: repeat(4, minmax(58px, auto));
        gap: ${size[2]};
      `,
      metric: css`
        display: flex;
        min-height: 38px;
        flex-direction: column;
        justify-content: center;
        border-left: 1px solid ${t(colors.gray[200], colors.darkGray[600])};
        padding-left: ${size[2]};
      `,
      metricValue: css`
        color: ${t(colors.gray[900], colors.gray[50])};
        display: block;
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.md};
        font-weight: ${font.weight.bold};
        line-height: 1;
      `,
      metricLabel: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        display: block;
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        letter-spacing: 0.03em;
        margin-top: 2px;
        text-transform: uppercase;
      `,
      tabs: css`
        display: flex;
        flex-shrink: 0;
        gap: ${size[1]};
        overflow-x: auto;
        padding: ${size[3]} ${size[4]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      `,
      tab: css`
        border: 1px solid transparent;
        border-radius: ${border.radius.sm};
        background: transparent;
        color: ${t(colors.gray[600], colors.gray[400])};
        cursor: pointer;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        padding: ${size[1]} ${size[2]};
        white-space: nowrap;
        &:hover {
          background: ${t(colors.gray[200], colors.darkGray[700])};
          color: ${t(colors.gray[900], colors.gray[100])};
        }
      `,
      tabActive: css`
        background: ${t(colors.blue[50], colors.blue[900] + '35')};
        border-color: ${t(colors.blue[300], colors.blue[700])};
        color: ${t(colors.blue[700], colors.blue[300])};
      `,
      body: css`
        display: grid;
        flex: 1;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
        height: 100%;
        min-height: 0;
        overflow: hidden;
        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }
      `,
      bodySinglePane: css`
        grid-template-columns: minmax(0, 1fr);
      `,
      primary: css`
        height: 100%;
        min-height: 0;
        overflow: auto;
        padding: ${size[3]};
      `,
      previewPane: css`
        border-left: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        background: ${t(colors.white, colors.darkGray[900])};
        display: flex;
        height: 100%;
        max-height: 100%;
        min-height: 0;
        flex-direction: column;
        overflow: hidden;
        @media (max-width: 900px) {
          border-left: 0;
          border-top: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
          max-height: 360px;
        }
      `,
      previewHeader: css`
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        color: ${t(colors.gray[700], colors.gray[300])};
        flex-shrink: 0;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.bold};
        letter-spacing: 0.04em;
        padding: ${size[2]} ${size[3]};
        text-transform: uppercase;
      `,
      stack: css`
        display: flex;
        flex-direction: column;
        gap: ${size[3]};
      `,
      section: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        overflow: hidden;
      `,
      sectionTitle: css`
        color: ${t(colors.gray[700], colors.gray[300])};
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.bold};
        letter-spacing: 0.04em;
        padding: ${size[2]} ${size[3]};
        text-transform: uppercase;
      `,
      conversationFallback: css`
        display: flex;
        flex-direction: column;
        gap: ${size[3]};
      `,
      generationRuns: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      generationMetaGrid: css`
        display: grid;
        gap: ${size[2]};
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        padding: 0 ${size[3]} ${size[3]};
      `,
      generationMetaItem: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
        padding: ${size[2]};
      `,
      generationMetaLabel: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: 10px;
        font-weight: ${font.weight.bold};
        letter-spacing: 0;
        text-transform: uppercase;
      `,
      generationMetaValue: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        line-height: 1.35;
        overflow-wrap: anywhere;
      `,
      progressBlock: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
        padding: 0 ${size[3]} ${size[3]};
      `,
      progressText: css`
        color: ${t(colors.gray[600], colors.gray[300])};
        display: flex;
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        justify-content: space-between;
        gap: ${size[2]};
      `,
      progressTrack: css`
        background: ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.sm};
        height: 8px;
        overflow: hidden;
      `,
      progressFill: css`
        background: ${t(colors.blue[500], colors.blue[400])};
        height: 100%;
        transition: width 0.18s ease;
      `,
      generationPreview: css`
        display: flex;
        min-height: 0;
        flex-direction: column;
        gap: ${size[3]};
        padding: ${size[3]};
      `,
      generationPreviewCompact: css`
        flex: 1;
        overflow: auto;
      `,
      generationText: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
      `,
      mediaGrid: css`
        display: grid;
        gap: ${size[2]};
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      `,
      audioList: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      mediaFrame: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[2]};
        overflow: hidden;
        padding: ${size[2]};
        audio,
        video {
          width: 100%;
        }
      `,
      imagePreview: css`
        aspect-ratio: 1 / 1;
        background: ${t(colors.white, colors.darkGray[900])};
        border-radius: ${border.radius.sm};
        max-height: 360px;
        object-fit: contain;
        width: 100%;
      `,
      videoPreview: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[3]};
        video {
          background: ${t(colors.black, colors.black)};
          border-radius: ${border.radius.sm};
          max-height: 360px;
        }
      `,
      mediaMeta: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${size[1]};
        span {
          border-radius: ${border.radius.sm};
          background: ${t(colors.gray[100], colors.darkGray[700])};
          color: ${t(colors.gray[600], colors.gray[300])};
          font-family: ${fontFamily.mono};
          font-size: 10px;
          padding: 1px ${size[1.5]};
        }
      `,
      messageTimeline: css`
        display: flex;
        min-height: 0;
        flex-direction: column;
        gap: ${size[2]};
      `,
      timelineMessage: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        display: flex;
        flex-direction: column;
        gap: ${size[1.5]};
        padding: ${size[3]};
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
        &:hover {
          border-color: ${t(colors.blue[300], colors.blue[700])};
          background: ${t(colors.blue[50], colors.blue[900] + '20')};
        }
      `,
      timelineMessageHighlighted: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
      `,
      jsonPanel: css`
        background: ${t(colors.gray[50], colors.darkGray[900])};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        overflow: auto;
        padding: ${size[2]};
      `,
      jsonPanelCompact: css`
        max-height: 180px;
      `,
      runCard: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        overflow: hidden;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          box-shadow 0.15s ease;
        &:hover {
          border-color: ${t(colors.blue[300], colors.blue[700])};
          background: ${t(colors.blue[50], colors.blue[900] + '18')};
        }
      `,
      runCardHighlighted: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      runHeader: css`
        align-items: flex-start;
        display: flex;
        gap: ${size[2]};
        justify-content: space-between;
        padding: ${size[2.5]} ${size[3]};
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      `,
      runHeading: css`
        min-width: 0;
      `,
      runTitle: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
        word-break: break-all;
      `,
      runMeta: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        margin-top: ${size[1]};
      `,
      runStatusGroup: css`
        align-items: flex-end;
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      runStatus: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        color: ${t(colors.blue[700], colors.blue[300])};
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      runStatusMuted: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[100], colors.darkGray[800])};
        color: ${t(colors.gray[600], colors.gray[300])};
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      runCardBody: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2.5]};
        padding: ${size[3]};
      `,
      runSummaryGrid: css`
        display: grid;
        gap: ${size[2]};
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      `,
      runDetailsGrid: css`
        display: grid;
        gap: ${size[2]};
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      `,
      runField: css`
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: ${size[1]};
      `,
      generationOutputGrid: css`
        display: grid;
        gap: ${size[2]};
        grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
        overflow-y: auto;
        padding: ${size[3]};
      `,
      outputTile: css`
        appearance: none;
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        color: inherit;
        cursor: pointer;
        display: flex;
        min-width: 0;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        text-align: left;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          transform 0.15s ease;
        &:hover {
          border-color: ${t(colors.blue[300], colors.blue[700])};
          background: ${t(colors.blue[50], colors.blue[900] + '20')};
          transform: translateY(-1px);
        }
      `,
      outputTileHighlighted: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
        transform: translateY(-1px);
      `,
      outputTileBody: css`
        align-items: center;
        aspect-ratio: 1 / 1;
        background: ${t(colors.white, colors.darkGray[900])};
        display: flex;
        justify-content: center;
        min-height: 0;
        overflow: hidden;
        padding: ${size[1]};
        audio,
        video {
          max-height: 100%;
          width: 100%;
        }
        video {
          background: ${colors.black};
        }
      `,
      outputTileImage: css`
        height: 100%;
        object-fit: contain;
        width: 100%;
      `,
      outputTileText: css`
        color: ${t(colors.gray[800], colors.gray[100])};
        display: -webkit-box;
        font-size: ${fontSize.xs};
        line-height: 1.4;
        overflow: hidden;
        padding: ${size[2]};
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 6;
        word-break: break-word;
      `,
      outputTileFooter: css`
        border-top: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: ${size[1.5]} ${size[2]};
        span:first-child {
          color: ${t(colors.gray[500], colors.gray[400])};
          font-family: ${fontFamily.mono};
          font-size: 10px;
        }
        span:last-child {
          color: ${t(colors.gray[800], colors.gray[100])};
          font-size: ${fontSize.xs};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `,
      outputModalBackdrop: css`
        --tsrd-font-size: 12px;
        align-items: center;
        background: rgb(0 0 0 / 0.82);
        display: flex;
        inset: 0;
        justify-content: center;
        padding: ${size[6]};
        position: fixed;
        z-index: 2147483647;
      `,
      outputModalDialog: css`
        background: ${t(colors.white, colors.darkGray[900])};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
        display: flex;
        max-height: min(900px, 92vh);
        max-width: min(1120px, 92vw);
        min-width: min(720px, 92vw);
        overflow: hidden;
        flex-direction: column;
      `,
      outputModalHeader: css`
        align-items: center;
        border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        display: flex;
        justify-content: space-between;
        gap: ${size[4]};
        padding: ${size[4]} ${size[5]};
      `,
      outputModalTitle: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.md};
        font-weight: ${font.weight.semibold};
      `,
      outputModalClose: css`
        align-items: center;
        background: ${t(colors.gray[100], colors.darkGray[800])};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.sm};
        color: ${t(colors.gray[700], colors.gray[200])};
        cursor: pointer;
        display: flex;
        font-size: ${fontSize.lg};
        height: 32px;
        justify-content: center;
        line-height: 1;
        width: 32px;
        &:hover {
          background: ${t(colors.gray[200], colors.darkGray[700])};
        }
      `,
      outputModalBody: css`
        align-items: center;
        display: flex;
        justify-content: center;
        min-height: 0;
        overflow: auto;
        padding: ${size[4]};
        img,
        video {
          max-height: 76vh;
          max-width: 100%;
        }
        audio {
          width: min(720px, 84vw);
        }
      `,
      outputModalMedia: css`
        object-fit: contain;
      `,
      outputModalText: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        line-height: 1.6;
        max-width: 760px;
        white-space: pre-wrap;
        word-break: break-word;
      `,
      errorText: css`
        color: ${t(colors.red[700], colors.red[300])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        padding: ${size[2]} ${size[3]};
        white-space: pre-wrap;
      `,
      emptySmall: css`
        color: ${t(colors.gray[500], colors.gray[500])};
        font-size: ${fontSize.xs};
        padding: ${size[3]};
        text-align: center;
      `,
      eventList: css`
        display: flex;
        flex-direction: column;
        gap: 1px;
      `,
      eventRow: css`
        align-items: center;
        background: ${t(colors.gray[50], colors.darkGray[800])};
        display: flex;
        gap: ${size[2]};
        min-width: 0;
        padding: ${size[2]} ${size[3]};
        &:hover {
          background: ${t(colors.blue[50], colors.blue[900] + '25')};
        }
      `,
      eventTime: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
      `,
      eventName: css`
        color: ${t(colors.gray[800], colors.gray[200])};
        flex: 1;
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      eventBadge: css`
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[100], colors.darkGray[600])};
        color: ${t(colors.gray[600], colors.gray[300])};
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
        padding: 1px ${size[1.5]};
      `,
      messages: css`
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: ${size[2]};
        min-height: 0;
        overflow-y: auto;
        padding: ${size[3]};
      `,
      message: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
        padding: ${size[2]};
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      `,
      messageHighlighted: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      messageRole: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: 10px;
        font-weight: ${font.weight.bold};
        letter-spacing: 0.04em;
        text-transform: uppercase;
      `,
      messageContent: css`
        color: ${t(colors.gray[800], colors.gray[100])};
        font-size: ${fontSize.sm};
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      `,
      previewPart: css`
        border-left: 2px solid ${t(colors.gray[300], colors.darkGray[500])};
        border-radius: ${border.radius.sm};
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: ${size[1]};
        padding: ${size[1]} ${size[2]};
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      `,
      previewPartThinking: css`
        border-left-color: ${t(colors.pink[400], colors.pink[500])};
      `,
      previewPartToolCall: css`
        border-left-color: ${t(colors.yellow[500], colors.yellow[500])};
      `,
      previewPartToolResult: css`
        border-left-color: ${t(colors.cyan[500], colors.cyan[500])};
      `,
      previewPartStructuredOutput: css`
        border-left-color: ${t(colors.green[500], colors.green[500])};
      `,
      previewPartMedia: css`
        border-left-color: ${t(colors.purple[500], colors.purple[500])};
      `,
      previewPartHighlighted: css`
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        border-left-color: ${t(colors.blue[500], colors.blue[400])};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      previewPartLabel: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: 10px;
        font-weight: ${font.weight.bold};
      `,
      previewPartActions: css`
        display: flex;
        gap: ${size[1]};
        margin: 1px 0 ${size[1]};
      `,
      previewPartActionButton: css`
        border: 1px solid ${t(colors.gray[300], colors.darkGray[500])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[700])};
        color: ${t(colors.gray[700], colors.gray[200])};
        cursor: pointer;
        font-size: 10px;
        font-weight: ${font.weight.semibold};
        line-height: 1;
        padding: ${size[1]} ${size[1.5]};
        &:hover {
          border-color: ${t(colors.blue[400], colors.blue[500])};
          color: ${t(colors.blue[600], colors.blue[300])};
        }
      `,
      previewPartContent: css`
        color: ${t(colors.gray[700], colors.gray[200])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      `,
      previewJsonItems: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1.5]};
      `,
      previewJsonItemsCompare: css`
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        @media (max-width: 760px) {
          grid-template-columns: 1fr;
        }
      `,
      previewJsonItem: css`
        display: flex;
        flex-direction: column;
        gap: 3px;
      `,
      previewJsonItemLabel: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
      `,
      previewJsonPanel: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[600])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[900])};
        min-height: 260px;
        max-height: 420px;
        overflow: auto;
        padding: ${size[2]} ${size[2]} ${size[2]} ${size[5]};
      `,
      toolsGrid: css`
        display: grid;
        gap: ${size[3]};
        grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
        @media (max-width: 760px) {
          grid-template-columns: 1fr;
        }
      `,
      toolsList: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      toolRow: css`
        align-items: center;
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        color: inherit;
        cursor: pointer;
        display: flex;
        gap: ${size[2]};
        justify-content: space-between;
        padding: ${size[2]};
        text-align: left;
        &:hover {
          border-color: ${t(colors.yellow[300], colors.yellow[700])};
          background: ${t(colors.yellow[50], colors.yellow[900] + '20')};
        }
      `,
      toolRowSelected: css`
        border-color: ${t(colors.yellow[500], colors.yellow[500])};
        background: ${t(colors.yellow[50], colors.yellow[900] + '30')};
      `,
      toolName: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
      `,
      toolDetail: css`
        display: flex;
        flex-direction: column;
        gap: ${size[3]};
        min-width: 0;
      `,
      fixtureRow: css`
        align-items: center;
        border: 0;
        background: ${t(colors.gray[50], colors.darkGray[800])};
        color: ${t(colors.gray[700], colors.gray[200])};
        display: flex;
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        gap: ${size[2]};
        justify-content: space-between;
        padding: ${size[2]} ${size[3]};
        text-align: left;
        &:hover {
          background: ${t(colors.blue[50], colors.blue[900] + '25')};
        }
      `,
      fixtureInfo: css`
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      `,
      fixtureName: css`
        color: ${t(colors.gray[900], colors.gray[100])};
        font-weight: ${font.weight.semibold};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      fixtureMeta: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      fixtureRowActions: css`
        display: flex;
        flex-shrink: 0;
        gap: ${size[1]};
      `,
      fixtureRowButton: css`
        border: 1px solid ${t(colors.blue[300], colors.blue[700])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[700])};
        color: ${t(colors.blue[700], colors.blue[300])};
        cursor: pointer;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        padding: 2px ${size[2]};
        &:hover {
          background: ${t(colors.blue[50], colors.blue[900] + '25')};
        }
      `,
      fixtureDangerButton: css`
        border-color: ${t(colors.red[300], colors.red[800])};
        color: ${t(colors.red[700], colors.red[300])};
        &:hover {
          background: ${t(colors.red[50], colors.red[900] + '25')};
        }
      `,
      fixtureForm: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.white, colors.darkGray[700])};
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
        padding-bottom: ${size[3]};
      `,
      fixturePopover: css`
        border: 1px solid ${t(colors.blue[300], colors.blue[700])};
        border-radius: ${border.radius.md};
        background: ${t(colors.blue[50], colors.darkGray[800])};
        box-shadow: 0 12px 30px rgb(0 0 0 / 0.16);
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
        margin: 0 ${size[3]} ${size[3]};
        padding: ${size[3]} 0;
      `,
      fixtureField: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
        padding: 0 ${size[3]};
      `,
      fixtureLabel: css`
        color: ${t(colors.gray[700], colors.gray[300])};
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
      `,
      requiredMark: css`
        color: ${t(colors.red[600], colors.red[400])};
        margin-left: 2px;
      `,
      fixtureInput: css`
        border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[900])};
        color: ${t(colors.gray[900], colors.gray[100])};
        font-size: ${fontSize.sm};
        min-height: 28px;
        padding: ${size[1]} ${size[2]};
      `,
      fixtureTextarea: css`
        border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.white, colors.darkGray[900])};
        color: ${t(colors.gray[900], colors.gray[100])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        min-height: 72px;
        padding: ${size[2]};
        resize: vertical;
      `,
      fixtureActions: css`
        display: flex;
        gap: ${size[2]};
        padding: 0 ${size[3]};
      `,
      fixtureButton: css`
        border: 1px solid ${t(colors.blue[500], colors.blue[600])};
        border-radius: ${border.radius.sm};
        background: ${t(colors.blue[600], colors.blue[600])};
        color: ${colors.white};
        cursor: pointer;
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        padding: ${size[1]} ${size[2]};
        &:hover {
          background: ${t(colors.blue[700], colors.blue[500])};
        }
      `,
      fixtureButtonSecondary: css`
        background: transparent;
        color: ${t(colors.blue[700], colors.blue[300])};
        &:hover {
          background: ${t(colors.blue[50], colors.blue[900] + '25')};
        }
      `,
      fixtureError: css`
        color: ${t(colors.red[700], colors.red[300])};
        font-size: ${fontSize.xs};
        padding: 0 ${size[3]};
      `,
      fixtureHelp: css`
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: ${fontSize.xs};
        line-height: 1.4;
        padding: 0 ${size[3]};
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
      toolsRow: css`
        display: flex;
        align-items: flex-start;
        gap: ${size[2]};
        margin-top: ${size[2]};
      `,
      toolsLabel: css`
        font-size: ${fontSize.sm};
        flex-shrink: 0;
      `,
      optionsRow: css`
        display: flex;
        align-items: flex-start;
        gap: ${size[2]};
        margin-top: ${size[1]};
      `,
      optionsLabel: css`
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[600], colors.gray[400])};
        flex-shrink: 0;
        white-space: nowrap;
      `,
      optionsCompact: css`
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      `,
      optionBadge: css`
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        background: ${t(colors.gray[200], colors.darkGray[700])};
        color: ${t(colors.gray[700], colors.gray[300])};
        border-radius: ${border.radius.sm};
        font-size: 10px;
        font-family: ${fontFamily.mono};
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
      collapsibleSection: css`
        margin-top: ${size[2]};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
        border-radius: ${border.radius.md};
        overflow: hidden;
      `,
      collapsibleSummary: css`
        cursor: pointer;
        padding: ${size[2]} ${size[3]};
        background: ${t(colors.gray[100], colors.darkGray[800])};
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.medium};
        color: ${t(colors.gray[700], colors.gray[300])};
        user-select: none;
        &:hover {
          background: ${t(colors.gray[200], colors.darkGray[700])};
        }
      `,
      collapsibleContent: css`
        padding: ${size[3]};
        background: ${t(colors.gray[50], colors.darkGray[900])};
        font-size: ${fontSize.xs};
        max-height: 300px;
        overflow-y: auto;
      `,
      systemPromptItem: css`
        display: flex;
        gap: ${size[2]};
        padding: ${size[2]};
        margin-bottom: ${size[2]};
        background: ${t(colors.gray[100], colors.darkGray[800])};
        border-radius: ${border.radius.sm};
        &:last-child {
          margin-bottom: 0;
        }
      `,
      systemPromptIndex: css`
        font-weight: ${font.weight.semibold};
        color: ${colors.purple[400]};
        font-size: 10px;
        flex-shrink: 0;
      `,
      systemPromptText: css`
        color: ${t(colors.gray[700], colors.gray[300])};
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
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
      tabButtonPulse: css`
        position: relative;
        animation: activityPulse 1.4s ease-in-out infinite;
        @keyframes activityPulse {
          0% {
            box-shadow: 0 0 0 0 ${colors.pink[400]}55;
          }
          70% {
            box-shadow: 0 0 0 8px ${colors.pink[400]}00;
          }
          100% {
            box-shadow: 0 0 0 0 ${colors.pink[400]}00;
          }
        }
      `,
      contentArea: css`
        flex: 1;
        overflow: auto;
        padding: ${size[3]};
        padding-bottom: ${size[6]};
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
        border-radius: ${border.radius.lg};
        overflow: hidden;
      `,
      messageCardUser: css`
        padding: ${size[3]};
        border: 1.5px solid oklch(0.45 0.12 260);
      `,
      messageCardAssistant: css`
        padding: ${size[4]};
        border: 1.5px solid oklch(0.45 0.12 142);
      `,
      messageCardClient: css`
        border: 2px solid oklch(0.45 0.15 142);
      `,
      messageCardServer: css`
        border: 2px solid oklch(0.45 0.12 45);
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
      avatarClient: css`
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: oklch(0.5 0.22 142);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: ${font.weight.bold};
        font-size: ${fontSize.sm};
        color: ${colors.white};
        flex-shrink: 0;
      `,
      avatarServer: css`
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: oklch(0.55 0.18 45);
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
      roleLabelClient: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.75 0.18 142);
        text-transform: capitalize;
      `,
      roleLabelServer: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.75 0.15 45);
        text-transform: capitalize;
      `,
      sourceBanner: css`
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        font-size: 10px;
        font-weight: ${font.weight.medium};
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `,
      sourceBannerClient: css`
        background: oklch(0.25 0.04 142);
        color: oklch(0.7 0.08 142);
      `,
      sourceBannerServer: css`
        background: oklch(0.25 0.04 45);
        color: oklch(0.7 0.06 45);
      `,
      sourceBannerIcon: css`
        font-size: 14px;
      `,
      sourceBannerText: css`
        flex: 1;
      `,
      messageCardContent: css`
        padding: ${size[4]};
        padding-top: ${size[3]};
      `,
      sourceBadge: css`
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: ${fontFamily.mono};
        font-weight: ${font.weight.medium};
      `,
      sourceBadgeClient: css`
        background: oklch(0.25 0.08 260);
        color: oklch(0.75 0.12 260);
      `,
      sourceBadgeServer: css`
        background: oklch(0.25 0.08 45);
        color: oklch(0.75 0.12 45);
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
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
      `,
      toolCallsContainer: css`
        margin-top: ${size[3]};
        display: flex;
        flex-direction: column;
        gap: 8px;
      `,
      toolCall: css`
        border-radius: 8px;
        font-size: ${fontSize.xs};
        overflow: hidden;
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
        padding: 10px 12px;
        cursor: pointer;
        list-style: none;
        &::-webkit-details-marker {
          display: none;
        }
        &::before {
          content: '▶';
          font-size: 10px;
          color: oklch(0.6 0.1 280);
          transition: transform 0.2s ease;
        }
        details[open] > &::before {
          transform: rotate(90deg);
        }
        &:hover {
          background: oklch(0.25 0.04 280);
        }
      `,
      toolCallContent: css`
        padding: ${size[2]} ${size[3]} ${size[3]};
        border-top: 1px solid oklch(0.3 0.05 280);
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
      structuredOutputComparison: css`
        display: grid;
        grid-template-columns: repeat(2, minmax(320px, 1fr));
        gap: ${size[3]};
        align-items: start;
        & > * {
          min-height: 280px;
          border: 1px solid oklch(0.28 0.03 260);
          border-radius: 6px;
          background: oklch(0.18 0.02 260);
          padding: ${size[3]};
          overflow: auto;
        }
        @media (max-width: 760px) {
          grid-template-columns: 1fr;
        }
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
        padding: ${size[3]};
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
        list-style: none;
        &::-webkit-details-marker {
          display: none;
        }
        &::marker {
          display: none;
        }
        details[open] > & .chunks-arrow {
          transform: rotate(90deg);
        }
      `,
      chunksSummaryRow: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
      `,
      chunksSummaryArrow: css`
        font-size: 8px;
        transition: transform 0.15s ease;
        color: oklch(0.5 0.05 260);
        details[open] > summary > div > & {
          transform: rotate(90deg);
        }
      `,
      chunksSummaryTitle: css`
        margin-right: ${size[1]};
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
      chunkBadgeStructured: css`
        background: oklch(0.3 0.12 155);
        color: oklch(0.78 0.16 155);
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
      chunkToolCall: css`
        padding: ${size[2]} ${size[3]};
        background: oklch(0.22 0.08 280);
        border-radius: ${border.radius.sm};
        border: 1px solid oklch(0.32 0.1 280);
        margin-top: ${size[1]};
      `,
      chunkToolCallHeader: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: ${size[2]};
      `,
      chunkToolCallTitle: css`
        color: oklch(0.75 0.12 280);
        font-weight: ${font.weight.semibold};
        font-size: 10px;
      `,
      chunkToolResult: css`
        padding: ${size[2]} ${size[3]};
        background: oklch(0.22 0.08 160);
        border-radius: ${border.radius.sm};
        border: 1px solid oklch(0.32 0.1 160);
        margin-top: ${size[1]};
      `,
      chunkToolResultHeader: css`
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: ${size[2]};
      `,
      chunkToolResultTitle: css`
        color: oklch(0.75 0.12 160);
        font-weight: ${font.weight.semibold};
        font-size: 10px;
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
      // Embedding and Summarize operation styles
      operationCard: css`
        padding: ${size[4]};
        border-radius: ${border.radius.lg};
        background: linear-gradient(
          135deg,
          oklch(0.25 0.04 200) 0%,
          oklch(0.22 0.03 200) 100%
        );
        border: 1.5px solid oklch(0.5 0.15 200);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      `,
      operationHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        margin-bottom: ${size[3]};
      `,
      operationIcon: css`
        font-size: ${fontSize.lg};
      `,
      operationTitle: css`
        font-weight: ${font.weight.semibold};
        font-size: ${fontSize.sm};
        color: oklch(0.85 0.1 200);
        flex: 1;
      `,
      operationStatus: css`
        font-size: ${fontSize.xs};
        padding: 2px ${size[2]};
        border-radius: ${border.radius.sm};
      `,
      operationStatusCompleted: css`
        background: ${colors.green[500]}20;
        color: ${colors.green[400]};
      `,
      operationStatusPending: css`
        background: ${colors.yellow[500]}20;
        color: ${colors.yellow[400]};
      `,
      durationBadge: css`
        font-size: ${fontSize.xs};
        padding: 2px ${size[2]};
        border-radius: ${border.radius.sm};
        background: oklch(0.3 0.1 280);
        color: oklch(0.8 0.1 280);
        font-family: ${fontFamily.mono};
      `,
      operationDetails: css`
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      operationDetail: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        font-size: ${fontSize.xs};
      `,
      operationLabel: css`
        color: oklch(0.65 0.08 200);
        font-weight: ${font.weight.semibold};
        min-width: 70px;
      `,
      operationValue: css`
        color: oklch(0.8 0.05 200);
        font-family: ${fontFamily.mono};
      `,
      // Iteration badge
      iterationBadge: css`
        font-size: ${fontSize.xs};
        padding: 2px ${size[2]};
        border-radius: ${border.radius.sm};
        background: ${colors.purple[500]}20;
        color: ${colors.purple[400]};
        font-weight: ${font.weight.semibold};
      `,
    },

    iterationTimeline: {
      container: css`
        position: relative;
        padding: ${size[3]} ${size[3]};
        overflow-y: auto;
        flex: 1;
      `,
      pipeline: css`
        position: relative;
        display: flex;
        flex-direction: column;
        gap: ${size[3]};
      `,
      iterList: css`
        display: flex;
        flex-direction: column;
        gap: 0;
      `,
      card: css`
        position: relative;
        border-radius: ${border.radius.md};
        background: ${t(colors.gray[50], colors.darkGray[700])};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        overflow: hidden;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      `,
      cardCompleted: css`
        border-color: ${t(colors.green[200], colors.green[900] + '60')};
      `,
      cardError: css`
        border-color: ${t(colors.red[300], colors.red[800])};
      `,
      cardActive: css`
        border-color: ${t(colors.blue[300], colors.blue[700])};
      `,
      cardHighlighted: css`
        border-color: ${t(colors.blue[500], colors.blue[500])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      timelineHighlighted: css`
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow: inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      cardHeader: css`
        display: flex;
        align-items: flex-start;
        gap: ${size[2]};
        padding: ${size[3]} ${size[3]};
        cursor: pointer;
        user-select: none;

        &:hover {
          background: ${t(colors.gray[100], colors.darkGray[600])};
        }
      `,
      cardHeaderContent: css`
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      cardHeaderLabel: css`
        font-size: ${fontSize.sm};
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[800], colors.gray[200])};
        line-height: 1.3;
      `,
      cardSubtitle: css`
        display: flex;
        align-items: center;
        gap: ${size[1.5]};
        flex-wrap: wrap;
      `,
      subtitleText: css`
        font-size: 10px;
        font-family: ${fontFamily.mono};
        color: ${t(colors.gray[500], colors.gray[400])};
      `,
      subtitleBadge: css`
        font-size: 9px;
        padding: 0 ${size[1]};
        border-radius: ${border.radius.xs};
        background: ${t(colors.gray[100], colors.darkGray[500])};
        color: ${t(colors.gray[500], colors.gray[400])};
      `,
      subtitleBadgeWarn: css`
        font-size: 9px;
        padding: 0 ${size[1]};
        border-radius: ${border.radius.xs};
        background: ${t(colors.purple[50], colors.purple[900] + '30')};
        color: ${t(colors.purple[600], colors.purple[300])};
      `,
      subtitleExpandToggle: css`
        font-size: 9px;
        color: ${t(colors.blue[500], colors.blue[400])};
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        &:hover {
          color: ${t(colors.blue[600], colors.blue[300])};
        }
      `,
      configPanelWrapper: css`
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.2s ease-out;
      `,
      configPanelWrapperOpen: css`
        grid-template-rows: 1fr;
      `,
      configPanel: css`
        overflow: hidden;
        & > div {
          padding: ${size[2]} ${size[3]};
          border-top: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
          background: ${t(colors.gray[50], colors.darkGray[700])};
          font-size: ${fontSize.xs};
        }
      `,
      configPanelSection: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
        padding-bottom: ${size[2]};

        &:last-child {
          padding-bottom: 0;
        }

        & + & {
          border-top: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
          padding-top: ${size[2]};
        }
      `,
      configPanelLabel: css`
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[500], colors.gray[400])};
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      `,
      configToolsList: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${size[1]};
      `,
      configToolChip: css`
        display: inline-flex;
        align-items: center;
        gap: ${size[1]};
        padding: 1px ${size[1.5]};
        border-radius: ${border.radius.sm};
        font-size: 10px;
        font-family: ${fontFamily.mono};
        color: ${t(colors.yellow[800], colors.yellow[300])};
        background: ${t(colors.yellow[50], colors.yellow[900] + '25')};
        border: 1px solid ${t(colors.yellow[200], colors.yellow[800] + '40')};
      `,
      configToolChipCount: css`
        font-size: 9px;
        font-weight: ${font.weight.bold};
        padding: 0 ${size[1]};
        border-radius: ${border.radius.xs};
        background: ${t(colors.yellow[200], colors.yellow[800] + '50')};
        color: ${t(colors.yellow[700], colors.yellow[200])};
      `,
      configJsonTreeContainer: css`
        border-radius: ${border.radius.sm};
        overflow: hidden;
        border: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        background: ${t(colors.gray[50], colors.darkGray[800])};
        padding: ${size[1.5]} ${size[2]};
      `,
      systemPromptCard: css`
        border-radius: ${border.radius.sm};
        overflow: hidden;
        border: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        background: ${t(colors.gray[50], colors.darkGray[800])};
      `,
      systemPromptHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[1.5]};
        padding: ${size[1.5]} ${size[2]};
        cursor: pointer;
        user-select: none;
        font-size: ${fontSize.xs};

        &:hover {
          background: ${t(colors.gray[100], colors.darkGray[700])};
        }
      `,
      systemPromptIndex: css`
        font-weight: ${font.weight.bold};
        color: ${t(colors.gray[400], colors.gray[500])};
        font-size: 10px;
        flex-shrink: 0;
      `,
      systemPromptPreview: css`
        flex: 1;
        min-width: 0;
        color: ${t(colors.gray[600], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: ${fontSize.xs};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      systemPromptFull: css`
        margin: 0;
        padding: ${size[2]} ${size[3]};
        font-size: ${fontSize.xs};
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 300px;
        overflow-y: auto;
        color: ${t(colors.gray[700], colors.gray[200])};
        border-top: 1px solid ${t(colors.gray[200], colors.darkGray[600])};
        background: ${t(colors.gray[50], colors.darkGray[900])};
        line-height: 1.5;
      `,
      cardHeaderBadges: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
      `,
      chevron: css`
        color: ${t(colors.gray[400], colors.gray[500])};
        font-size: 10px;
        transition: transform 0.2s ease;
        flex-shrink: 0;
        margin-top: 3px;
      `,
      chevronOpen: css`
        transform: rotate(90deg);
      `,
      badge: css`
        font-size: ${fontSize.xs};
        padding: 1px ${size[2]};
        border-radius: ${border.radius.sm};
        font-family: ${fontFamily.mono};
        font-weight: ${font.weight.medium};
        white-space: nowrap;
      `,
      badgeDuration: css`
        background: ${t(colors.gray[100], colors.darkGray[500])};
        color: ${t(colors.gray[600], colors.gray[300])};
      `,
      badgeFinishReason: css`
        background: ${t(colors.blue[50], colors.blue[900] + '40')};
        color: ${t(colors.blue[700], colors.blue[300])};
      `,
      badgeFinishReasonStop: css`
        background: ${t(colors.green[50], colors.green[900] + '40')};
        color: ${t(colors.green[700], colors.green[300])};
      `,
      badgeFinishReasonToolCalls: css`
        background: ${t(colors.yellow[50], colors.yellow[900] + '40')};
        color: ${t(colors.yellow[700], colors.yellow[300])};
      `,
      badgeUsage: css`
        background: ${t(colors.purple[50], colors.purple[900] + '40')};
        color: ${t(colors.purple[700], colors.purple[300])};
      `,
      cardBody: css`
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.2s ease-out;
      `,
      cardBodyOpen: css`
        grid-template-rows: 1fr;
      `,
      cardBodyInner: css`
        overflow: hidden;
      `,
      userBubble: css`
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: ${font.weight.bold};
        color: ${colors.white};
        flex-shrink: 0;
        background: ${t(colors.blue[500], colors.blue[600])};
        margin-top: 1px;
      `,

      iterCard: css`
        position: relative;
        background: ${t(colors.gray[50], colors.darkGray[700])};
        border-top: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        overflow: hidden;
        animation: iterStaggerIn 0.3s ease-out both;
        width: 100%;
        transition:
          background 0.15s ease,
          box-shadow 0.15s ease;

        @keyframes iterStaggerIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `,
      iterCardHighlighted: css`
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
        box-shadow:
          inset 3px 0 0 ${t(colors.blue[500], colors.blue[500])},
          inset 0 0 0 1px ${t(colors.blue[300], colors.blue[700])};
      `,
      iterCardHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[2]};
        padding: ${size[2]} ${size[3]};
        cursor: pointer;
        user-select: none;

        &:hover {
          background: ${t(colors.gray[100], colors.darkGray[600])};
        }
      `,
      iterHeaderCompleted: css`
        border-left: 3px solid ${t(colors.green[400], colors.green[500])};
      `,
      iterHeaderError: css`
        border-left: 3px solid ${t(colors.red[400], colors.red[500])};
      `,
      iterHeaderActive: css`
        border-left: 3px solid ${t(colors.blue[400], colors.blue[500])};
        animation: iterActivePulse 2s ease-in-out infinite;

        @keyframes iterActivePulse {
          0%,
          100% {
            border-left-color: ${t(colors.blue[400], colors.blue[500])};
          }
          50% {
            border-left-color: ${t(colors.blue[200], colors.blue[700])};
          }
        }
      `,
      iterCardTitle: css`
        font-size: ${fontSize.xs};
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[700], colors.gray[300])};
      `,

      configRow: css`
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: ${size[2]};
        padding: ${size[1.5]} ${size[3]};
        font-size: ${fontSize.xs};
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        border-bottom: 1px solid ${t(colors.gray[100], colors.darkGray[600])};
      `,
      configRowText: css`
        color: ${t(colors.gray[500], colors.gray[400])};
      `,
      configRowMeta: css`
        color: ${t(colors.gray[400], colors.gray[500])};
      `,
      configDiffChip: css`
        font-size: 9px;
        padding: 0 ${size[1]};
        border-radius: ${border.radius.xs};
        background: ${t(colors.yellow[100], colors.yellow[900] + '40')};
        color: ${t(colors.yellow[700], colors.yellow[400])};
        font-weight: ${font.weight.bold};
        text-transform: uppercase;
        letter-spacing: 0.05em;
      `,
      configDetails: css`
        width: 100%;
        margin-top: ${size[2]};
        display: flex;
        flex-direction: column;
        gap: ${size[2]};
      `,
      configDiffSection: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      configDiffRow: css`
        display: flex;
        align-items: center;
        gap: ${size[1]};
        font-size: 10px;
      `,
      configDiffKey: css`
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[600], colors.gray[300])};
      `,
      configDiffFrom: css`
        color: ${t(colors.red[600], colors.red[400])};
        text-decoration: line-through;
      `,
      configDiffArrow: css`
        color: ${t(colors.gray[400], colors.gray[500])};
      `,
      configDiffTo: css`
        color: ${t(colors.green[600], colors.green[400])};
        font-weight: ${font.weight.semibold};
      `,
      configSystemPrompts: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      systemPromptItem: css`
        font-size: ${fontSize.xs};
        padding: ${size[2]};
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[50], colors.darkGray[600])};
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
        color: ${t(colors.gray[700], colors.gray[200])};
        max-height: 120px;
        overflow-y: auto;
      `,
      step: css`
        display: flex;
        align-items: center;
        gap: ${size[1.5]};
        padding: ${size[1.5]} ${size[3]};
        font-size: ${fontSize.xs};
        border-bottom: 1px solid ${t(colors.gray[100], colors.darkGray[600])};

        &:last-child {
          border-bottom: none;
        }
      `,
      stepResponseLong: css`
        flex-direction: column;
        align-items: flex-start;
        gap: ${size[1]};
      `,
      stepPrefix: css`
        flex-shrink: 0;
        font-size: 10px;
        font-weight: ${font.weight.bold};
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 1px ${size[1.5]};
        border-radius: ${border.radius.xs};
      `,
      stepPrefixMiddleware: css`
        color: ${t(colors.purple[700], colors.purple[300])};
        background: ${t(colors.purple[50], colors.purple[900] + '30')};
      `,
      stepPrefixToolCall: css`
        color: ${t(colors.yellow[800], colors.yellow[300])};
        background: ${t(colors.yellow[50], colors.yellow[900] + '30')};
      `,
      stepPrefixToolResult: css`
        color: ${t(colors.cyan[700], colors.cyan[300])};
        background: ${t(colors.cyan[900] + '15', colors.cyan[900] + '30')};
      `,
      stepPrefixAssistant: css`
        color: ${t(colors.blue[700], colors.blue[300])};
        background: ${t(colors.blue[50], colors.blue[900] + '30')};
      `,
      stepPrefixThinking: css`
        color: ${t(colors.pink[700], colors.pink[300])};
        background: ${t(colors.pink[50], colors.pink[900] + '30')};
      `,
      stepContent: css`
        flex: 1;
        min-width: 0;
        color: ${t(colors.gray[600], colors.gray[400])};
        font-family: ${fontFamily.mono};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      stepContentLong: css`
        color: ${t(colors.gray[700], colors.gray[200])};
        font-size: ${fontSize.sm};
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        width: 100%;
      `,
      stepDuration: css`
        flex-shrink: 0;
        font-family: ${fontFamily.mono};
        font-size: 10px;
        color: ${t(colors.gray[400], colors.gray[500])};
      `,
      stepExpandToggle: css`
        flex-shrink: 0;
        cursor: pointer;
        color: ${t(colors.blue[500], colors.blue[400])};
        font-size: 10px;
        user-select: none;
        padding: 0 ${size[1]};

        &:hover {
          text-decoration: underline;
        }
      `,
      stepJsonPanel: css`
        margin: ${size[1.5]} ${size[3]};
        min-height: 280px;
        max-height: 520px;
        overflow: auto;
        padding: ${size[2]} ${size[2]} ${size[2]} ${size[5]};
        border-radius: ${border.radius.sm};
        border: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        background: ${t(colors.gray[50], colors.darkGray[800])};
      `,
      stepJsonItem: css`
        display: flex;
        flex-direction: column;
        gap: ${size[1]};
      `,
      stepJsonItemsCompare: css`
        display: grid;
        grid-template-columns: repeat(2, minmax(320px, 1fr));
        gap: ${size[3]};
        align-items: start;
        padding-right: ${size[3]};
        @media (max-width: 760px) {
          grid-template-columns: 1fr;
        }
      `,
      stepJsonItemLabel: css`
        margin: ${size[2]} ${size[3]} 0;
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        font-weight: ${font.weight.semibold};
      `,
      stepDetail: css`
        padding: ${size[2]};
        margin: 0 ${size[3]} ${size[1.5]};
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[50], colors.darkGray[600])};
        font-size: ${fontSize.xs};
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 200px;
        overflow-y: auto;
        color: ${t(colors.gray[700], colors.gray[200])};
      `,
      responseDetail: css`
        padding: ${size[3]};
        margin: 0 ${size[3]} ${size[1.5]};
        border-radius: ${border.radius.sm};
        background: ${t(colors.gray[50], colors.darkGray[600])};
        font-size: ${fontSize.sm};
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 400px;
        overflow-y: auto;
        color: ${t(colors.gray[800], colors.gray[100])};
      `,
      thinkingDetail: css`
        padding: ${size[3]};
        margin: 0 ${size[3]} ${size[1.5]};
        border-radius: ${border.radius.sm};
        background: ${t(colors.pink[50], colors.pink[900] + '15')};
        border-left: 3px solid ${t(colors.pink[300], colors.pink[600])};
        font-size: ${fontSize.sm};
        font-style: italic;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 400px;
        overflow-y: auto;
        color: ${t(colors.gray[700], colors.gray[200])};
      `,
      jsonTreeContainer: css`
        padding: ${size[1]} ${size[3]} ${size[2]};
      `,

      mwBadge: css`
        display: inline-flex;
        align-items: center;
        padding: 1px ${size[1.5]};
        border-radius: ${border.radius.sm};
        font-size: 10px;
        font-family: ${fontFamily.mono};
        font-weight: ${font.weight.semibold};
        white-space: nowrap;
        flex-shrink: 0;
      `,
      mwBadgeDefault: css`
        background: ${t(colors.gray[100], colors.darkGray[500])};
        color: ${t(colors.gray[600], colors.gray[300])};
      `,
      mwBadgeTransform: css`
        background: ${t(colors.purple[50], colors.purple[900] + '30')};
        color: ${t(colors.purple[700], colors.purple[300])};
      `,
      mwBadgeError: css`
        background: ${t(colors.red[50], colors.red[900] + '30')};
        color: ${t(colors.red[700], colors.red[300])};
      `,
      mwBadgeToolCall: css`
        background: ${t(colors.yellow[50], colors.yellow[900] + '30')};
        color: ${t(colors.yellow[800], colors.yellow[300])};
      `,
      mwBadgeToolResult: css`
        background: ${t(colors.cyan[900] + '15', colors.cyan[900] + '30')};
        color: ${t(colors.cyan[700], colors.cyan[300])};
      `,
      mwBadgeApproval: css`
        background: ${t(colors.yellow[50], colors.yellow[900] + '30')};
        color: ${t(colors.yellow[800], colors.yellow[300])};
      `,
      mwBadgeApproved: css`
        background: ${t(colors.green[50], colors.green[900] + '30')};
        color: ${t(colors.green[700], colors.green[300])};
      `,
      mwBadgeDenied: css`
        background: ${t(colors.red[50], colors.red[900] + '30')};
        color: ${t(colors.red[700], colors.red[300])};
      `,
      mwHook: css`
        font-size: 10px;
        font-family: ${fontFamily.mono};
        color: ${t(colors.gray[500], colors.gray[400])};
        flex-shrink: 0;
      `,
      mwSuffix: css`
        font-size: 9px;
        font-weight: ${font.weight.bold};
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 1px ${size[1]};
        border-radius: ${border.radius.xs};
        background: ${t(colors.yellow[100], colors.yellow[900] + '40')};
        color: ${t(colors.yellow[800], colors.yellow[300])};
        flex-shrink: 0;
      `,
      mwChangesContainer: css`
        padding: ${size[1]} ${size[3]} ${size[2]};
      `,

      jsonViewer: css`
        border: 1px solid ${t(colors.gray[200], colors.darkGray[500])};
        border-radius: ${border.radius.sm};
        overflow: hidden;
        background: ${t(colors.gray[50], colors.darkGray[800])};
      `,
      jsonViewerHeader: css`
        display: flex;
        align-items: center;
        gap: ${size[1.5]};
        padding: ${size[1.5]} ${size[2]};
        cursor: pointer;
        user-select: none;
        font-size: 10px;

        &:hover {
          background: ${t(colors.gray[100], colors.darkGray[700])};
        }
      `,
      jsonViewerChevron: css`
        color: ${t(colors.gray[400], colors.gray[500])};
        font-size: 8px;
        transition: transform 0.15s ease;
        flex-shrink: 0;
      `,
      jsonViewerLabel: css`
        font-weight: ${font.weight.semibold};
        color: ${t(colors.gray[600], colors.gray[300])};
        font-size: 10px;
        flex-shrink: 0;
      `,
      jsonViewerPreview: css`
        flex: 1;
        min-width: 0;
        color: ${t(colors.gray[500], colors.gray[400])};
        font-family: ${fontFamily.mono};
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `,
      jsonViewerContent: css`
        margin: 0;
        padding: ${size[2]};
        font-size: ${fontSize.xs};
        font-family: ${fontFamily.mono};
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 300px;
        overflow-y: auto;
        color: ${t(colors.gray[700], colors.gray[200])};
        border-top: 1px solid ${t(colors.gray[200], colors.darkGray[600])};
        background: ${t(colors.gray[50], colors.darkGray[900])};
        line-height: 1.5;
      `,
      jsonViewerContainer: css`
        padding: ${size[1]} ${size[3]} ${size[2]};
      `,

      middlewareContainer: css`
        display: flex;
        flex-wrap: wrap;
        gap: ${size[1]};
      `,
      middlewarePill: css`
        display: inline-flex;
        align-items: center;
        gap: ${size[1]};
        padding: 1px ${size[1.5]};
        border-radius: ${border.radius.sm};
        font-size: 10px;
        font-family: ${fontFamily.mono};
        background: ${t(colors.gray[100], colors.darkGray[500])};
        color: ${t(colors.gray[600], colors.gray[300])};
        white-space: nowrap;
      `,
      middlewarePillTransform: css`
        background: ${t(colors.purple[50], colors.purple[900] + '30')};
        color: ${t(colors.purple[700], colors.purple[300])};
      `,
      middlewarePillSuffix: css`
        font-weight: ${font.weight.bold};
        font-size: 9px;
        text-transform: uppercase;
      `,

      noIterations: css`
        text-align: center;
        padding: ${size[6]};
        color: ${t(colors.gray[400], colors.gray[500])};
        font-size: ${fontSize.sm};
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
