#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { IpoClient } from "../dist/client.js";

const output = resolve(process.argv[2] || "data/ipo-index.json");
const temporary = output + ".tmp";
const client = new IpoClient();

console.error("Buduję indeks metadanych z oficjalnego IPO TK...");
const results = await client.crawlAll((page, total) => {
    if (page === 1 || page === total || page % 10 === 0) {
        console.error("Strona " + page + "/" + total);
    }
});

const records = results
    .map((item) => ({
        document_id: item.documentId,
        case_id: item.caseId ?? null,
        signature: item.signature,
        kind: item.kind,
        date: item.date,
        subject: item.subject,
        url: item.url,
    }))
    .sort((left, right) => {
        const byDate = right.date.localeCompare(left.date);
        return byDate || right.document_id.localeCompare(left.document_id);
    });

const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: "https://ipo.trybunal.gov.pl/ipo/SzukajDrukuj?cid=1&page=0",
    official: true,
    record_count: records.length,
    records,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(temporary, JSON.stringify(payload, null, 2) + "\n", "utf8");
await rename(temporary, output);
console.error("Zapisano " + records.length + " rekordów: " + output);
