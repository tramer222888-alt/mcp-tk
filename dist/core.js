"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TkError = exports.SECTION_NAMES = exports.SEARCH_AREAS = exports.SEARCH_FIELDS = exports.MAX_CHUNK = exports.MIN_CHUNK = exports.DEFAULT_CHUNK = exports.PORTAL_PAGE_SIZE = exports.ISSUE_URL = exports.OTKZU_BASE = exports.IPO_BASE = exports.ORIGIN = void 0;
exports.removeDiacritics = removeDiacritics;
exports.decodeHtml = decodeHtml;
exports.stripHtml = stripHtml;
exports.flattenHtml = flattenHtml;
exports.reflowText = reflowText;
exports.parsePolishDate = parsePolishDate;
exports.assertIsoDate = assertIsoDate;
exports.parseForm = parseForm;
exports.parseSuccessfulControls = parseSuccessfulControls;
exports.safeIpoPath = safeIpoPath;
exports.cidFromAction = cidFromAction;
exports.validatePartialResponse = validatePartialResponse;
exports.makeDetailUrl = makeDetailUrl;
exports.parseSearchPage = parseSearchPage;
exports.deriveOtkZuUrl = deriveOtkZuUrl;
exports.findSections = findSections;
exports.parseJudgmentPage = parseJudgmentPage;
exports.sliceContent = sliceContent;
exports.ORIGIN = "https://ipo.trybunal.gov.pl";
exports.IPO_BASE = exports.ORIGIN + "/ipo";
exports.OTKZU_BASE = "https://otkzu.trybunal.gov.pl";
exports.ISSUE_URL = "https://github.com/tramer222888-alt/mcp-tk/issues";
exports.PORTAL_PAGE_SIZE = 25;
exports.DEFAULT_CHUNK = 15_000;
exports.MIN_CHUNK = 500;
exports.MAX_CHUNK = 50_000;
exports.SEARCH_FIELDS = {
    phrase: "wyszukiwanie:tabView:szukajFrazaIT_1_input",
    where: "wyszukiwanie:tabView:gdzieSzukaj_1_input",
    inflection: "wyszukiwanie:tabView:odmianaSlow_1_input",
    signature: "wyszukiwanie:tabView:sygnaturaComplete_input",
    dateFrom: "wyszukiwanie:tabView:dataOd_input",
    dateTo: "wyszukiwanie:tabView:dataDo_input",
    subject: "wyszukiwanie:tabView:dotyczy_input",
    activeIndex: "wyszukiwanie:tabView_activeIndex",
    phraseButton: "wyszukiwanie:tabView:szukaj_button_tab1",
    metadataButton: "wyszukiwanie:tabView:szukaj_button_tab2",
};
exports.SEARCH_AREAS = {
    wszedzie: "wyrok",
    komparycja: "komparycja",
    sentencja: "tenor",
    uzasadnienie: "uzasadnienie",
    historia: "uzasadninieCzescHistoryczna",
    przed_rozprawa: "uzasadninieCzescPrzedRozprawa",
    na_rozprawie: "uzasadninieCzescNaRozpawie",
    ocena_prawna: "uzasadninieUzasadnieniePrawne",
    zdanie_odrebne: "zdanieOdrebne",
};
exports.SECTION_NAMES = [
    "calosc",
    "sklad",
    "sentencja",
    "uzasadnienie",
    "stanowiska_uczestnikow",
    "ocena_trybunalu",
    "zdania_odrebne",
];
class TkError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "TkError";
    }
}
exports.TkError = TkError;
const MONTHS = {
    stycznia: 1,
    lutego: 2,
    marca: 3,
    kwietnia: 4,
    maja: 5,
    czerwca: 6,
    lipca: 7,
    sierpnia: 8,
    wrzesnia: 9,
    pazdziernika: 10,
    listopada: 11,
    grudnia: 12,
};
function removeDiacritics(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ł/g, "l")
        .replace(/Ł/g, "L");
}
function escapeRegExp(value) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
function decodeHtml(value) {
    const named = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: "\u00a0",
        quot: '"',
        ndash: "–",
        mdash: "—",
        hellip: "…",
        sect: "§",
        laquo: "«",
        raquo: "»",
        bull: "•",
        middot: "·",
        times: "×",
    };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole, entity) => {
        if (entity[0] === "#") {
            const hex = entity[1]?.toLowerCase() === "x";
            const raw = entity.slice(hex ? 2 : 1);
            const point = Number.parseInt(raw, hex ? 16 : 10);
            if (Number.isFinite(point) && point >= 0 && point <= 0x10ffff) {
                return String.fromCodePoint(point);
            }
            return whole;
        }
        return named[entity.toLowerCase()] ?? whole;
    });
}
function attr(tag, name) {
    const pattern = new RegExp("(?:^|\\s)" +
        escapeRegExp(name) +
        "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
    const match = tag.match(pattern);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3];
    return raw === undefined ? undefined : decodeHtml(raw);
}
function stripHtml(fragment) {
    if (!fragment)
        return "";
    let text = fragment
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n• ")
        .replace(/<\/(?:p|div|section|article|header|footer|tr|li|ul|ol|table|h[1-6])\s*>/gi, "\n\n")
        .replace(/<(?:p|div|section|article|header|footer|tr|ul|ol|table|h[1-6])\b[^>]*>/gi, "\n")
        .replace(/<td\b[^>]*>/gi, " ")
        .replace(/<\/td\s*>/gi, " ")
        .replace(/<[^>]+>/g, " ");
    text = decodeHtml(text)
        .replace(/\r\n?/g, "\n")
        .replace(/[\t\f\v\u00a0 ]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    return text.trim();
}
function flattenHtml(fragment) {
    return stripHtml(fragment).replace(/\s+/g, " ").trim();
}
function looksLikeStandaloneLine(line) {
    const plain = removeDiacritics(line);
    return (/^(?:Uzasadnienie|Sentencja|Orzeczenie|Postanowienie|Wyrok)$/i.test(plain) ||
        /^(?:[IVXLCDM]+|\d+|[a-z])[\.)]\s+/i.test(line) ||
        /^(?:o\s*r\s*z\s*e\s*k\s*a|p\s*o\s*s\s*t\s*a\s*n\s*a\s*w\s*i\s*a)\s*:?\s*$/i.test(plain) ||
        /^[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ \-–—]{5,}:?$/.test(line));
}
function reflowText(fragment) {
    const source = stripHtml(fragment);
    if (!source)
        return "";
    const output = [];
    let paragraph = [];
    const flush = () => {
        if (paragraph.length) {
            output.push(paragraph.join(" ").replace(/\s+/g, " ").trim());
            paragraph = [];
        }
    };
    for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (!line) {
            flush();
        }
        else if (looksLikeStandaloneLine(line)) {
            flush();
            output.push(line);
        }
        else {
            paragraph.push(line);
        }
    }
    flush();
    return output.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
function parsePolishDate(value) {
    const clean = removeDiacritics(flattenHtml(value)).toLowerCase();
    const iso = clean.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso)
        return iso[1] + "-" + iso[2] + "-" + iso[3];
    const numeric = clean.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/);
    if (numeric) {
        return numeric[3] + "-" + numeric[2].padStart(2, "0") + "-" + numeric[1].padStart(2, "0");
    }
    const polish = clean.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s*r\.?)?/);
    if (!polish)
        return "";
    const month = MONTHS[polish[2]];
    if (!month)
        return "";
    return polish[3] + "-" + String(month).padStart(2, "0") + "-" + polish[1].padStart(2, "0");
}
function assertIsoDate(value, name) {
    if (value === undefined || value === null || value === "")
        return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new TkError("invalid_arg", name + " musi mieć format RRRR-MM-DD.");
    }
    const date = new Date(value + "T00:00:00Z");
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
        throw new TkError("invalid_arg", name + " nie jest poprawną datą.");
    }
    return value;
}
function parseForm(html) {
    const match = html.match(/<form\b([^>]*\bid=(?:"wyszukiwanie"|'wyszukiwanie')[^>]*)>([\s\S]*?)<\/form\s*>/i);
    if (!match) {
        throw new TkError("api_changed", "Portal IPO zmienił formularz wyszukiwania (brak form#wyszukiwanie). Zgłoś: " + exports.ISSUE_URL);
    }
    const action = attr(match[1], "action");
    if (!action) {
        throw new TkError("api_changed", "Portal IPO zmienił formularz wyszukiwania (brak action). Zgłoś: " + exports.ISSUE_URL);
    }
    return { action, body: match[2] };
}
function parseSuccessfulControls(formBody) {
    const values = new Map();
    const inputRe = /<input\b[^>]*>/gi;
    let input;
    while ((input = inputRe.exec(formBody))) {
        const tag = input[0];
        const name = attr(tag, "name");
        if (!name || /\bdisabled(?:\s|=|>)/i.test(tag))
            continue;
        const type = (attr(tag, "type") ?? "text").toLowerCase();
        if (["submit", "button", "image", "file", "reset"].includes(type))
            continue;
        if ((type === "checkbox" || type === "radio") && !/\bchecked(?:\s|=|>)/i.test(tag))
            continue;
        values.set(name, attr(tag, "value") ?? (type === "checkbox" ? "on" : ""));
    }
    const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi;
    let select;
    while ((select = selectRe.exec(formBody))) {
        const name = attr(select[1], "name");
        if (!name)
            continue;
        const options = [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)];
        const chosen = options.find((option) => /\bselected(?:\s|=|>)/i.test(option[1])) ?? options[0];
        if (chosen)
            values.set(name, attr(chosen[1], "value") ?? flattenHtml(chosen[2]));
    }
    return values;
}
function safeIpoPath(raw) {
    const url = new URL(decodeHtml(raw), exports.ORIGIN);
    if (url.origin !== exports.ORIGIN || !url.pathname.startsWith("/ipo/")) {
        throw new TkError("api_changed", "Portal IPO zwrócił nieoczekiwany adres formularza. Zgłoś: " + exports.ISSUE_URL);
    }
    return url.pathname + url.search;
}
function cidFromAction(action) {
    return new URL(action, exports.ORIGIN).searchParams.get("cid") || "1";
}
function validatePartialResponse(xml) {
    if (!/<partial-response\b/i.test(xml) ||
        /<error\b|ViewExpiredException|javax\.faces\.application\.ViewExpired/i.test(xml)) {
        throw new TkError("api_changed", "Portal IPO nie zwrócił oczekiwanej odpowiedzi JSF. Zgłoś: " + exports.ISSUE_URL);
    }
}
function makeDetailUrl(documentId, caseId) {
    const query = new URLSearchParams({ cid: "1", dokument: documentId });
    if (caseId)
        query.set("sprawa", caseId);
    return exports.IPO_BASE + "/Sprawa?" + query.toString();
}
function parseSearchPage(html) {
    const rowRe = /href=["']\/ipo\/Sprawa\?([^"']*\bdokument=\d+[^"']*)["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*\bsygnatura\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>[\s\S]*?<\/a\s*>\s*<br\s*\/?>\s*([\s\S]*?)\s+z dnia\s+(\d{1,2}\s+[^\s<]+\s+\d{4})\s*r\./giu;
    const matches = [...html.matchAll(rowRe)];
    const results = [];
    const seen = new Set();
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const query = decodeHtml(match[1]).replace(/&amp;/g, "&");
        const params = new URLSearchParams(query);
        const documentId = params.get("dokument") ?? "";
        if (!documentId || seen.has(documentId))
            continue;
        seen.add(documentId);
        const caseId = params.get("sprawa") || undefined;
        const betweenStart = (match.index ?? 0) + match[0].length;
        const betweenEnd = index + 1 < matches.length ? matches[index + 1].index ?? html.length : html.length;
        const tail = html.slice(betweenStart, betweenEnd);
        const subjectMatch = tail.match(/<span\b[^>]*style=["'][^"']*font-style\s*:\s*italic[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i);
        const signature = flattenHtml(match[2]);
        const kind = flattenHtml(match[3]);
        const dateLabel = flattenHtml(match[4]);
        results.push({
            documentId,
            caseId,
            signature,
            kind,
            date: parsePolishDate(dateLabel),
            dateLabel,
            subject: subjectMatch ? flattenHtml(subjectMatch[1]) : "",
            url: makeDetailUrl(documentId, caseId),
        });
    }
    const flat = flattenHtml(html);
    const pager = flat.match(/Strona wyników:\s*(\d+)\s*z\s*(\d+)/i);
    const totalMatch = flat.match(/Liczba\s+(?:wyników|znalezionych dokumentów)\s*:\s*(\d[\d\s]*)/i);
    const recognizable = /Trybunał Konstytucyjny/i.test(html) &&
        /(Strona wyników|Wyniki wyszukiwania|Brak wyników|Nie znaleziono|Orzeczenia)/i.test(flat);
    if (!results.length && !recognizable) {
        throw new TkError("api_changed", "Struktura listy wyników IPO uległa zmianie. Zgłoś: " + exports.ISSUE_URL);
    }
    return {
        results,
        currentPage: pager ? Number(pager[1]) : results.length ? 1 : null,
        totalPages: pager ? Number(pager[2]) : results.length ? 1 : null,
        totalResults: totalMatch ? Number(totalMatch[1].replace(/\s/g, "")) : null,
    };
}
function findBalancedDiv(html, id) {
    const opener = new RegExp("<div\\b[^>]*\\bid=(?:\"" + escapeRegExp(id) + "\"|'" + escapeRegExp(id) + "')[^>]*>", "i").exec(html);
    if (!opener || opener.index === undefined)
        return undefined;
    const innerStart = opener.index + opener[0].length;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = innerStart;
    let depth = 1;
    let tag;
    while ((tag = tagRe.exec(html))) {
        depth += /^<\//.test(tag[0]) ? -1 : 1;
        if (depth === 0)
            return html.slice(innerStart, tag.index);
    }
    return undefined;
}
function normalizePropertyName(value) {
    return removeDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function propertyValue(properties, candidates) {
    const normalized = new Map(Object.entries(properties).map(([key, value]) => [normalizePropertyName(key), value]));
    for (const candidate of candidates) {
        const found = normalized.get(normalizePropertyName(candidate));
        if (found)
            return found;
    }
    return "";
}
function parseProperties(html) {
    const result = {};
    const propRe = /<div\b[^>]*class=["'][^"']*\bprop\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/gi;
    let prop;
    while ((prop = propRe.exec(html))) {
        const name = prop[1].match(/<span\b[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i);
        const value = prop[1].match(/<span\b[^>]*class=["'][^"']*\bvalue\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i);
        const key = name ? flattenHtml(name[1]).replace(/:$/, "").trim() : "";
        if (key)
            result[key] = value ? flattenHtml(value[1]) : "";
    }
    return result;
}
function deriveOtkZuUrl(publication) {
    const clean = flattenHtml(publication);
    let match = clean.match(/\bOTK\s*ZU\s*(?:nr\s*)?(\d+)\s*([AB])\s*\/\s*(\d{4})[\s\S]*?\bpoz\.?\s*(\d+)/i);
    if (match) {
        return exports.OTKZU_BASE + "/" + match[3] + "/" + match[1] + match[2].toUpperCase() + "/" + match[4];
    }
    match = clean.match(/\bOTK\s*ZU\s*([AB])\s*\/\s*(\d{4})[\s\S]*?\bpoz\.?\s*(\d+)/i);
    if (match) {
        return exports.OTKZU_BASE + "/" + match[2] + "/" + match[1].toUpperCase() + "/" + match[3];
    }
    match = clean.match(/\bOTK\s*ZU\s*(\d{4})\s*\/\s*([AB])\s*\/\s*(\d+)/i);
    if (match) {
        return exports.OTKZU_BASE + "/" + match[1] + "/" + match[2].toUpperCase() + "/" + match[3];
    }
    return undefined;
}
function indexOfPattern(text, pattern, from = 0) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const re = new RegExp(pattern.source, flags);
    re.lastIndex = from;
    return re.exec(text)?.index;
}
function findSections(text) {
    const total = text.length;
    const found = [
        { name: "calosc", label: "Całość dokumentu", start: 0, end: total },
    ];
    const composition = indexOfPattern(text, /Trybunał\s+Konstytucyjny\s+w\s+składzie\s*:/i);
    const operative = indexOfPattern(text, /(?:\bo\s*r\s*z\s*e\s*k\s*a\b|\borzeka\b|\bp\s*o\s*s\s*t\s*a\s*n\s*a\s*w\s*i\s*a\b|\bpostanawia\b)\s*:/i, composition ?? 0);
    const reasons = indexOfPattern(text, /(?:^|\n)\s*(?:U\s*z\s*a\s*s\s*a\s*d\s*n\s*i\s*e\s*n\s*i\s*e|UZASADNIENIE)\s*(?:\n|$)/im, operative ?? 0);
    const tribunal = indexOfPattern(text, /Trybunał\s+Konstytucyjny\s+zważył(?:,)?\s+co\s+następuje\s*:/i, reasons ?? 0);
    const dissent = indexOfPattern(text, /(?:^|\n)\s*Zdanie\s+odrębne\b/im, reasons ?? 0);
    if (composition !== undefined) {
        found.push({
            name: "sklad",
            label: "Skład orzekający",
            start: composition,
            end: operative ?? reasons ?? dissent ?? total,
        });
    }
    if (operative !== undefined) {
        found.push({
            name: "sentencja",
            label: "Sentencja / rozstrzygnięcie",
            start: operative,
            end: reasons ?? dissent ?? total,
        });
    }
    if (reasons !== undefined) {
        found.push({
            name: "uzasadnienie",
            label: "Uzasadnienie",
            start: reasons,
            end: dissent ?? total,
        });
        if (tribunal !== undefined && tribunal > reasons) {
            found.push({
                name: "stanowiska_uczestnikow",
                label: "Stanowiska uczestników i przebieg",
                start: reasons,
                end: tribunal,
            });
        }
    }
    if (tribunal !== undefined) {
        found.push({
            name: "ocena_trybunalu",
            label: "Ocena prawna Trybunału",
            start: tribunal,
            end: dissent ?? total,
        });
    }
    if (dissent !== undefined) {
        found.push({
            name: "zdania_odrebne",
            label: "Zdania odrębne",
            start: dissent,
            end: total,
        });
    }
    return found
        .filter((section) => (section.end ?? total) > section.start)
        .map((section) => ({
        name: section.name,
        label: section.label,
        start: section.start,
        end: section.end ?? total,
        length: (section.end ?? total) - section.start,
    }))
        .sort((left, right) => left.start - right.start || right.length - left.length);
}
function fallbackSignature(text) {
    const match = text.slice(0, 2500).match(/\b(?:[A-ZĄĆĘŁŃÓŚŹŻ]{1,5}(?:\/[A-ZĄĆĘŁŃÓŚŹŻ]{1,5})?)\s+\d+[a-z]?\s*\/\s*\d{2,4}\b/u);
    return match ? match[0].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ") : "";
}
function parseJudgmentPage(html, documentId, caseId) {
    const body = findBalancedDiv(html, "tekst_" + documentId);
    if (body === undefined) {
        if (/Trybunał Konstytucyjny/i.test(html) &&
            /(Brak (?:opublikowanej )?treści|dokument nie istnieje|nie znaleziono)/i.test(flattenHtml(html))) {
            throw new TkError("not_found", "Dokument " + documentId + " nie ma opublikowanej treści w IPO.");
        }
        throw new TkError("api_changed", "Nie znaleziono kontenera tekst_" + documentId + " na stronie dokumentu IPO. Zgłoś: " + exports.ISSUE_URL);
    }
    const text = reflowText(body);
    if (text.length < 30) {
        throw new TkError("not_found", "Dokument " + documentId + " nie zawiera użytecznej treści.");
    }
    const properties = parseProperties(html);
    const signature = propertyValue(properties, ["Sygnatura", "Sygnatura akt"]) || fallbackSignature(text);
    const kind = propertyValue(properties, ["Rodzaj orzeczenia", "Rodzaj dokumentu", "Typ orzeczenia"]) ||
        (text.match(/\b(Wyrok|Postanowienie|Uchwała)\b/i)?.[1] ?? "Orzeczenie");
    const rawDate = propertyValue(properties, ["Data wydania", "Data orzeczenia", "Data wydania orzeczenia"]) ||
        text.slice(0, 1000);
    const date = parsePolishDate(rawDate);
    const subject = propertyValue(properties, ["Dotyczy", "Przedmiot sprawy"]);
    const publication = propertyValue(properties, ["Miejsce publikacji", "Publikacja"]);
    const judges = [
        ...html.matchAll(/<a\b[^>]*href=["']\/ipo\/Szukaj\?sedzia=\d+["'][^>]*>([\s\S]*?)<\/a\s*>/gi),
    ]
        .map((match) => flattenHtml(match[1]))
        .filter(Boolean);
    const uniqueJudges = [...new Set(judges)].sort((a, b) => a.localeCompare(b, "pl"));
    const url = makeDetailUrl(documentId, caseId);
    return {
        documentId,
        caseId,
        signature,
        kind,
        date,
        subject,
        publication,
        judges: uniqueJudges,
        properties,
        text,
        sections: findSections(text),
        url,
        otkzuUrl: deriveOtkZuUrl(publication),
    };
}
function sliceContent(text, sections, sectionName, offset = 0, maxChars = exports.DEFAULT_CHUNK) {
    const section = sections.find((candidate) => candidate.name === (sectionName ?? "calosc")) ??
        (sectionName
            ? undefined
            : {
                name: "calosc",
                label: "Całość dokumentu",
                start: 0,
                end: text.length,
                length: text.length,
            });
    if (!section) {
        throw new TkError("not_found", "Sekcja „" + sectionName + "” nie została wykryta. Dostępne: " +
            sections.map((item) => item.name).join(", ") + ".");
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > section.length) {
        throw new TkError("invalid_arg", "offset musi być liczbą całkowitą 0–" + section.length + ".");
    }
    if (!Number.isInteger(maxChars) || maxChars < exports.MIN_CHUNK || maxChars > exports.MAX_CHUNK) {
        throw new TkError("invalid_arg", "maxChars musi być liczbą całkowitą " + exports.MIN_CHUNK + "–" + exports.MAX_CHUNK + ".");
    }
    const start = section.start + offset;
    const end = Math.min(start + maxChars, section.end);
    const hasMore = end < section.end;
    return {
        chunk: text.slice(start, end),
        start,
        end,
        total: text.length,
        sectionStart: section.start,
        sectionEnd: section.end,
        sectionLength: section.length,
        hasMore,
        nextOffset: hasMore ? end - section.start : null,
    };
}
//# sourceMappingURL=core.js.map