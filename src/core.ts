export const ORIGIN = "https://ipo.trybunal.gov.pl";
export const IPO_BASE = ORIGIN + "/ipo";
export const OTKZU_BASE = "https://otkzu.trybunal.gov.pl";
export const ISSUE_URL = "https://github.com/tramer222888-alt/mcp-tk/issues";
export const PORTAL_PAGE_SIZE = 25;
export const DEFAULT_CHUNK = 15_000;
export const MIN_CHUNK = 500;
export const MAX_CHUNK = 50_000;

export const SEARCH_FIELDS = {
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
} as const;

export const SEARCH_AREAS = {
    wszedzie: "wyrok",
    komparycja: "komparycja",
    sentencja: "tenor",
    uzasadnienie: "uzasadnienie",
    historia: "uzasadninieCzescHistoryczna",
    przed_rozprawa: "uzasadninieCzescPrzedRozprawa",
    na_rozprawie: "uzasadninieCzescNaRozpawie",
    ocena_prawna: "uzasadninieUzasadnieniePrawne",
    zdanie_odrebne: "zdanieOdrebne",
} as const;

export const SECTION_NAMES = [
    "calosc",
    "sklad",
    "sentencja",
    "uzasadnienie",
    "stanowiska_uczestnikow",
    "ocena_trybunalu",
    "zdania_odrebne",
] as const;

export type SectionName = (typeof SECTION_NAMES)[number];
export type SearchArea = keyof typeof SEARCH_AREAS;

export class TkError extends Error {
    constructor(
        public readonly code:
            | "missing_arg"
            | "invalid_arg"
            | "not_found"
            | "upstream_error"
            | "api_changed",
        message: string,
    ) {
        super(message);
        this.name = "TkError";
    }
}

export interface SearchResult {
    documentId: string;
    caseId?: string;
    signature: string;
    kind: string;
    date: string;
    dateLabel: string;
    subject: string;
    url: string;
}

export interface SearchPage {
    results: SearchResult[];
    currentPage: number | null;
    totalPages: number | null;
    totalResults: number | null;
}

export interface SectionInfo {
    name: SectionName;
    label: string;
    start: number;
    end: number;
    length: number;
}

export interface ParsedJudgment {
    documentId: string;
    caseId?: string;
    signature: string;
    kind: string;
    date: string;
    subject: string;
    publication: string;
    judges: string[];
    properties: Record<string, string>;
    text: string;
    sections: SectionInfo[];
    url: string;
    otkzuUrl?: string;
}

const MONTHS: Record<string, number> = {
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

export function removeDiacritics(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ł/g, "l")
        .replace(/Ł/g, "L");
}

function escapeRegExp(value: string): string {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

export function decodeHtml(value: string): string {
    const named: Record<string, string> = {
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
    return value.replace(
        /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
        (whole, entity: string) => {
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
        },
    );
}

function attr(tag: string, name: string): string | undefined {
    const pattern = new RegExp(
        "(?:^|\\s)" +
            escapeRegExp(name) +
            "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
        "i",
    );
    const match = tag.match(pattern);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3];
    return raw === undefined ? undefined : decodeHtml(raw);
}

export function stripHtml(fragment: string): string {
    if (!fragment) return "";
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

export function flattenHtml(fragment: string): string {
    return stripHtml(fragment).replace(/\s+/g, " ").trim();
}

function looksLikeStandaloneLine(line: string): boolean {
    const plain = removeDiacritics(line);
    return (
        /^(?:Uzasadnienie|Sentencja|Orzeczenie|Postanowienie|Wyrok)$/i.test(plain) ||
        /^(?:[IVXLCDM]+|\d+|[a-z])[\.)]\s+/i.test(line) ||
        /^(?:o\s*r\s*z\s*e\s*k\s*a|p\s*o\s*s\s*t\s*a\s*n\s*a\s*w\s*i\s*a)\s*:?\s*$/i.test(
            plain,
        ) ||
        /^[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ \-–—]{5,}:?$/.test(line)
    );
}

export function reflowText(fragment: string): string {
    const source = stripHtml(fragment);
    if (!source) return "";
    const output: string[] = [];
    let paragraph: string[] = [];
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
        } else if (looksLikeStandaloneLine(line)) {
            flush();
            output.push(line);
        } else {
            paragraph.push(line);
        }
    }
    flush();
    return output.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parsePolishDate(value: string): string {
    const clean = removeDiacritics(flattenHtml(value)).toLowerCase();
    const iso = clean.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
    const numeric = clean.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/);
    if (numeric) {
        return numeric[3] + "-" + numeric[2].padStart(2, "0") + "-" + numeric[1].padStart(2, "0");
    }
    const polish = clean.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s*r\.?)?/);
    if (!polish) return "";
    const month = MONTHS[polish[2]];
    if (!month) return "";
    return polish[3] + "-" + String(month).padStart(2, "0") + "-" + polish[1].padStart(2, "0");
}

export function assertIsoDate(value: unknown, name: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new TkError("invalid_arg", name + " musi mieć format RRRR-MM-DD.");
    }
    const date = new Date(value + "T00:00:00Z");
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
        throw new TkError("invalid_arg", name + " nie jest poprawną datą.");
    }
    return value;
}

export function parseForm(html: string): { action: string; body: string } {
    const match = html.match(
        /<form\b([^>]*\bid=(?:"wyszukiwanie"|'wyszukiwanie')[^>]*)>([\s\S]*?)<\/form\s*>/i,
    );
    if (!match) {
        throw new TkError(
            "api_changed",
            "Portal IPO zmienił formularz wyszukiwania (brak form#wyszukiwanie). Zgłoś: " + ISSUE_URL,
        );
    }
    const action = attr(match[1], "action");
    if (!action) {
        throw new TkError(
            "api_changed",
            "Portal IPO zmienił formularz wyszukiwania (brak action). Zgłoś: " + ISSUE_URL,
        );
    }
    return { action, body: match[2] };
}

export function parseSuccessfulControls(formBody: string): Map<string, string> {
    const values = new Map<string, string>();
    const inputRe = /<input\b[^>]*>/gi;
    let input: RegExpExecArray | null;
    while ((input = inputRe.exec(formBody))) {
        const tag = input[0];
        const name = attr(tag, "name");
        if (!name || /\bdisabled(?:\s|=|>)/i.test(tag)) continue;
        const type = (attr(tag, "type") ?? "text").toLowerCase();
        if (["submit", "button", "image", "file", "reset"].includes(type)) continue;
        if ((type === "checkbox" || type === "radio") && !/\bchecked(?:\s|=|>)/i.test(tag)) continue;
        values.set(name, attr(tag, "value") ?? (type === "checkbox" ? "on" : ""));
    }
    const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi;
    let select: RegExpExecArray | null;
    while ((select = selectRe.exec(formBody))) {
        const name = attr(select[1], "name");
        if (!name) continue;
        const options = [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)];
        const chosen = options.find((option) => /\bselected(?:\s|=|>)/i.test(option[1])) ?? options[0];
        if (chosen) values.set(name, attr(chosen[1], "value") ?? flattenHtml(chosen[2]));
    }
    return values;
}

export function safeIpoPath(raw: string): string {
    const url = new URL(decodeHtml(raw), ORIGIN);
    if (url.origin !== ORIGIN || !url.pathname.startsWith("/ipo/")) {
        throw new TkError(
            "api_changed",
            "Portal IPO zwrócił nieoczekiwany adres formularza. Zgłoś: " + ISSUE_URL,
        );
    }
    return url.pathname + url.search;
}

export function cidFromAction(action: string): string {
    return new URL(action, ORIGIN).searchParams.get("cid") || "1";
}

export function validatePartialResponse(xml: string): void {
    if (
        !/<partial-response\b/i.test(xml) ||
        /<error\b|ViewExpiredException|javax\.faces\.application\.ViewExpired/i.test(xml)
    ) {
        throw new TkError(
            "api_changed",
            "Portal IPO nie zwrócił oczekiwanej odpowiedzi JSF. Zgłoś: " + ISSUE_URL,
        );
    }
}

export function makeDetailUrl(documentId: string, caseId?: string): string {
    const query = new URLSearchParams({ cid: "1", dokument: documentId });
    if (caseId) query.set("sprawa", caseId);
    return IPO_BASE + "/Sprawa?" + query.toString();
}

export function parseSearchPage(html: string): SearchPage {
    const rowRe =
        /href=["']\/ipo\/Sprawa\?([^"']*\bdokument=\d+[^"']*)["'][^>]*>[\s\S]*?<span\b[^>]*class=["'][^"']*\bsygnatura\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>[\s\S]*?<\/a\s*>\s*<br\s*\/?>\s*([\s\S]*?)\s+z dnia\s+(\d{1,2}\s+[^\s<]+\s+\d{4})\s*r\./giu;
    const matches = [...html.matchAll(rowRe)];
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const query = decodeHtml(match[1]).replace(/&amp;/g, "&");
        const params = new URLSearchParams(query);
        const documentId = params.get("dokument") ?? "";
        if (!documentId || seen.has(documentId)) continue;
        seen.add(documentId);
        const caseId = params.get("sprawa") || undefined;
        const betweenStart = (match.index ?? 0) + match[0].length;
        const betweenEnd =
            index + 1 < matches.length ? matches[index + 1].index ?? html.length : html.length;
        const tail = html.slice(betweenStart, betweenEnd);
        const subjectMatch = tail.match(
            /<span\b[^>]*style=["'][^"']*font-style\s*:\s*italic[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i,
        );
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
    const totalMatch = flat.match(
        /Liczba\s+(?:wyników|znalezionych dokumentów)\s*:\s*(\d[\d\s]*)/i,
    );
    const recognizable =
        /Trybunał Konstytucyjny/i.test(html) &&
        /(Strona wyników|Wyniki wyszukiwania|Brak wyników|Nie znaleziono|Orzeczenia)/i.test(flat);
    if (!results.length && !recognizable) {
        throw new TkError(
            "api_changed",
            "Struktura listy wyników IPO uległa zmianie. Zgłoś: " + ISSUE_URL,
        );
    }
    return {
        results,
        currentPage: pager ? Number(pager[1]) : results.length ? 1 : null,
        totalPages: pager ? Number(pager[2]) : results.length ? 1 : null,
        totalResults: totalMatch ? Number(totalMatch[1].replace(/\s/g, "")) : null,
    };
}

function findBalancedDiv(html: string, id: string): string | undefined {
    const opener = new RegExp(
        "<div\\b[^>]*\\bid=(?:\"" + escapeRegExp(id) + "\"|'" + escapeRegExp(id) + "')[^>]*>",
        "i",
    ).exec(html);
    if (!opener || opener.index === undefined) return undefined;
    const innerStart = opener.index + opener[0].length;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = innerStart;
    let depth = 1;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(html))) {
        depth += /^<\//.test(tag[0]) ? -1 : 1;
        if (depth === 0) return html.slice(innerStart, tag.index);
    }
    return undefined;
}

function normalizePropertyName(value: string): string {
    return removeDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function propertyValue(properties: Record<string, string>, candidates: string[]): string {
    const normalized = new Map(
        Object.entries(properties).map(([key, value]) => [normalizePropertyName(key), value]),
    );
    for (const candidate of candidates) {
        const found = normalized.get(normalizePropertyName(candidate));
        if (found) return found;
    }
    return "";
}

function parseProperties(html: string): Record<string, string> {
    const result: Record<string, string> = {};
    const propRe =
        /<div\b[^>]*class=["'][^"']*\bprop\b[^"']*["'][^>]*>([\s\S]*?)<\/div\s*>/gi;
    let prop: RegExpExecArray | null;
    while ((prop = propRe.exec(html))) {
        const name = prop[1].match(
            /<span\b[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i,
        );
        const value = prop[1].match(
            /<span\b[^>]*class=["'][^"']*\bvalue\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i,
        );
        const key = name ? flattenHtml(name[1]).replace(/:$/, "").trim() : "";
        if (key) result[key] = value ? flattenHtml(value[1]) : "";
    }
    return result;
}

export function deriveOtkZuUrl(publication: string): string | undefined {
    const clean = flattenHtml(publication);
    let match = clean.match(
        /\bOTK\s*ZU\s*(?:nr\s*)?(\d+)\s*([AB])\s*\/\s*(\d{4})[\s\S]*?\bpoz\.?\s*(\d+)/i,
    );
    if (match) {
        return OTKZU_BASE + "/" + match[3] + "/" + match[1] + match[2].toUpperCase() + "/" + match[4];
    }
    match = clean.match(/\bOTK\s*ZU\s*([AB])\s*\/\s*(\d{4})[\s\S]*?\bpoz\.?\s*(\d+)/i);
    if (match) {
        return OTKZU_BASE + "/" + match[2] + "/" + match[1].toUpperCase() + "/" + match[3];
    }
    match = clean.match(/\bOTK\s*ZU\s*(\d{4})\s*\/\s*([AB])\s*\/\s*(\d+)/i);
    if (match) {
        return OTKZU_BASE + "/" + match[1] + "/" + match[2].toUpperCase() + "/" + match[3];
    }
    return undefined;
}

function indexOfPattern(text: string, pattern: RegExp, from = 0): number | undefined {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const re = new RegExp(pattern.source, flags);
    re.lastIndex = from;
    return re.exec(text)?.index;
}

export function findSections(text: string): SectionInfo[] {
    const total = text.length;
    const found: Array<{ name: SectionName; label: string; start: number; end?: number }> = [
        { name: "calosc", label: "Całość dokumentu", start: 0, end: total },
    ];
    const composition = indexOfPattern(text, /Trybunał\s+Konstytucyjny\s+w\s+składzie\s*:/i);
    const operative = indexOfPattern(
        text,
        /(?:\bo\s*r\s*z\s*e\s*k\s*a\b|\borzeka\b|\bp\s*o\s*s\s*t\s*a\s*n\s*a\s*w\s*i\s*a\b|\bpostanawia\b)\s*:/i,
        composition ?? 0,
    );
    const reasons = indexOfPattern(
        text,
        /(?:^|\n)\s*(?:U\s*z\s*a\s*s\s*a\s*d\s*n\s*i\s*e\s*n\s*i\s*e|UZASADNIENIE)\s*(?:\n|$)/im,
        operative ?? 0,
    );
    const tribunal = indexOfPattern(
        text,
        /Trybunał\s+Konstytucyjny\s+zważył(?:,)?\s+co\s+następuje\s*:/i,
        reasons ?? 0,
    );
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

function fallbackSignature(text: string): string {
    const match = text.slice(0, 2500).match(
        /\b(?:[A-ZĄĆĘŁŃÓŚŹŻ]{1,5}(?:\/[A-ZĄĆĘŁŃÓŚŹŻ]{1,5})?)\s+\d+[a-z]?\s*\/\s*\d{2,4}\b/u,
    );
    return match ? match[0].replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ") : "";
}

export function parseJudgmentPage(
    html: string,
    documentId: string,
    caseId?: string,
): ParsedJudgment {
    const body = findBalancedDiv(html, "tekst_" + documentId);
    if (body === undefined) {
        if (
            /Trybunał Konstytucyjny/i.test(html) &&
            /(Brak (?:opublikowanej )?treści|dokument nie istnieje|nie znaleziono)/i.test(flattenHtml(html))
        ) {
            throw new TkError("not_found", "Dokument " + documentId + " nie ma opublikowanej treści w IPO.");
        }
        throw new TkError(
            "api_changed",
            "Nie znaleziono kontenera tekst_" + documentId + " na stronie dokumentu IPO. Zgłoś: " + ISSUE_URL,
        );
    }
    const text = reflowText(body);
    if (text.length < 30) {
        throw new TkError("not_found", "Dokument " + documentId + " nie zawiera użytecznej treści.");
    }
    const properties = parseProperties(html);
    const signature = propertyValue(properties, ["Sygnatura", "Sygnatura akt"]) || fallbackSignature(text);
    const kind =
        propertyValue(properties, ["Rodzaj orzeczenia", "Rodzaj dokumentu", "Typ orzeczenia"]) ||
        (text.match(/\b(Wyrok|Postanowienie|Uchwała)\b/i)?.[1] ?? "Orzeczenie");
    const rawDate =
        propertyValue(properties, ["Data wydania", "Data orzeczenia", "Data wydania orzeczenia"]) ||
        text.slice(0, 1000);
    const date = parsePolishDate(rawDate);
    const subject = propertyValue(properties, ["Dotyczy", "Przedmiot sprawy"]);
    const publication = propertyValue(properties, ["Miejsce publikacji", "Publikacja"]);
    const judges = [
        ...html.matchAll(
            /<a\b[^>]*href=["']\/ipo\/Szukaj\?sedzia=\d+["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
        ),
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

export function sliceContent(
    text: string,
    sections: SectionInfo[],
    sectionName?: SectionName,
    offset = 0,
    maxChars = DEFAULT_CHUNK,
): {
    chunk: string;
    start: number;
    end: number;
    total: number;
    sectionStart: number;
    sectionEnd: number;
    sectionLength: number;
    hasMore: boolean;
    nextOffset: number | null;
} {
    const section =
        sections.find((candidate) => candidate.name === (sectionName ?? "calosc")) ??
        (sectionName
            ? undefined
            : {
                  name: "calosc" as const,
                  label: "Całość dokumentu",
                  start: 0,
                  end: text.length,
                  length: text.length,
              });
    if (!section) {
        throw new TkError(
            "not_found",
            "Sekcja „" + sectionName + "” nie została wykryta. Dostępne: " +
                sections.map((item) => item.name).join(", ") + ".",
        );
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > section.length) {
        throw new TkError("invalid_arg", "offset musi być liczbą całkowitą 0–" + section.length + ".");
    }
    if (!Number.isInteger(maxChars) || maxChars < MIN_CHUNK || maxChars > MAX_CHUNK) {
        throw new TkError(
            "invalid_arg",
            "maxChars musi być liczbą całkowitą " + MIN_CHUNK + "–" + MAX_CHUNK + ".",
        );
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
