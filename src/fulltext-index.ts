import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { IndexPayload } from "./index-data.js";
import { SearchResult, TkError, removeDiacritics } from "./core.js";

const gunzipAsync = promisify(gunzip);

export interface FullTextIndexPayload {
    schema_version: number;
    generated_at: string;
    source: string;
    official: boolean;
    document_count: number;
    failed_document_count: number;
    document_ids: string[];
    terms: Record<string, number[]>;
}

let cached: Promise<FullTextIndexPayload | undefined> | undefined;

export function tokenize(value: string): string[] {
    return (
        removeDiacritics(value)
            .toLowerCase()
            .match(/[a-z0-9]+/g) ?? []
    ).filter((token) => token.length > 1 || /^\d$/.test(token));
}

function validate(payload: unknown): FullTextIndexPayload {
    if (
        !payload ||
        typeof payload !== "object" ||
        (payload as FullTextIndexPayload).schema_version !== 1 ||
        (payload as FullTextIndexPayload).official !== true ||
        !Array.isArray((payload as FullTextIndexPayload).document_ids) ||
        !(payload as FullTextIndexPayload).terms ||
        typeof (payload as FullTextIndexPayload).terms !== "object"
    ) {
        throw new TkError(
            "api_changed",
            "Lokalny indeks pełnotekstowy IPO ma nieznany format.",
        );
    }
    return payload as FullTextIndexPayload;
}

export async function loadFullTextIndex(): Promise<
    FullTextIndexPayload | undefined
> {
    if (cached) return cached;
    cached = (async () => {
        const configured = process.env.MCP_TK_FULLTEXT_INDEX;
        const candidates = [
            ...(configured ? [resolve(configured)] : []),
            resolve(__dirname, "../data/ipo-fulltext-index.json.gz"),
            resolve(process.cwd(), "data/ipo-fulltext-index.json.gz"),
        ];
        for (const path of [...new Set(candidates)]) {
            try {
                const compressed = await readFile(path);
                const json = await gunzipAsync(compressed);
                return validate(JSON.parse(json.toString("utf8")));
            } catch (error) {
                const code = (error as NodeJS.ErrnoException)?.code;
                if (code !== "ENOENT") throw error;
            }
        }
        return undefined;
    })();
    try {
        return await cached;
    } catch (error) {
        cached = undefined;
        throw error;
    }
}

function decodeDeltas(deltas: number[]): number[] {
    const result: number[] = [];
    let current = 0;
    for (const delta of deltas) {
        current += delta;
        result.push(current);
    }
    return result;
}

function inflectionPrefix(token: string): string | undefined {
    if (token.length < 6) return undefined;
    return token.slice(0, token.length >= 9 ? 6 : 5);
}

function postingsForToken(
    index: FullTextIndexPayload,
    token: string,
    inflection: boolean,
): Set<number> {
    const termNames = [token];
    const prefix = inflection ? inflectionPrefix(token) : undefined;
    if (prefix) {
        for (const candidate of Object.keys(index.terms)) {
            if (
                candidate !== token &&
                candidate.startsWith(prefix) &&
                Math.abs(candidate.length - token.length) <= 6
            ) {
                termNames.push(candidate);
            }
        }
    }
    const matches = new Set<number>();
    for (const term of termNames) {
        const deltas = index.terms[term];
        if (!Array.isArray(deltas)) continue;
        for (const ordinal of decodeDeltas(deltas)) matches.add(ordinal);
    }
    return matches;
}

export function searchFullTextIndex(
    fullText: FullTextIndexPayload,
    metadata: IndexPayload,
    options: {
        query: string;
        inflection: boolean;
        dateFrom?: string;
        dateTo?: string;
        kind?: string;
        pageNumber: number;
        pageSize: number;
    },
): {
    results: SearchResult[];
    totalResults: number;
    generatedAt: string;
} {
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
        if (!ordinals.length) break;
    }

    const records = new Map(
        metadata.records.map((record) => [record.document_id, record]),
    );
    const normalizedKind = options.kind
        ? removeDiacritics(options.kind).toLowerCase()
        : "";
    const matches = ordinals
        .map((ordinal) => records.get(fullText.document_ids[ordinal]))
        .filter((record): record is NonNullable<typeof record> => Boolean(record))
        .filter((record) => {
            if (options.dateFrom && record.date < options.dateFrom) return false;
            if (options.dateTo && record.date > options.dateTo) return false;
            if (
                normalizedKind &&
                !removeDiacritics(record.kind)
                    .toLowerCase()
                    .includes(normalizedKind)
            ) {
                return false;
            }
            return true;
        })
        .sort(
            (left, right) =>
                right.date.localeCompare(left.date) ||
                right.document_id.localeCompare(left.document_id),
        );
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
