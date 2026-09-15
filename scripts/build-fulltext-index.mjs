#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { IpoClient } from "../dist/client.js";
import { tokenize } from "../dist/fulltext-index.js";

const metadataPath = resolve(process.argv[2] || "data/ipo-index.json");
const output = resolve(process.argv[3] || "data/ipo-fulltext-index.json.gz");
const temporary = output + ".tmp";
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (!Array.isArray(metadata.records) || !metadata.records.length) {
    throw new Error("Brak rekordów w indeksie metadanych: " + metadataPath);
}

const documentIds = metadata.records.map((record) => record.document_id);
const postings = new Map();
const failed = [];
const workerCount = 8;
const clients = Array.from({ length: workerCount }, () => new IpoClient());
let cursor = 0;
let completed = 0;
let requestGate = Promise.resolve();
let nextRequestAt = 0;

function waitForRequestSlot() {
    const ticket = requestGate.then(async () => {
        const remaining = nextRequestAt - Date.now();
        if (remaining > 0) {
            await new Promise((resolvePromise) =>
                setTimeout(resolvePromise, remaining),
            );
        }
        // Jeden start co 350 ms: nie więcej niż ok. 2,85 dokumentu/s.
        nextRequestAt = Date.now() + 350;
    });
    requestGate = ticket.catch(() => {});
    return ticket;
}

console.error(
    "Buduję szybki indeks pełnotekstowy z " +
        documentIds.length +
        " oficjalnych dokumentów IPO...",
);
async function worker(client) {
    while (true) {
        const ordinal = cursor;
        cursor += 1;
        if (ordinal >= metadata.records.length) return;
        const record = metadata.records[ordinal];
        try {
            await waitForRequestSlot();
            const judgment = await client.getJudgment(
                record.document_id,
                record.case_id || undefined,
                20_000,
            );
            const uniqueTerms = new Set(
                tokenize(
                    [
                        record.signature,
                        record.kind,
                        record.subject,
                        judgment.text,
                    ].join("\n"),
                ).filter((term) => term.length <= 64),
            );
            for (const term of uniqueTerms) {
                const list = postings.get(term);
                if (list) list.push(ordinal);
                else postings.set(term, [ordinal]);
            }
        } catch (error) {
            failed.push({
                document_id: record.document_id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        completed += 1;
        if (
            completed === 1 ||
            completed === documentIds.length ||
            completed % 50 === 0
        ) {
            console.error(
                "Dokument " +
                    completed +
                    "/" +
                    documentIds.length +
                    ", błędy: " +
                    failed.length,
            );
        }
    }
}
console.error("Otwieram " + workerCount + " kontrolowanych sesji IPO...");
for (const client of clients) {
    await waitForRequestSlot();
    await client.openSession();
}
await Promise.all(clients.map((client) => worker(client)));

if (failed.length > Math.max(25, Math.floor(documentIds.length * 0.05))) {
    throw new Error(
        "Nie udało się pobrać " +
            failed.length +
            " dokumentów; nie zapisuję niepełnego indeksu.",
    );
}

const terms = {};
for (const [term, ordinals] of [...postings.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
)) {
    ordinals.sort((left, right) => left - right);
    let previous = 0;
    terms[term] = ordinals.map((ordinal) => {
        const delta = ordinal - previous;
        previous = ordinal;
        return delta;
    });
}
const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "https://ipo.trybunal.gov.pl/ipo/",
    official: true,
    document_count: documentIds.length - failed.length,
    failed_document_count: failed.length,
    document_ids: documentIds,
    terms,
};
const compressed = gzipSync(JSON.stringify(payload), { level: 9 });
await writeFile(temporary, compressed);
await rename(temporary, output);
console.error(
    "Zapisano " +
        Object.keys(terms).length +
        " terminów (" +
        compressed.length +
        " bajtów), błędy dokumentów: " +
        failed.length +
        ".",
);
