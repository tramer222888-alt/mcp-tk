#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export type SearchMode = "auto" | "metadata" | "full_text" | "live";
export declare function resolveSearchMode(searchMode: unknown, searchInContent: unknown): SearchMode;
export declare function looksLikeAbbreviation(query: string): boolean;
export declare function createServer(): Server;
export declare function runServer(): Promise<void>;
//# sourceMappingURL=index.d.ts.map