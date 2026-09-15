export interface ResolvedOtkZuReference {
    reference: string;
    url: string;
    pdfUrl?: string;
    documentId: string;
    caseId?: string;
    signature: string;
}
export declare function normalizeOtkZuReference(value: string): string | undefined;
export declare function parseOtkZuDetail(html: string, reference: string): ResolvedOtkZuReference;
export declare class OtkZuClient {
    resolve(value: string): Promise<ResolvedOtkZuReference>;
}
//# sourceMappingURL=otkzu.d.ts.map