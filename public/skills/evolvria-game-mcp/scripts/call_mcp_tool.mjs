#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const serverPath = path.join(repoRoot, "scripts/evolvria-mcp.mjs");

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.toolName) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const toolArgs = await readJsonArg(args.jsonArg ?? "{}");
const serverArgs = [serverPath];
if (args.appData) serverArgs.push("--app-data", args.appData);
if (args.saveDir) serverArgs.push("--save-dir", args.saveDir);

const child = spawn(process.execPath, serverArgs, {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
});

const stderrChunks = [];
let stdoutBuffer = Buffer.alloc(0);
let settled = false;

const timeout = setTimeout(() => {
  finish(new Error("MCP 调用超时。"));
}, args.timeoutMs);

child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
child.on("error", finish);
child.on("exit", (code) => {
  if (!settled && code !== 0) {
    finish(new Error(`MCP 服务退出，code=${code}\n${Buffer.concat(stderrChunks).toString("utf8")}`));
  }
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.from(chunk)]);
  while (true) {
    const parsed = readFrame(stdoutBuffer);
    if (!parsed) return;
    stdoutBuffer = parsed.rest;
    handleMessage(parsed.message);
  }
});

sendFrame({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "evolvria-skill-script", version: "0.1.0" } } });
sendFrame({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: args.toolName, arguments: toolArgs } });

function handleMessage(message) {
  if (message?.id !== 2) return;
  if (message.error) {
    finish(new Error(message.error.message || JSON.stringify(message.error)));
    return;
  }
  const text = message.result?.content?.find?.((item) => item.type === "text")?.text ?? JSON.stringify(message.result);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
  finish();
}

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  child.kill();
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function sendFrame(message) {
  const text = JSON.stringify(message);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`);
}

function readFrame(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) throw new Error("响应缺少 Content-Length。");
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;
  return {
    message: JSON.parse(buffer.slice(bodyStart, bodyEnd).toString("utf8")),
    rest: buffer.slice(bodyEnd),
  };
}

async function readJsonArg(value) {
  const raw = value.startsWith("@") ? await fs.readFile(value.slice(1), "utf8") : value;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`参数不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const parsed = { timeoutMs: 10000 };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--app-data") parsed.appData = argv[++index];
    else if (value === "--save-dir") parsed.saveDir = argv[++index];
    else if (value === "--timeout-ms") parsed.timeoutMs = Number(argv[++index] || 10000);
    else positional.push(value);
  }
  parsed.toolName = positional[0];
  parsed.jsonArg = positional[1];
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs <tool-name> [json-args|@file] [--app-data DIR] [--save-dir DIR]

Examples:
  node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_list_workspace_files '{}'
  node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_backup_save '{"label":"before-ai-edit"}'
  node public/skills/evolvria-game-mcp/scripts/call_mcp_tool.mjs evolvria_read_workspace_file '{"path":"AGENTS.md"}'
`);
}
