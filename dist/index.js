#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSearchMode = resolveSearchMode;
exports.looksLikeAbbreviation = looksLikeAbbreviation;
exports.shouldUseFullTextFallback = shouldUseFullTextFallback;
exports.mergeSearchResults = mergeSearchResults;
exports.createServer = createServer;
exports.runServer = runServer;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const core_js_1 = require("./core.js");
const client_js_1 = require("./client.js");
const index_data_js_1 = require("./index-data.js");
const otkzu_js_1 = require("./otkzu.js");
const AUTO_FULL_TEXT_RESULT_THRESHOLD = 20;
function resolveSearchMode(searchMode, searchInContent) {
    if (searchMode !== undefined &&
        searchMode !== "auto" &&
        searchMode !== "metadata" &&
        searchMode !== "full_text") {
        throw new core_js_1.TkError("invalid_arg", "searchMode musi mieć wartość auto, metadata albo full_text.");
    }
    if (searchInContent !== undefined &&
        typeof searchInContent !== "boolean") {
        throw new core_js_1.TkError("invalid_arg", "searchInContent musi być wartością boolean.");
    }
    // Nowy parametr ma pierwszeństwo. Stary pozostaje dla zgodności wstecznej.
    if (searchMode !== undefined)
        return searchMode;
    if (searchInContent === true)
        return "full_text";
    if (searchInContent === false)
        return "metadata";
    return "auto";
}
function looksLikeAbbreviation(query) {
    const compact = query.trim().replace(/[.\s-]+/g, "");
    return (compact.length >= 2 &&
        compact.length <= 12 &&
        /^[A-ZĄĆĘŁŃÓŚŹŻ0-9]+$/.test(compact) &&
        /[A-ZĄĆĘŁŃÓŚŹŻ]{2}/.test(compact));
}
function shouldUseFullTextFallback(query, metadataTotal, pageSize) {
    return (looksLikeAbbreviation(query) ||
        metadataTotal < Math.max(AUTO_FULL_TEXT_RESULT_THRESHOLD, pageSize));
}
function mergeSearchResults(primary, secondary, limit) {
    const unique = new Map();
    for (const item of [...primary, ...secondary]) {
        const key = item.documentId || item.url;
        if (!unique.has(key))
            unique.set(key, item);
    }
    return [...unique.values()].slice(0, limit);
}
function normalized(value) {
    return (0, core_js_1.removeDiacritics)(value).toLowerCase().replace(/\s+/g, " ").trim();
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function requiredString(args, name) {
    const value = args[name];
    if (typeof value !== "string" || !value.trim()) {
        throw new core_js_1.TkError("missing_arg", "Brak wymaganego parametru: " + name + ".");
    }
    return value.trim();
}
function positiveInt(args, name, fallback, minimum, maximum) {
    const value = args[name] ?? fallback;
    if (typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < minimum ||
        value > maximum) {
        throw new core_js_1.TkError("invalid_arg", name +
            " musi być liczbą całkowitą " +
            minimum +
            "–" +
            maximum +
            ".");
    }
    return value;
}
function resultFields(item) {
    return {
        document_id: item.documentId,
        case_id: item.caseId ?? null,
        signature: item.signature,
        kind: item.kind,
        date: item.date,
        subject: item.subject,
        url: item.url,
    };
}
function citationFor(item) {
    return {
        title: (item.kind || "Orzeczenie TK") +
            (item.signature ? " " + item.signature : "") +
            (item.date ? " z " + item.date : ""),
        url: item.url,
        signature: item.signature,
        date: item.date,
        author: "Trybunał Konstytucyjny",
        snippet: item.subject,
        doc_id: item.documentId,
        case_id: item.caseId ?? null,
    };
}
function citationForJudgment(judgment, chunk) {
    return {
        title: (judgment.kind || "Orzeczenie TK") +
            (judgment.signature ? " " + judgment.signature : "") +
            (judgment.date ? " z " + judgment.date : ""),
        url: judgment.otkzuUrl || judgment.url,
        signature: judgment.signature,
        date: judgment.date,
        author: "Trybunał Konstytucyjny",
        snippet: chunk.replace(/\s+/g, " ").slice(0, 700),
        doc_id: judgment.documentId,
        case_id: judgment.caseId ?? null,
    };
}
function formatResults(heading, results, pageNumber, pageSize, totalResults, note) {
    const lines = [
        "# " + heading,
        "",
        note,
        "Strona " +
            pageNumber +
            ", rozmiar " +
            pageSize +
            (totalResults === null
                ? "."
                : ", wszystkich dopasowań: " + totalResults + "."),
    ];
    if (!results.length) {
        lines.push("", "Brak wyników na tej stronie.");
        return lines.join("\n");
    }
    results.forEach((item, index) => {
        lines.push("", "## " + (index + 1) + ". " + (item.signature || "bez sygnatury"), "- Rodzaj: " + (item.kind || "brak danych"), "- Data: " + (item.date || item.dateLabel || "brak danych"), "- Dokument IPO: " + item.documentId, ...(item.caseId ? ["- Sprawa IPO: " + item.caseId] : []), ...(item.subject ? ["- Dotyczy: " + item.subject] : []), "- URL: " + item.url);
    });
    return lines.join("\n");
}
function errorResult(error) {
    const known = error instanceof core_js_1.TkError
        ? error
        : new core_js_1.TkError("upstream_error", error instanceof Error ? error.message : String(error));
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: "[" + known.code + "] " + known.message,
            },
        ],
        structuredContent: {
            error: { code: known.code, message: known.message },
            citations: [],
        },
    };
}
const tools = [
    {
        name: "search",
        description: "Wyszukuje orzeczenia TK. Domyślny searchMode=auto zaczyna od szybkich metadanych i przy małej liczbie trafień lub skrócie automatycznie rozszerza wyszukiwanie na pełną treść IPO. Dla kwerendy wyczerpującej użyj searchMode=full_text.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Fraza po polsku; w indeksie metadanych wszystkie słowa muszą wystąpić.",
                },
                searchMode: {
                    type: "string",
                    enum: ["auto", "metadata", "full_text"],
                    default: "auto",
                    description: "auto (zalecane): szybki indeks z automatycznym rozszerzeniem; metadata: tylko szybkie metadane; full_text: zawsze pełna treść IPO.",
                },
                searchInContent: {
                    type: "boolean",
                    description: "Parametr zgodności wstecznej: true odpowiada full_text, false odpowiada metadata. Przy nowych wywołaniach używaj searchMode.",
                },
                where: {
                    type: "string",
                    enum: Object.keys(core_js_1.SEARCH_AREAS),
                    default: "wszedzie",
                    description: "Dla searchInContent: wszedzie, komparycja, sentencja, uzasadnienie, historia, przed_rozprawa, na_rozprawie, ocena_prawna lub zdanie_odrebne.",
                },
                inflection: {
                    type: "boolean",
                    default: true,
                    description: "Dla searchInContent: uwzględniaj odmianę słów.",
                },
                dateFrom: {
                    type: "string",
                    description: "Data orzeczenia od, RRRR-MM-DD.",
                },
                dateTo: {
                    type: "string",
                    description: "Data orzeczenia do, RRRR-MM-DD.",
                },
                kind: {
                    type: "string",
                    description: "Dla indeksu: opcjonalny rodzaj, np. wyrok albo postanowienie.",
                },
                pageSize: {
                    type: "integer",
                    minimum: 1,
                    maximum: 50,
                    default: 10,
                },
                pageNumber: {
                    type: "integer",
                    minimum: 1,
                    default: 1,
                },
            },
            required: ["query"],
            additionalProperties: false,
        },
        annotations: {
            title: "Wyszukaj orzeczenia TK",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
    {
        name: "search_by_signature",
        description: "Wyszukuje po dokładnej sygnaturze TK, np. K 23/11 albo SK 45/09, w indeksie z oficjalnego IPO.",
        inputSchema: {
            type: "object",
            properties: {
                signature: { type: "string" },
                pageSize: {
                    type: "integer",
                    minimum: 1,
                    maximum: 50,
                    default: 10,
                },
                pageNumber: {
                    type: "integer",
                    minimum: 1,
                    default: 1,
                },
            },
            required: ["signature"],
            additionalProperties: false,
        },
        annotations: {
            title: "Szukaj po sygnaturze TK",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    },
    {
        name: "list_recent",
        description: "Pobiera na żywo najnowsze orzeczenia z oficjalnej listy IPO TK.",
        inputSchema: {
            type: "object",
            properties: {
                pageSize: {
                    type: "integer",
                    minimum: 1,
                    maximum: 50,
                    default: 10,
                },
                pageNumber: {
                    type: "integer",
                    minimum: 1,
                    default: 1,
                },
            },
            additionalProperties: false,
        },
        annotations: {
            title: "Najnowsze orzeczenia TK",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
    {
        name: "get_judgment",
        description: "Pobiera na żywo pełny tekst orzeczenia z oficjalnego IPO. id może być numerem dokumentu IPO albo pozycją OTK ZU, np. 2026/A/96. Obsługuje sekcje, offset i porcje 500–50 000 znaków.",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    pattern: "^(?:\\d+|\\d{4}\\/(?:[AB]|\\d+[AB])\\/\\d+)$",
                    description: "ID dokumentu IPO albo referencja OTK ZU RRRR/A/POZ.",
                },
                caseId: {
                    type: "string",
                    pattern: "^\\d+$",
                    description: "Opcjonalny ID sprawy IPO zwrócony przez wyszukiwanie.",
                },
                section: {
                    type: "string",
                    enum: core_js_1.SECTION_NAMES,
                    description: "calosc, sklad, sentencja, uzasadnienie, stanowiska_uczestnikow, ocena_trybunalu lub zdania_odrebne.",
                },
                offset: {
                    type: "integer",
                    minimum: 0,
                    default: 0,
                    description: "Przesunięcie od początku wybranej sekcji.",
                },
                maxChars: {
                    type: "integer",
                    minimum: core_js_1.MIN_CHUNK,
                    maximum: core_js_1.MAX_CHUNK,
                    default: core_js_1.DEFAULT_CHUNK,
                },
            },
            required: ["id"],
            additionalProperties: false,
        },
        annotations: {
            title: "Pobierz orzeczenie TK",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
];
function createServer() {
    const server = new index_js_1.Server({ name: "mcp-tk", version: "1.1.0" }, {
        capabilities: { tools: {} },
        instructions: "Do zwykłych kwerend tematycznych używaj search z searchMode=auto. Gdy użytkownik prosi o wszystkie możliwe trafienia, badanie wyczerpujące albo kontrolę kompletności, użyj searchMode=full_text. Wynik z samych metadanych nie dowodzi braku innych orzeczeń.",
    });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools }));
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        try {
            const args = (request.params.arguments ?? {});
            if (request.params.name === "search") {
                const query = requiredString(args, "query");
                if (query.length > 500) {
                    throw new core_js_1.TkError("invalid_arg", "query może mieć najwyżej 500 znaków.");
                }
                const pageNumber = positiveInt(args, "pageNumber", 1, 1, 10_000);
                const pageSize = positiveInt(args, "pageSize", 10, 1, 50);
                const dateFrom = (0, core_js_1.assertIsoDate)(args.dateFrom, "dateFrom");
                const dateTo = (0, core_js_1.assertIsoDate)(args.dateTo, "dateTo");
                if (dateFrom && dateTo && dateFrom > dateTo) {
                    throw new core_js_1.TkError("invalid_arg", "dateFrom nie może być późniejsze niż dateTo.");
                }
                const searchMode = resolveSearchMode(args.searchMode, args.searchInContent);
                if (searchMode === "full_text") {
                    const where = (args.where ?? "wszedzie");
                    if (!(where in core_js_1.SEARCH_AREAS)) {
                        throw new core_js_1.TkError("invalid_arg", "Nieznane pole where.");
                    }
                    const client = new client_js_1.IpoClient();
                    const result = await client.search({
                        query,
                        where,
                        inflection: args.inflection !== false,
                        dateFrom,
                        dateTo,
                        pageNumber,
                        pageSize,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: formatResults("Pełnotekstowe wyniki IPO: „" +
                                    query +
                                    "”", result.results, pageNumber, pageSize, result.totalResults, "Źródło: żywy formularz oficjalnego IPO TK."),
                            },
                        ],
                        structuredContent: {
                            citations: result.results.map(citationFor),
                            results: result.results.map(resultFields),
                            search_scope: "official_ipo_full_text_live",
                            query: {
                                text: query,
                                mode: searchMode,
                                where,
                                inflection: args.inflection !== false,
                                date_from: dateFrom ?? null,
                                date_to: dateTo ?? null,
                            },
                            page: {
                                number: pageNumber,
                                size: pageSize,
                                portal_total_pages: result.totalPages,
                                portal_total_results: result.totalResults,
                            },
                        },
                    };
                }
                const client = new client_js_1.IpoClient();
                const index = await (0, index_data_js_1.loadIndex)(() => client.crawlAll());
                const kind = typeof args.kind === "string" && args.kind.trim()
                    ? args.kind.trim()
                    : undefined;
                const result = (0, index_data_js_1.searchIndex)(index, {
                    query,
                    dateFrom,
                    dateTo,
                    kind,
                    pageNumber,
                    pageSize,
                });
                if (searchMode === "auto" &&
                    shouldUseFullTextFallback(query, result.totalResults, pageSize)) {
                    const where = (args.where ?? "wszedzie");
                    if (!(where in core_js_1.SEARCH_AREAS)) {
                        throw new core_js_1.TkError("invalid_arg", "Nieznane pole where.");
                    }
                    const inferredInflection = looksLikeAbbreviation(query)
                        ? false
                        : args.inflection !== false;
                    try {
                        const live = await client.search({
                            query,
                            where,
                            inflection: inferredInflection,
                            dateFrom,
                            dateTo,
                            pageNumber,
                            pageSize,
                        });
                        const fullTextResults = kind
                            ? live.results.filter((item) => normalized(item.kind).includes(normalized(kind)))
                            : live.results;
                        const merged = mergeSearchResults(fullTextResults, result.results, pageSize);
                        const totalResults = Math.max(live.totalResults ?? 0, result.totalResults, merged.length);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: formatResults("Hybrydowe wyniki TK: „" +
                                        query +
                                        "”", merged, pageNumber, pageSize, totalResults, "Tryb auto: indeks metadanych zwrócił " +
                                        result.totalResults +
                                        " trafień, więc kwerendę rozszerzono na pełną treść oficjalnego IPO. Wyniki pełnotekstowe mają pierwszeństwo; duplikaty usunięto."),
                                },
                            ],
                            structuredContent: {
                                citations: merged.map(citationFor),
                                results: merged.map(resultFields),
                                search_scope: "official_ipo_hybrid_auto",
                                index_generated_at: result.generatedAt,
                                query: {
                                    text: query,
                                    mode: searchMode,
                                    where,
                                    inflection: inferredInflection,
                                    date_from: dateFrom ?? null,
                                    date_to: dateTo ?? null,
                                    kind: kind ?? null,
                                },
                                page: {
                                    number: pageNumber,
                                    size: pageSize,
                                    metadata_total_results: result.totalResults,
                                    portal_total_pages: live.totalPages,
                                    portal_total_results: live.totalResults,
                                    merged_results_on_page: merged.length,
                                },
                            },
                        };
                    }
                    catch (error) {
                        const warning = "Pełnotekstowe IPO nie odpowiedziało: " +
                            errorMessage(error) +
                            " Zwracam szybkie metadane; dla ponownej próby użyj searchMode=full_text.";
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: formatResults("Wyniki TK: „" + query + "”", result.results, pageNumber, pageSize, result.totalResults, "Tryb auto — " + warning),
                                },
                            ],
                            structuredContent: {
                                citations: result.results.map(citationFor),
                                results: result.results.map(resultFields),
                                search_scope: "official_ipo_metadata_fallback",
                                index_generated_at: result.generatedAt,
                                warning,
                                query: {
                                    text: query,
                                    mode: searchMode,
                                    date_from: dateFrom ?? null,
                                    date_to: dateTo ?? null,
                                    kind: kind ?? null,
                                },
                                page: {
                                    number: pageNumber,
                                    size: pageSize,
                                    total_results: result.totalResults,
                                },
                            },
                        };
                    }
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: formatResults("Wyniki TK: „" + query + "”", result.results, pageNumber, pageSize, result.totalResults, "Zakres: oficjalne metadane IPO (sygnatura, rodzaj, data, „Dotyczy”). Indeks: " +
                                result.generatedAt +
                                "."),
                        },
                    ],
                    structuredContent: {
                        citations: result.results.map(citationFor),
                        results: result.results.map(resultFields),
                        search_scope: "official_ipo_metadata_index",
                        index_generated_at: result.generatedAt,
                        query: {
                            text: query,
                            mode: searchMode,
                            date_from: dateFrom ?? null,
                            date_to: dateTo ?? null,
                            kind: kind ?? null,
                        },
                        page: {
                            number: pageNumber,
                            size: pageSize,
                            total_results: result.totalResults,
                            total_pages: Math.ceil(result.totalResults / pageSize),
                        },
                    },
                };
            }
            if (request.params.name === "search_by_signature") {
                const signature = requiredString(args, "signature");
                const pageNumber = positiveInt(args, "pageNumber", 1, 1, 10_000);
                const pageSize = positiveInt(args, "pageSize", 10, 1, 50);
                const client = new client_js_1.IpoClient();
                const index = await (0, index_data_js_1.loadIndex)(() => client.crawlAll());
                const result = (0, index_data_js_1.searchIndex)(index, {
                    query: signature,
                    pageNumber,
                    pageSize,
                    exactSignature: true,
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: formatResults("Wyniki dla sygnatury „" + signature + "”", result.results, pageNumber, pageSize, result.totalResults, "Źródło: indeks oficjalnego IPO, " +
                                result.generatedAt +
                                "."),
                        },
                    ],
                    structuredContent: {
                        citations: result.results.map(citationFor),
                        results: result.results.map(resultFields),
                        signature,
                        search_scope: "official_ipo_metadata_index",
                        index_generated_at: result.generatedAt,
                        page: {
                            number: pageNumber,
                            size: pageSize,
                            total_results: result.totalResults,
                        },
                    },
                };
            }
            if (request.params.name === "list_recent") {
                const pageNumber = positiveInt(args, "pageNumber", 1, 1, 10_000);
                const pageSize = positiveInt(args, "pageSize", 10, 1, 50);
                const result = await new client_js_1.IpoClient().listRecent(pageNumber, pageSize);
                return {
                    content: [
                        {
                            type: "text",
                            text: formatResults("Najnowsze orzeczenia TK", result.results, pageNumber, pageSize, result.totalResults, "Źródło: żywa lista oficjalnego IPO TK."),
                        },
                    ],
                    structuredContent: {
                        citations: result.results.map(citationFor),
                        results: result.results.map(resultFields),
                        search_scope: "official_ipo_live_listing",
                        page: {
                            number: pageNumber,
                            size: pageSize,
                            portal_total_pages: result.totalPages,
                            portal_total_results: result.totalResults,
                        },
                    },
                };
            }
            if (request.params.name === "get_judgment") {
                const suppliedId = requiredString(args, "id");
                let documentId = suppliedId;
                let caseId = typeof args.caseId === "string" && args.caseId
                    ? args.caseId
                    : undefined;
                let otkzu;
                if (!/^\d+$/.test(suppliedId)) {
                    otkzu = await new otkzu_js_1.OtkZuClient().resolve(suppliedId);
                    documentId = otkzu.documentId;
                    caseId = otkzu.caseId;
                }
                if (!/^\d+$/.test(documentId)) {
                    throw new core_js_1.TkError("invalid_arg", "id musi być ID IPO albo referencją OTK ZU RRRR/A/POZ.");
                }
                if (caseId && !/^\d+$/.test(caseId)) {
                    throw new core_js_1.TkError("invalid_arg", "caseId musi być numerycznym ID sprawy IPO.");
                }
                const section = args.section === undefined
                    ? undefined
                    : args.section;
                if (section !== undefined &&
                    !core_js_1.SECTION_NAMES.includes(section)) {
                    throw new core_js_1.TkError("invalid_arg", "Nieznana sekcja. Dostępne: " +
                        core_js_1.SECTION_NAMES.join(", ") +
                        ".");
                }
                const offset = positiveInt(args, "offset", 0, 0, 10_000_000);
                const maxChars = positiveInt(args, "maxChars", core_js_1.DEFAULT_CHUNK, core_js_1.MIN_CHUNK, core_js_1.MAX_CHUNK);
                const judgment = await new client_js_1.IpoClient().getJudgment(documentId, caseId);
                if (otkzu)
                    judgment.otkzuUrl = otkzu.url;
                const range = (0, core_js_1.sliceContent)(judgment.text, judgment.sections, section, offset, maxChars);
                const map = judgment.sections.map((item) => ({
                    name: item.name,
                    label: item.label,
                    start: item.start,
                    end: item.end,
                    length: item.length,
                }));
                const fragment = range.hasMore
                    ? "\n\n[...] To FRAGMENT. Dalszy ciąg: get_judgment(" +
                        "id=\"" +
                        suppliedId +
                        "\", " +
                        (section ? "section=\"" + section + "\", " : "") +
                        "offset=" +
                        range.nextOffset +
                        ")."
                    : "";
                const output = [
                    "# " +
                        (judgment.kind || "Orzeczenie TK") +
                        " " +
                        (judgment.signature || "(bez sygnatury)"),
                    "",
                    "- Data: " + (judgment.date || "brak danych"),
                    "- Dokument IPO: " + judgment.documentId,
                    ...(judgment.caseId
                        ? ["- Sprawa IPO: " + judgment.caseId]
                        : []),
                    ...(judgment.subject
                        ? ["- Dotyczy: " + judgment.subject]
                        : []),
                    ...(judgment.publication
                        ? ["- Publikacja: " + judgment.publication]
                        : []),
                    "- URL IPO: " + judgment.url,
                    ...(judgment.otkzuUrl
                        ? ["- URL OTK ZU: " + judgment.otkzuUrl]
                        : []),
                    ...(otkzu?.pdfUrl
                        ? ["- PDF OTK ZU: " + otkzu.pdfUrl]
                        : []),
                    "",
                    "Treść: znaki " +
                        range.start +
                        "–" +
                        range.end +
                        " z " +
                        range.total +
                        (section ? " (sekcja: " + section + ")" : ""),
                    "",
                    range.chunk + fragment,
                ].join("\n");
                return {
                    content: [{ type: "text", text: output }],
                    structuredContent: {
                        citations: [
                            citationForJudgment(judgment, range.chunk),
                        ],
                        judgment: {
                            document_id: judgment.documentId,
                            case_id: judgment.caseId ?? null,
                            requested_id: suppliedId,
                            signature: judgment.signature,
                            kind: judgment.kind,
                            date: judgment.date,
                            subject: judgment.subject,
                            publication: judgment.publication,
                            judges: judgment.judges,
                            properties: judgment.properties,
                            url: judgment.url,
                            otkzu_url: judgment.otkzuUrl ?? null,
                            otkzu_pdf_url: otkzu?.pdfUrl ?? null,
                            content_chunk: range.chunk,
                            content_range: {
                                start: range.start,
                                end: range.end,
                                total: range.total,
                                section: section ?? "calosc",
                                section_start: range.sectionStart,
                                section_end: range.sectionEnd,
                                section_length: range.sectionLength,
                            },
                            has_more: range.hasMore,
                            next_offset: range.nextOffset,
                            sections: map,
                        },
                    },
                };
            }
            throw new core_js_1.TkError("not_found", "Nieznany tool: " + request.params.name + ".");
        }
        catch (error) {
            return errorResult(error);
        }
    });
    return server;
}
async function runServer() {
    await createServer().connect(new stdio_js_1.StdioServerTransport());
}
if (require.main === module) {
    runServer().catch((error) => {
        console.error("mcp-tk:", error);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=index.js.map