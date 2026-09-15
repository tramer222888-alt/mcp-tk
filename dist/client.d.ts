import { ParsedJudgment, SearchArea, SearchResult } from "./core.js";
export interface SearchWindow {
    results: SearchResult[];
    totalPages: number | null;
    totalResults: number | null;
}
export declare class IpoClient {
    private readonly cookies;
    private searchAction;
    private searchForm;
    private lastRequestAt;
    private throttle;
    private rememberCookies;
    private cookieHeader;
    private rawRequest;
    private request;
    openSession(): Promise<void>;
    private submit;
    private printPath;
    private collectWindow;
    search(options: {
        query: string;
        where: SearchArea;
        inflection: boolean;
        dateFrom?: string;
        dateTo?: string;
        subject?: string;
        pageNumber: number;
        pageSize: number;
    }): Promise<SearchWindow>;
    searchBySignature(signature: string, pageNumber: number, pageSize: number): Promise<SearchWindow>;
    listRecent(pageNumber: number, pageSize: number): Promise<SearchWindow>;
    crawlAll(onProgress?: (page: number, totalPages: number) => void): Promise<SearchResult[]>;
    getJudgment(documentId: string, caseId?: string): Promise<ParsedJudgment>;
}
//# sourceMappingURL=client.d.ts.map