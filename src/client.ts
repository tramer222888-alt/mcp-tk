import * as http2 from "node:http2";
import {
    ORIGIN,
    ISSUE_URL,
    PORTAL_PAGE_SIZE,
    SEARCH_AREAS,
    SEARCH_FIELDS,
    ParsedJudgment,
    SearchArea,
    SearchResult,
    TkError,
    cidFromAction,
    parseForm,
    parseJudgmentPage,
    parseSearchPage,
    parseSuccessfulControls,
    safeIpoPath,
    validatePartialResponse,
} from "./core.js";

const USER_AGENT =
    "mcp-tk/1.0 (+https://github.com/tramer222888-alt/mcp-tk; public legal research)";

interface HttpResponse {
    status: number;
    headers: http2.IncomingHttpHeaders;
    body: string;
}

export interface SearchWindow {
    results: SearchResult[];
    totalPages: number | null;
    totalResults: number | null;
}

export class IpoClient {
    private readonly cookies = new Map<string, string>();
    private searchAction = "/ipo/Szukaj?cid=1";
    private searchForm = "";
    private lastRequestAt = 0;

    private async throttle(): Promise<void> {
        const remaining = 400 - (Date.now() - this.lastRequestAt);
        if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        this.lastRequestAt = Date.now();
    }

    private rememberCookies(headers: http2.IncomingHttpHeaders): void {
        const header = headers["set-cookie"];
        const values = Array.isArray(header)
            ? header
            : typeof header === "string"
              ? [header]
              : [];
        for (const cookie of values) {
            const first = cookie.split(";", 1)[0];
            const split = first.indexOf("=");
            if (split > 0) {
                this.cookies.set(first.slice(0, split), first.slice(split + 1));
            }
        }
    }

    private cookieHeader(): string {
        return [...this.cookies.entries()]
            .map(([name, value]) => name + "=" + value)
            .join("; ");
    }

    private rawRequest(
        path: string,
        method: "GET" | "POST",
        body: string | undefined,
        timeoutMs: number,
    ): Promise<HttpResponse> {
        return new Promise((resolve, reject) => {
            const client = http2.connect(ORIGIN);
            let settled = false;
            let timer: NodeJS.Timeout | undefined;
            let responseHeaders: http2.IncomingHttpHeaders = {};
            let responseBody = "";

            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                try {
                    client.close();
                } catch {
                    // The connection is already closed.
                }
                reject(error);
            };

            client.on("error", fail);
            const headers: http2.OutgoingHttpHeaders = {
                ":method": method,
                ":path": path,
                ":scheme": "https",
                ":authority": "ipo.trybunal.gov.pl",
                "user-agent": USER_AGENT,
                accept:
                    method === "POST"
                        ? "application/xml, text/xml, */*; q=0.01"
                        : "text/html,application/xhtml+xml",
                "accept-language": "pl-PL,pl;q=0.9,en;q=0.5",
            };
            const cookie = this.cookieHeader();
            if (cookie) headers.cookie = cookie;
            if (body !== undefined) {
                headers["content-type"] =
                    "application/x-www-form-urlencoded; charset=UTF-8";
                headers["content-length"] = Buffer.byteLength(body);
                headers["faces-request"] = "partial/ajax";
                headers["x-requested-with"] = "XMLHttpRequest";
                headers.referer = ORIGIN + this.searchAction;
            }

            const request = client.request(headers);
            request.setEncoding("utf8");
            request.on("response", (incoming) => {
                responseHeaders = incoming;
                this.rememberCookies(incoming);
            });
            request.on("data", (chunk: string) => {
                responseBody += chunk;
            });
            request.on("error", fail);
            request.on("end", () => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                client.close();
                resolve({
                    status: Number(responseHeaders[":status"] ?? 0),
                    headers: responseHeaders,
                    body: responseBody,
                });
            });

            timer = setTimeout(() => {
                request.close(http2.constants.NGHTTP2_CANCEL);
                fail(
                    new Error(
                        "timeout po " + Math.round(timeoutMs / 1000) + " s",
                    ),
                );
            }, timeoutMs);
            request.end(body);
        });
    }

    private async request(
        path: string,
        method: "GET" | "POST" = "GET",
        body?: string,
        timeoutMs = 60_000,
    ): Promise<string> {
        let currentPath = safeIpoPath(path);
        let lastError = "";
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                await this.throttle();
                let response = await this.rawRequest(
                    currentPath,
                    method,
                    body,
                    timeoutMs,
                );
                for (let redirects = 0; redirects < 3; redirects += 1) {
                    if (
                        response.status < 300 ||
                        response.status >= 400 ||
                        !response.headers.location
                    ) {
                        break;
                    }
                    currentPath = safeIpoPath(
                        Array.isArray(response.headers.location)
                            ? response.headers.location[0]
                            : response.headers.location,
                    );
                    await this.throttle();
                    response = await this.rawRequest(
                        currentPath,
                        "GET",
                        undefined,
                        timeoutMs,
                    );
                }
                if (response.status >= 200 && response.status < 300) {
                    return response.body;
                }
                lastError = "HTTP " + response.status;
                if (
                    response.status !== 429 &&
                    (response.status < 500 || response.status > 599)
                ) {
                    break;
                }
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
            if (attempt < 2) {
                await new Promise((resolve) =>
                    setTimeout(resolve, 750 * attempt),
                );
            }
        }
        throw new TkError(
            "upstream_error",
            "Oficjalny portal IPO nie odpowiedział poprawnie (" +
                lastError +
                "). Spróbuj ponownie później.",
        );
    }

    async openSession(): Promise<void> {
        if (this.searchForm) return;
        await this.request("/ipo/");
        const html = await this.request("/ipo/Szukaj?cid=1");
        if (
            !html.includes(SEARCH_FIELDS.phrase) ||
            !html.includes(SEARCH_FIELDS.signature) ||
            !/javax\.faces\.ViewState/i.test(html) ||
            !/SzukajDrukuj/i.test(html)
        ) {
            throw new TkError(
                "api_changed",
                "Portal IPO zmienił kontrakt formularza. Zgłoś: " + ISSUE_URL,
            );
        }
        const form = parseForm(html);
        this.searchAction = safeIpoPath(form.action);
        this.searchForm = form.body;
    }

    private async submit(
        mode: "phrase" | "metadata",
        values: Record<string, string | undefined>,
        inflection = true,
    ): Promise<void> {
        await this.openSession();
        const controls = parseSuccessfulControls(this.searchForm);
        const source =
            mode === "phrase"
                ? SEARCH_FIELDS.phraseButton
                : SEARCH_FIELDS.metadataButton;

        for (const [name, value] of Object.entries(values)) {
            if (value === undefined || value === "") controls.delete(name);
            else controls.set(name, value);
        }
        if (mode === "phrase") {
            controls.set(SEARCH_FIELDS.where, values[SEARCH_FIELDS.where] || "wyrok");
            if (inflection) controls.set(SEARCH_FIELDS.inflection, "on");
            else controls.delete(SEARCH_FIELDS.inflection);
        }
        controls.set(SEARCH_FIELDS.activeIndex, mode === "phrase" ? "0" : "1");
        controls.set("javax.faces.partial.ajax", "true");
        controls.set("javax.faces.source", source);
        controls.set("javax.faces.partial.execute", "wyszukiwanie");
        controls.set("javax.faces.partial.render", "wyszukiwanie filtr");
        controls.set(source, source);
        controls.set("wyszukiwanie", "wyszukiwanie");

        if (!controls.has("javax.faces.ViewState")) {
            throw new TkError(
                "api_changed",
                "Portal IPO nie udostępnił ViewState. Zgłoś: " + ISSUE_URL,
            );
        }
        const response = await this.request(
            this.searchAction,
            "POST",
            new URLSearchParams([...controls.entries()]).toString(),
            120_000,
        );
        validatePartialResponse(response);
    }

    private printPath(page: number): string {
        return (
            "/ipo/SzukajDrukuj?" +
            new URLSearchParams({
                cid: cidFromAction(this.searchAction),
                page: String(page),
            }).toString()
        );
    }

    private async collectWindow(
        pageNumber: number,
        pageSize: number,
    ): Promise<SearchWindow> {
        const firstIndex = (pageNumber - 1) * pageSize;
        const lastExclusive = firstIndex + pageSize;
        const firstPortalPage = Math.floor(firstIndex / PORTAL_PAGE_SIZE);
        const lastPortalPage = Math.floor(
            Math.max(firstIndex, lastExclusive - 1) / PORTAL_PAGE_SIZE,
        );
        const collected: SearchResult[] = [];
        let totalPages: number | null = null;
        let totalResults: number | null = null;

        for (
            let portalPage = firstPortalPage;
            portalPage <= lastPortalPage;
            portalPage += 1
        ) {
            const parsed = parseSearchPage(
                await this.request(this.printPath(portalPage)),
            );
            collected.push(...parsed.results);
            totalPages = parsed.totalPages ?? totalPages;
            totalResults = parsed.totalResults ?? totalResults;
            if (!parsed.results.length) break;
        }
        const localStart = firstIndex - firstPortalPage * PORTAL_PAGE_SIZE;
        return {
            results: collected.slice(localStart, localStart + pageSize),
            totalPages,
            totalResults,
        };
    }

    async search(options: {
        query: string;
        where: SearchArea;
        inflection: boolean;
        dateFrom?: string;
        dateTo?: string;
        subject?: string;
        pageNumber: number;
        pageSize: number;
    }): Promise<SearchWindow> {
        await this.submit(
            "phrase",
            {
                [SEARCH_FIELDS.phrase]: options.query,
                [SEARCH_FIELDS.where]: SEARCH_AREAS[options.where],
                [SEARCH_FIELDS.dateFrom]: options.dateFrom,
                [SEARCH_FIELDS.dateTo]: options.dateTo,
                [SEARCH_FIELDS.subject]: options.subject,
            },
            options.inflection,
        );
        return this.collectWindow(options.pageNumber, options.pageSize);
    }

    async searchBySignature(
        signature: string,
        pageNumber: number,
        pageSize: number,
    ): Promise<SearchWindow> {
        await this.submit("metadata", {
            [SEARCH_FIELDS.signature]: signature,
        });
        return this.collectWindow(pageNumber, pageSize);
    }

    async listRecent(
        pageNumber: number,
        pageSize: number,
    ): Promise<SearchWindow> {
        await this.openSession();
        return this.collectWindow(pageNumber, pageSize);
    }

    async crawlAll(
        onProgress?: (page: number, totalPages: number) => void,
    ): Promise<SearchResult[]> {
        await this.openSession();
        const first = parseSearchPage(await this.request(this.printPath(0)));
        if (!first.results.length || !first.totalPages) {
            throw new TkError(
                "api_changed",
                "IPO nie zwróciło pełnej listy ani pagera. Zgłoś: " + ISSUE_URL,
            );
        }
        if (first.totalPages > 1_000) {
            throw new TkError(
                "api_changed",
                "Nieoczekiwana liczba stron IPO: " + first.totalPages + ".",
            );
        }
        const results = [...first.results];
        onProgress?.(1, first.totalPages);
        for (let page = 1; page < first.totalPages; page += 1) {
            const parsed = parseSearchPage(
                await this.request(this.printPath(page)),
            );
            results.push(...parsed.results);
            onProgress?.(page + 1, first.totalPages);
        }
        const unique = new Map<string, SearchResult>();
        for (const result of results) unique.set(result.documentId, result);
        return [...unique.values()];
    }

    async getJudgment(
        documentId: string,
        caseId?: string,
    ): Promise<ParsedJudgment> {
        await this.openSession();
        const params = new URLSearchParams({
            cid: cidFromAction(this.searchAction),
            dokument: documentId,
        });
        if (caseId) params.set("sprawa", caseId);
        const html = await this.request("/ipo/Sprawa?" + params.toString());
        return parseJudgmentPage(html, documentId, caseId);
    }
}
