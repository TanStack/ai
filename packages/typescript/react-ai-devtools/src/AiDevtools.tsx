import { createReactPanel } from "@tanstack/devtools-utils/react";
import { AiDevtoolsCore } from "@tanstack/ai-devtools-core";
import type { DevtoolsPanelProps } from "@tanstack/devtools-utils/react";

export interface AiDevtoolsReactInit extends DevtoolsPanelProps {}

const [AiDevtoolsPanel, AiDevtoolsPanelNoOp] = createReactPanel(AiDevtoolsCore);

export { AiDevtoolsPanel, AiDevtoolsPanelNoOp };
