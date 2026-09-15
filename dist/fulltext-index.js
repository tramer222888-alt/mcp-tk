"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenize = tokenize;
exports.loadFullTextIndex = loadFullTextIndex;
exports.searchFullTextIndex = searchFullTextIndex;
const promises_1 = require("node:fs/promises");
const node_zlib_1 = require("node:zlib");
const node_util_1 = require("node:util");
const node_path_1 = require("node:path");
const core_js_1 = require("./core.js");
const gunzipAsync = (0, node_util_1.promisify)(node_zlib_1.gunzip);
let cached;
function tokenize(value) {
    return ((0, core_js_1.removeDiacritics)(value)
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 1 || /^\d$/.test(token));
}
function validate(payload) {
    if (!payload ||
        typeof payload !== "object" ||
        payload.schema_version !== 1 ||
        payload.official !== true ||
        !Array.isArray(payload.document_ids) ||
        !payload.terms ||
        typeof payload.terms !== "object") {
        throw new core_js_1.TkError("api_changed", "Lokalny indeks pełnotekstowy IPO ma nieznany format.");
    }
    return payload;
}
async function loadFullTextIndex() {
    if (cached)
        return cached;
    cached = (async () => {
        const configured = process.env.MCP_TK_FULLTEXT_INDEX;
        const candidates = [
            ...(configured ? [(0, node_path_1.resolve)(configured)] : []),
            (0, node_path_1.resolve)(__dirname, "../data/ipo-fulltext-index.json.gz"),
            (0, node_path_1.resolve)(process.cwd(), "data/ipo-fulltext-index.json.gz"),
        ];
        for (const path of [...new Set(candidates)]) {
            try {
                const compressed = await (0, promises_1.readFile)(path);
                const json = await gunzipAsync(compressed);
                return validate(JSON.parse(json.toString("utf8")));
            }
            catch (error) {
                const code = error?.code;
                if (code !== "ENOENT")
                    throw error;
            }
        }
        return undefined;
    })();
    try {
        return await cached;
    }
    catch (error) {
        cached = undefined;
        throw error;
    }
}
function decodeDeltas(deltas) {
    const result = [];
    let current = 0;
    for (const delta of deltas) {
        current += delta;
        result.push(current);
    }
    return result;
}
function inflectionPrefix(token) {
    if (token.length < 6)
        return undefined;
    return token.slice(0, token.length >= 9 ? 6 : 5);
}
function postingsForToken(index, token, inflection) {
    const termNames = [token];
    const prefix = inflection ? inflectionPrefix(token) : undefined;
    if (prefix) {
        for (const candidate of Object.keys(index.terms)) {
            if (candidate !== token &&
                candidate.startsWith(prefix) &&
                Math.abs(candidate.length - token.length) <= 6) {
                termNames.push(candidate);
            }
        }
    }
    const matches = new Set();
    for (const term of termNames) {
        const deltas = index.terms[term];
        if (!Array.isArray(deltas))
            continue;
        for (const ordinal of decodeDeltas(deltas))
            matches.add(ordinal);
    }
    return matches;
}
function searchFullTextIndex(fullText, metadata, options) {
    const tokens = [...new Set(tokenize(options.query))];
    if (!tokens.length) {
        return { results: [], totalResults: 0, generatedAt: fullText.generated_at };
    }
    const postingSets = tokens
        .map((token) => postingsForToken(fullText, token, options.inflection))
        .sort((left, right) => left.size - right.size);
    if (!postingSets.length || postingSets[0].size === 0) {
        return { results: [], totalResults: 0, generatedAt: fullText.generated_at };
    }
    let ordinals = [...postingSets[0]];
    for (const postings of postingSets.slice(1)) {
        ordinals = ordinals.filter((ordinal) => postings.has(ordinal));
        if (!ordinals.length)
            break;
    }
    const records = new Map(metadata.records.map((record) => [record.document_id, record]));
    const normalizedKind = options.kind
        ? (0, core_js_1.removeDiacritics)(options.kind).toLowerCase()
        : "";
    const matches = ordinals
        .map((ordinal) => records.get(fullText.document_ids[ordinal]))
        .filter((record) => Boolean(record))
        .filter((record) => {
        if (options.dateFrom && record.date < options.dateFrom)
            return false;
        if (options.dateTo && record.date > options.dateTo)
            return false;
        if (normalizedKind &&
            !(0, core_js_1.removeDiacritics)(record.kind)
                .toLowerCase()
                .includes(normalizedKind)) {
            return false;
        }
        return true;
    })
        .sort((left, right) => right.date.localeCompare(left.date) ||
        right.document_id.localeCompare(left.document_id));
    const start = (options.pageNumber - 1) * options.pageSize;
    return {
        results: matches.slice(start, start + options.pageSize).map((record) => ({
            documentId: record.document_id,
            caseId: record.case_id || undefined,
            signature: record.signature,
            kind: record.kind,
            date: record.date,
            dateLabel: record.date,
            subject: record.subject,
            url: record.url,
        })),
        totalResults: matches.length,
        generatedAt: fullText.generated_at,
    };
}
//# sourceMappingURL=fulltext-index.js.map