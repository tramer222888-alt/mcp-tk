#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SearchResult } from "./core.js";
export type SearchMode = "auto" | "metadata" | "full_text";
export declare function resolveSearchMode(searchMode: unknown, searchInContent: unknown): SearchMode;
export declare function looksLikeAbbreviation(query: string): boolean;
export declare function shouldUseFullTextFallback(query: string, metadataTotal: number, pageSize: number): boolean;
export declare function mergeSearchResults(primary: SearchResult[], secondary: SearchResult[], limit: number): SearchResult[];
export declare function createServer(): Server;
export declare function runServer(): Promise<void>;
//# sourceMappingURL=index.d.ts.map