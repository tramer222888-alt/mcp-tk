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

const client = new IpoClient();
const documentIds = metadata.records.map((record) => record.document_id);
const postings = new Map();
const failed = [];

console.error(
    "Buduję szybki indeks pełnotekstowy z " +
        documentIds.length +
        " oficjalnych dokumentów IPO...",
);
for (let ordinal = 0; ordinal < metadata.records.length; ordinal += 1) {
    const record = metadata.records[ordinal];
    try {
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
    const done = ordinal + 1;
    if (done === 1 || done === documentIds.length || done % 50 === 0) {
        console.error(
            "Dokument " +
                done +
                "/" +
                documentIds.length +
                ", błędy: " +
                failed.length,
        );
    }
}

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
