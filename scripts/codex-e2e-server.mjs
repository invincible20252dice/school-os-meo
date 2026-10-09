import { spawn } from "node:child_process";
import { testEnvironment } from "./codex-test-env.mjs";
import { preflight } from "./codex-preflight.mjs";
preflight();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "4317"], {
  stdio: "inherit", env: testEnvironment(),
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });

