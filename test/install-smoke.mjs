#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const spec =
    process.env.MCP_TK_SPEC ??
    "github:tramer222888-alt/mcp-tk";
const configuredCommand = process.env.MCP_TK_COMMAND;
const configuredArgs = process.env.MCP_TK_ARGS
    ? JSON.parse(process.env.MCP_TK_ARGS)
    : [];

const cwd = await mkdtemp(join(tmpdir(), "mcp-tk-npx-"));
const isWindows = process.platform === "win32";
const transport = new StdioClientTransport({
    command: configuredCommand ?? (isWindows ? "cmd.exe" : "npx"),
    args: configuredCommand
        ? configuredArgs
        : isWindows
          ? ["/d", "/s", "/c", `npx -y ${spec}`]
          : ["-y", spec],
    cwd,
    stderr: "pipe",
});
transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));

const client = new Client(
    { name: "mcp-tk-install-smoke", version: "1.0.0" },
    { capabilities: {} },
);
const startedAt = Date.now();
let timeoutId;
const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
        () => reject(new Error("npx startup timeout after 180 seconds")),
        180000,
    );
});

try {
    await Promise.race([client.connect(transport), timeout]);
    const startupMs = Date.now() - startedAt;
    const listed = await client.listTools();
    if (listed.tools?.length !== 4) {
        throw new Error(
            `Expected 4 tools, received ${listed.tools?.length ?? 0}`,
        );
    }
    console.log(
        `OK install smoke — 4 tools, startup ${startupMs} ms.`,
    );
} finally {
    clearTimeout(timeoutId);
    await client.close().catch(() => {});
    await rm(cwd, { recursive: true, force: true });
}
