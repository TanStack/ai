import { createSolidPlugin } from "@tanstack/devtools-utils/solid";
import { AiDevtoolsPanel } from "./AiDevtools";

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createSolidPlugin("TanStack AI", AiDevtoolsPanel);

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin };
