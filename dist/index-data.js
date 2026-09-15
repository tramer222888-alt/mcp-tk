"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadIndex = loadIndex;
exports.searchIndex = searchIndex;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const core_js_1 = require("./core.js");
let cached;
function normalize(value) {
    return (0, core_js_1.removeDiacritics)(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function validate(payload) {
    if (!payload ||
        typeof payload !== "object" ||
        payload.schema_version !== 1 ||
        payload.official !== true ||
        !Array.isArray(payload.records)) {
        throw new core_js_1.TkError("api_changed", "Lokalny indeks IPO ma nieznany format. Zgłoś: " + core_js_1.ISSUE_URL);
    }
    const typed = payload;
    const broken = typed.records.some((record) => !record ||
        typeof record.document_id !== "string" ||
        typeof record.signature !== "string" ||
        typeof record.url !== "string");
    if (broken) {
        throw new core_js_1.TkError("api_changed", "Lokalny indeks IPO zawiera rekord o nieznanym formacie. Zgłoś: " +
            core_js_1.ISSUE_URL);
    }
    return typed;
}
async function loadIndex(fallback) {
    if (cached)
        return cached;
    cached = (async () => {
        const configured = process.env.MCP_TK_INDEX;
        const candidates = [
            ...(configured ? [(0, node_path_1.resolve)(configured)] : []),
            (0, node_path_1.resolve)(__dirname, "../data/ipo-index.json"),
            (0, node_path_1.resolve)(process.cwd(), "data/ipo-index.json"),
        ];
        let lastError;
        for (const path of [...new Set(candidates)]) {
            try {
                return validate(JSON.parse(await (0, promises_1.readFile)(path, "utf8")));
            }
            catch (error) {
                lastError = error;
                if (error instanceof core_js_1.TkError)
                    throw error;
            }
        }
        if (fallback) {
            const live = await fallback();
            return validate({
                schema_version: 1,
                generated_at: new Date().toISOString(),
                source: "https://ipo.trybunal.gov.pl/ipo/SzukajDrukuj?cid=1&page=0",
                official: true,
                record_count: live.length,
                records: live.map((item) => ({
                    document_id: item.documentId,
                    case_id: item.caseId ?? null,
                    signature: item.signature,
                    kind: item.kind,
                    date: item.date,
                    subject: item.subject,
                    url: item.url,
                })),
            });
        }
        throw new core_js_1.TkError("not_found", "Brak indeksu data/ipo-index.json. Uruchom npm run index. " +
            (lastError instanceof Error ? lastError.message : ""));
    })();
    try {
        return await cached;
    }
    catch (error) {
        cached = undefined;
        throw error;
    }
}
function searchIndex(index, options) {
    const query = normalize(options.query);
    const tokens = query.split(" ").filter(Boolean);
    const kind = options.kind ? normalize(options.kind) : "";
    const matches = index.records
        .map((record) => {
        if (options.dateFrom && record.date < options.dateFrom)
            return null;
        if (options.dateTo && record.date > options.dateTo)
            return null;
        if (kind && !normalize(record.kind).includes(kind))
            return null;
        const signature = normalize(record.signature);
        const subject = normalize(record.subject);
        const type = normalize(record.kind);
        const haystack = signature + " " + subject + " " + type;
        if (options.exactSignature) {
            if (signature.replace(/\s/g, "") !== query.replace(/\s/g, "")) {
                return null;
            }
            return { record, score: 10_000 };
        }
        if (!tokens.length || !tokens.every((token) => haystack.includes(token))) {
            return null;
        }
        let score = 0;
        if (signature === query)
            score += 5_000;
        if (subject === query)
            score += 1_000;
        if (subject.includes(query))
            score += 500;
        if (signature.includes(query))
            score += 400;
        for (const token of tokens) {
            if (subject.includes(token))
                score += 25;
            if (signature.includes(token))
                score += 20;
            if (type.includes(token))
                score += 5;
        }
        return { record, score };
    })
        .filter((item) => item !== null)
        .sort((left, right) => right.score - left.score ||
        right.record.date.localeCompare(left.record.date) ||
        right.record.document_id.localeCompare(left.record.document_id));
    const start = (options.pageNumber - 1) * options.pageSize;
    const results = matches
        .slice(start, start + options.pageSize)
        .map(({ record }) => ({
        documentId: record.document_id,
        caseId: record.case_id || undefined,
        signature: record.signature,
        kind: record.kind,
        date: record.date,
        dateLabel: record.date,
        subject: record.subject,
        url: record.url,
    }));
    return {
        results,
        totalResults: matches.length,
        generatedAt: index.generated_at,
    };
}
//# sourceMappingURL=index-data.js.map