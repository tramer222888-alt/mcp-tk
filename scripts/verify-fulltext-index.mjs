#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { searchFullTextIndex } from "../dist/fulltext-index.js";

const metadata = JSON.parse(
    await readFile(resolve(process.argv[2] || "data/ipo-index.json"), "utf8"),
);
const fullText = JSON.parse(
    gunzipSync(
        await readFile(
            resolve(process.argv[3] || "data/ipo-fulltext-index.json.gz"),
        ),
    ).toString("utf8"),
);
const result = searchFullTextIndex(fullText, metadata, {
    query: "BGK",
    inflection: false,
    pageNumber: 1,
    pageSize: 50,
});
if (result.totalResults < 7) {
    throw new Error(
        "Test kompletności BGK: oczekiwano co najmniej 7 dokumentów, otrzymano " +
            result.totalResults +
            ".",
    );
}
console.log(
    "OK indeks pełnotekstowy — BGK: " +
        result.totalResults +
        " dokumentów; sygnatury: " +
        result.results.map((item) => item.signature).join(", "),
);
