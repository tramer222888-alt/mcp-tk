import { SearchResult } from "./core.js";
export interface IndexRecord {
    document_id: string;
    case_id: string | null;
    signature: string;
    kind: string;
    date: string;
    subject: string;
    url: string;
}
export interface IndexPayload {
    schema_version: number;
    generated_at: string;
    source: string;
    official: boolean;
    record_count: number;
    records: IndexRecord[];
}
export declare function loadIndex(fallback?: () => Promise<SearchResult[]>): Promise<IndexPayload>;
export declare function searchIndex(index: IndexPayload, options: {
    query: string;
    dateFrom?: string;
    dateTo?: string;
    kind?: string;
    pageNumber: number;
    pageSize: number;
    exactSignature?: boolean;
}): {
    results: SearchResult[];
    totalResults: number;
    generatedAt: string;
};
//# sourceMappingURL=index-data.d.ts.map