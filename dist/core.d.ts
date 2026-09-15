export declare const ORIGIN = "https://ipo.trybunal.gov.pl";
export declare const IPO_BASE: string;
export declare const OTKZU_BASE = "https://otkzu.trybunal.gov.pl";
export declare const ISSUE_URL = "https://github.com/tramer222888-alt/mcp-tk/issues";
export declare const PORTAL_PAGE_SIZE = 25;
export declare const DEFAULT_CHUNK = 15000;
export declare const MIN_CHUNK = 500;
export declare const MAX_CHUNK = 50000;
export declare const SEARCH_FIELDS: {
    readonly phrase: "wyszukiwanie:tabView:szukajFrazaIT_1_input";
    readonly where: "wyszukiwanie:tabView:gdzieSzukaj_1_input";
    readonly inflection: "wyszukiwanie:tabView:odmianaSlow_1_input";
    readonly signature: "wyszukiwanie:tabView:sygnaturaComplete_input";
    readonly dateFrom: "wyszukiwanie:tabView:dataOd_input";
    readonly dateTo: "wyszukiwanie:tabView:dataDo_input";
    readonly subject: "wyszukiwanie:tabView:dotyczy_input";
    readonly activeIndex: "wyszukiwanie:tabView_activeIndex";
    readonly phraseButton: "wyszukiwanie:tabView:szukaj_button_tab1";
    readonly metadataButton: "wyszukiwanie:tabView:szukaj_button_tab2";
};
export declare const SEARCH_AREAS: {
    readonly wszedzie: "wyrok";
    readonly komparycja: "komparycja";
    readonly sentencja: "tenor";
    readonly uzasadnienie: "uzasadnienie";
    readonly historia: "uzasadninieCzescHistoryczna";
    readonly przed_rozprawa: "uzasadninieCzescPrzedRozprawa";
    readonly na_rozprawie: "uzasadninieCzescNaRozpawie";
    readonly ocena_prawna: "uzasadninieUzasadnieniePrawne";
    readonly zdanie_odrebne: "zdanieOdrebne";
};
export declare const SECTION_NAMES: readonly ["calosc", "sklad", "sentencja", "uzasadnienie", "stanowiska_uczestnikow", "ocena_trybunalu", "zdania_odrebne"];
export type SectionName = (typeof SECTION_NAMES)[number];
export type SearchArea = keyof typeof SEARCH_AREAS;
export declare class TkError extends Error {
    readonly code: "missing_arg" | "invalid_arg" | "not_found" | "upstream_error" | "api_changed";
    constructor(code: "missing_arg" | "invalid_arg" | "not_found" | "upstream_error" | "api_changed", message: string);
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
export declare function removeDiacritics(value: string): string;
export declare function decodeHtml(value: string): string;
export declare function stripHtml(fragment: string): string;
export declare function flattenHtml(fragment: string): string;
export declare function reflowText(fragment: string): string;
export declare function parsePolishDate(value: string): string;
export declare function assertIsoDate(value: unknown, name: string): string | undefined;
export declare function parseForm(html: string): {
    action: string;
    body: string;
};
export declare function parseSuccessfulControls(formBody: string): Map<string, string>;
export declare function safeIpoPath(raw: string): string;
export declare function cidFromAction(action: string): string;
export declare function validatePartialResponse(xml: string): void;
export declare function makeDetailUrl(documentId: string, caseId?: string): string;
export declare function parseSearchPage(html: string): SearchPage;
export declare function deriveOtkZuUrl(publication: string): string | undefined;
export declare function findSections(text: string): SectionInfo[];
export declare function parseJudgmentPage(html: string, documentId: string, caseId?: string): ParsedJudgment;
export declare function sliceContent(text: string, sections: SectionInfo[], sectionName?: SectionName, offset?: number, maxChars?: number): {
    chunk: string;
    start: number;
    end: number;
    total: number;
    sectionStart: number;
    sectionEnd: number;
    sectionLength: number;
    hasMore: boolean;
    nextOffset: number | null;
};
//# sourceMappingURL=core.d.ts.map