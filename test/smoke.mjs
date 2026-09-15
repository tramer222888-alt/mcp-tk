#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../dist/index.js");
const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
child.stderr.on("data", (chunk) => process.stderr.write("[server] " + chunk));

const pending = new Map();
let nextId = 1;
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
    try {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        message.error
            ? waiter.reject(new Error(message.error.message))
            : waiter.resolve(message.result);
    } catch {
        // Ignore non-protocol output.
    }
});

function rpc(method, params, timeoutMs = 180000) {
    return new Promise((resolvePromise, rejectPromise) => {
        const id = nextId++;
        const timer = setTimeout(() => {
            pending.delete(id);
            rejectPromise(new Error("timeout: " + method));
        }, timeoutMs);
        pending.set(id, {
            resolve: (value) => {
                clearTimeout(timer);
                resolvePromise(value);
            },
            reject: (error) => {
                clearTimeout(timer);
                rejectPromise(error);
            },
        });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
}

const failures = [];
const check = (condition, message) => {
    console.log((condition ? "OK   " : "FAIL ") + message);
    if (!condition) failures.push(message);
};

try {
    await rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-tk-smoke", version: "1.0.0" },
    });
    child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );

    const listed = await rpc("tools/list", {});
    check(listed.tools?.length === 4, "tools/list zwraca 4 narzędzia");

    const recent = await rpc("tools/call", {
        name: "list_recent",
        arguments: { pageSize: 10 },
    });
    check(!recent.isError, "list_recent bez błędu");
    check(
        (recent.structuredContent?.results?.length ?? 0) > 0,
        "list_recent zwraca orzeczenia",
    );
    check(
        (recent.structuredContent?.citations?.[0]?.url ?? "").includes(
            "trybunal.gov.pl",
        ),
        "wynik ma oficjalne citation",
    );

    const document = await rpc("tools/call", {
        name: "get_judgment",
        arguments: {
            id: "25567",
            caseId: "20793",
            section: "ocena_trybunalu",
            maxChars: 1000,
        },
    });
    check(!document.isError, "get_judgment bez błędu");
    check(
        (document.structuredContent?.judgment?.content_chunk?.length ?? 0) > 100,
        "pełna treść jest w structuredContent",
    );
    check(
        Array.isArray(document.structuredContent?.judgment?.sections),
        "mapa sekcji jest dostępna",
    );
} catch (error) {
    console.error(error);
    failures.push(String(error));
} finally {
    child.kill();
}

if (failures.length) {
    console.error("FAIL smoke — " + failures.length + " problemów.");
    process.exit(1);
}
console.log("OK smoke — oficjalny portal IPO działa.");
