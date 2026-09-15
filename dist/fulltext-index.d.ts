import { IndexPayload } from "./index-data.js";
import { SearchResult } from "./core.js";
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
export declare function tokenize(value: string): string[];
export declare function loadFullTextIndex(): Promise<FullTextIndexPayload | undefined>;
export declare function searchFullTextIndex(fullText: FullTextIndexPayload, metadata: IndexPayload, options: {
    query: string;
    inflection: boolean;
    dateFrom?: string;
    dateTo?: string;
    kind?: string;
    pageNumber: number;
    pageSize: number;
}): {
    results: SearchResult[];
    totalResults: number;
    generatedAt: string;
};
//# sourceMappingURL=fulltext-index.d.ts.map