// The `.env` shortcut: the keys in ./.env, when the file is there. A missing
// file is normal (the app needs none), so it says nothing. The CLI imports
// this file first, so the keys are set before the harness reads them.
try {
  process.loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}
