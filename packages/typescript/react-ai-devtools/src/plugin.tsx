import { createReactPlugin } from "@tanstack/devtools-utils/react";
import { AiDevtoolsPanel } from "./AiDevtools";

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createReactPlugin("TanStack AI", AiDevtoolsPanel);

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin };
