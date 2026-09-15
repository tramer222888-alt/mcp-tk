#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    TkError,
    deriveOtkZuUrl,
    findSections,
    parseJudgmentPage,
    parsePolishDate,
    parseSearchPage,
    parseSuccessfulControls,
    reflowText,
    safeIpoPath,
    sliceContent,
} from "../dist/core.js";
import {
    normalizeOtkZuReference,
    parseOtkZuDetail,
} from "../dist/otkzu.js";
import {
    looksLikeAbbreviation,
    mergeSearchResults,
    resolveSearchMode,
    shouldUseFullTextFallback,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(resolve(here, "fixtures", name), "utf8");

let checks = 0;
const check = (condition, message) => {
    assert.ok(condition, message);
    checks += 1;
};

check(parsePolishDate("24 czerwca 2026 r.") === "2026-06-24", "polska data");
check(parsePolishDate("7 października 2014") === "2014-10-07", "data z diakrytykiem");
check(
    reflowText("<p>Ala&nbsp;ma</p>\n<p>kota &amp; psa.</p>") ===
        "Ala ma\n\nkota & psa.",
    "oczyszczanie HTML",
);

const controls = parseSuccessfulControls(
    '<input name="a" value="1"><input type="checkbox" name="b" checked="checked">' +
        '<input type="checkbox" name="c"><select name="d"><option value="x">X</option></select>',
);
check(controls.get("a") === "1" && controls.get("b") === "on", "kontrolki formularza");
check(!controls.has("c") && controls.get("d") === "x", "checkbox i select");
check(safeIpoPath("/ipo/Szukaj?cid=1") === "/ipo/Szukaj?cid=1", "bezpieczna ścieżka");
assert.throws(
    () => safeIpoPath("https://example.com/steal"),
    (error) => error instanceof TkError && error.code === "api_changed",
);
checks += 1;

const search = parseSearchPage(await fixture("ipo-search.html"));
check(search.results.length === 2, "dwa wyniki IPO");
check(search.results[0].documentId === "25567", "ID dokumentu");
check(search.results[0].caseId === "20793", "ID sprawy");
check(search.results[0].signature === "K 7/18", "sygnatura");
check(search.results[0].date === "2026-06-24", "data wyniku");
check(search.results[0].subject.includes("powoływania"), "przedmiot");
check(search.totalPages === 2 && search.totalResults === 26, "pager");

const judgment = parseJudgmentPage(
    await fixture("ipo-detail.html"),
    "25567",
    "20793",
);
check(judgment.signature === "K 7/18", "metadane dokumentu");
check(judgment.kind === "Wyrok", "rodzaj dokumentu");
check(judgment.date === "2026-06-24", "data dokumentu");
check(judgment.judges.length === 2, "sędziowie");
check(
    judgment.otkzuUrl === "https://otkzu.trybunal.gov.pl/2026/A/65",
    "bezpośredni URL OTK ZU",
);
const names = judgment.sections.map((section) => section.name);
for (const name of [
    "calosc",
    "sklad",
    "sentencja",
    "uzasadnienie",
    "stanowiska_uczestnikow",
    "ocena_trybunalu",
    "zdania_odrebne",
]) {
    check(names.includes(name), "sekcja " + name);
}
const legal = sliceContent(
    judgment.text,
    judgment.sections,
    "ocena_trybunalu",
    0,
    500,
);
check(legal.chunk.includes("Trybunał Konstytucyjny zważył"), "skok do oceny TK");
check(!legal.chunk.includes("Wnioskodawca przedstawił"), "bez wcześniejszej części");

const longText = "x".repeat(1200);
const longSections = findSections(longText);
const first = sliceContent(longText, longSections, undefined, 0, 500);
check(first.hasMore && first.nextOffset === 500, "pierwszy fragment");
const second = sliceContent(longText, longSections, undefined, first.nextOffset, 500);
check(second.start === 500 && second.end === 1000, "offset kolejnego fragmentu");

check(
    deriveOtkZuUrl("OTK ZU nr 7A/2014, poz. 80") ===
        "https://otkzu.trybunal.gov.pl/2014/7A/80",
    "stary format OTK ZU",
);
assert.throws(
    () => parseSearchPage("<html>zupełnie inna strona</html>"),
    (error) => error instanceof TkError && error.code === "api_changed",
);
checks += 1;
assert.throws(
    () => parseJudgmentPage("<html>Trybunał Konstytucyjny</html>", "1"),
    (error) => error instanceof TkError && error.code === "api_changed",
);
checks += 1;

const otk = parseOtkZuDetail(
    await fixture("otkzu-detail.html"),
    "2026/A/96",
);
check(otk.documentId === "25657", "mapowanie OTK ZU na dokument IPO");
check(otk.caseId === "27924", "mapowanie OTK ZU na sprawę IPO");
check(otk.signature === "K 21/24", "sygnatura OTK ZU");
check(
    otk.pdfUrl === "https://otkzu.trybunal.gov.pl/downloadOTK?mpo=48945",
    "urzędowy PDF OTK ZU",
);
check(
    normalizeOtkZuReference("https://otkzu.trybunal.gov.pl/2026/a/96") ===
        "2026/A/96",
    "normalizacja referencji OTK ZU",
);

check(resolveSearchMode(undefined, undefined) === "auto", "domyślny tryb auto");
check(resolveSearchMode(undefined, true) === "full_text", "stary parametr true");
check(resolveSearchMode(undefined, false) === "metadata", "stary parametr false");
check(looksLikeAbbreviation("BGK"), "rozpoznawanie skrótu BGK");
check(
    shouldUseFullTextFallback("BGK", 2, 10),
    "mało metadanych uruchamia pełny tekst",
);
check(
    !shouldUseFullTextFallback("prawo do sądu", 50, 10),
    "wystarczające metadane pozostają szybkie",
);

const fakeResult = (documentId, signature) => ({
    documentId,
    signature,
    kind: "Wyrok",
    date: "2026-01-01",
    dateLabel: "2026-01-01",
    subject: "test",
    url: "https://ipo.trybunal.gov.pl/ipo/Sprawa?dokument=" + documentId,
});
const merged = mergeSearchResults(
    [fakeResult("1", "K 1/26"), fakeResult("2", "K 2/26")],
    [fakeResult("2", "K 2/26"), fakeResult("3", "K 3/26")],
    10,
);
check(
    merged.map((item) => item.documentId).join(",") === "1,2,3",
    "łączenie wyników usuwa duplikaty i zachowuje priorytet pełnego tekstu",
);

console.log("OK test:parse — " + checks + " asercji.");
