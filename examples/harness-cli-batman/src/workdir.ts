// Work in the folder where you started the app. `pnpm start` runs the
// script in this example's folder, and keeps your folder in INIT_CWD. The
// CLI imports this file after ./env (the .env file is in this example's
// folder) and before the harness, which reads the folder.
const started = process.env.INIT_CWD;
if (started) process.chdir(started);
