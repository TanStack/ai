import { createSolidPanel } from "@tanstack/devtools-utils/solid";
import { AiDevtoolsCore } from "@tanstack/ai-devtools-core";
import type { DevtoolsPanelProps } from "@tanstack/devtools-utils/solid";

const [AiDevtoolsPanel, AiDevtoolsPanelNoOp] = createSolidPanel(AiDevtoolsCore);

export interface AiDevtoolsSolidInit extends DevtoolsPanelProps {}

export { AiDevtoolsPanel, AiDevtoolsPanelNoOp };
