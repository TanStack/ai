/** The commands of the screen itself. The harness adds its own to the list. */
export const SCREEN_COMMANDS = [
  {
    name: "connect",
    description: "Light the signal: connect a model provider, Notion, or Linear",
  },
  { name: "disconnect", description: "Cut a key or a sign-in" },
  { name: "model", description: "Pick which mind patrols tonight" },
  { name: "effort", description: "Pick how hard the model thinks" },
  { name: "resume", description: "Continue a saved session" },
  { name: "mic", description: "Pick the microphone" },
  { name: "open", description: "Open a media file (default: the last one)" },
  { name: "play", description: "Play an audio or video file" },
  {
    name: "voice",
    description: "Send a recorded voice message: /voice note.m4a",
  },
  { name: "help", description: "Show the commands and the voice tips" },
  { name: "exit", description: "Return to the cave" },
];

// Commands that need text after the name: Enter in the list fills the name.
export const TAKES_INPUT = new Set(["voice"]);
