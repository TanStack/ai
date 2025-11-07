import { createSolidPlugin } from "@tanstack/devtools-utils/solid";
import { AiDevtoolsPanel } from "./AiDevtools";

const [aiDevtoolsPlugin, aiDevtoolsNoOpPlugin] = createSolidPlugin({
  Component: AiDevtoolsPanel,
  name: "TanStack AI",
  id: "tanstack-ai",
  defaultOpen: true,
});

export { aiDevtoolsPlugin, aiDevtoolsNoOpPlugin };
