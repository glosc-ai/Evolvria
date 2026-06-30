#!/usr/bin/env node

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const host = "127.0.0.1";
const port = 5174;
const devUrl = `http://${host}:${port}/`;
const currentWorkingDirectory = process.cwd();
const execFileAsync = promisify(execFile);

const optimizedDepPaths = [
  "/node_modules/.vite/deps/vue.js",
  "/node_modules/.vite/deps/pinia.js",
  "/node_modules/.vite/deps/vue-router.js",
  "/node_modules/.vite/deps/lucide-vue-next.js",
  "/node_modules/.vite/deps/@tauri-apps_api_core.js",
];

async function getExistingServerHtml() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(1500) });
    return await response.text();
  } catch {
    return null;
  }
}

const html = await getExistingServerHtml();

if (html) {
  if (html.includes("<title>Evolvria</title>") && html.includes("/src/main.ts")) {
    if (await hasOutdatedOptimizedDeps()) {
      const restarted = await stopCurrentProjectViteServer();

      if (!restarted) {
        console.error(`Vite dev server at ${devUrl} has outdated optimized dependencies.`);
        console.error(`Stop the existing Vite process and run yarn tauri dev again.`);
        process.exit(1);
      }
    } else {
      console.log(`Vite dev server already running at ${devUrl}; reusing it for Tauri.`);
      process.exit(0);
    }
  } else {
    console.error(`Port ${port} is already in use by another server.`);
    console.error(`Stop that process or change the Vite/Tauri dev port before running Tauri.`);
    process.exit(1);
  }
}

const vite = spawn("vite", ["--host", host, "--port", String(port), "--strictPort"], {
  stdio: "inherit",
  env: process.env,
});

const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143,
};
let stoppingSignal = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stoppingSignal = signal;
    vite.kill(signal);
  });
}

vite.on("exit", (code, signal) => {
  if (signal || stoppingSignal) process.exit(signalExitCodes[signal ?? stoppingSignal] ?? 1);
  process.exit(code ?? 1);
});

async function hasOutdatedOptimizedDeps() {
  const statuses = await Promise.all(
    optimizedDepPaths.map(async (path) => {
      try {
        const response = await fetch(new URL(path, devUrl), { signal: AbortSignal.timeout(1500) });
        return response.status;
      } catch {
        return 0;
      }
    }),
  );

  return statuses.includes(504);
}

async function stopCurrentProjectViteServer() {
  const pids = await getPortListenerPids();

  for (const pid of pids) {
    const command = await getProcessCommand(pid);

    if (command.includes(currentWorkingDirectory) && command.includes("vite")) {
      console.log(`Restarting stale Vite dev server on ${devUrl}.`);
      process.kill(Number(pid), "SIGTERM");
      return waitForPortToClose();
    }
  }

  return false;
}

async function getPortListenerPids() {
  try {
    const { stdout } = await execFileAsync("lsof", ["-tiTCP:5174", "-sTCP:LISTEN"]);
    return stdout.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

async function getProcessCommand(pid) {
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function waitForPortToClose() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await getPortListenerPids()).length === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}
