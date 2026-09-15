"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpoClient = void 0;
const http2 = __importStar(require("node:http2"));
const core_js_1 = require("./core.js");
const USER_AGENT = "mcp-tk/1.0 (+https://github.com/tramer222888-alt/mcp-tk; public legal research)";
class IpoClient {
    cookies = new Map();
    searchAction = "/ipo/Szukaj?cid=1";
    searchForm = "";
    lastRequestAt = 0;
    async throttle() {
        const remaining = 400 - (Date.now() - this.lastRequestAt);
        if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        this.lastRequestAt = Date.now();
    }
    rememberCookies(headers) {
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
    cookieHeader() {
        return [...this.cookies.entries()]
            .map(([name, value]) => name + "=" + value)
            .join("; ");
    }
    rawRequest(path, method, body, timeoutMs) {
        return new Promise((resolve, reject) => {
            const client = http2.connect(core_js_1.ORIGIN);
            let settled = false;
            let timer;
            let responseHeaders = {};
            let responseBody = "";
            const fail = (error) => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                try {
                    client.close();
                }
                catch {
                    // The connection is already closed.
                }
                reject(error);
            };
            client.on("error", fail);
            const headers = {
                ":method": method,
                ":path": path,
                ":scheme": "https",
                ":authority": "ipo.trybunal.gov.pl",
                "user-agent": USER_AGENT,
                accept: method === "POST"
                    ? "application/xml, text/xml, */*; q=0.01"
                    : "text/html,application/xhtml+xml",
                "accept-language": "pl-PL,pl;q=0.9,en;q=0.5",
            };
            const cookie = this.cookieHeader();
            if (cookie)
                headers.cookie = cookie;
            if (body !== undefined) {
                headers["content-type"] =
                    "application/x-www-form-urlencoded; charset=UTF-8";
                headers["content-length"] = Buffer.byteLength(body);
                headers["faces-request"] = "partial/ajax";
                headers["x-requested-with"] = "XMLHttpRequest";
                headers.referer = core_js_1.ORIGIN + this.searchAction;
            }
            const request = client.request(headers);
            request.setEncoding("utf8");
            request.on("response", (incoming) => {
                responseHeaders = incoming;
                this.rememberCookies(incoming);
            });
            request.on("data", (chunk) => {
                responseBody += chunk;
            });
            request.on("error", fail);
            request.on("end", () => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                client.close();
                resolve({
                    status: Number(responseHeaders[":status"] ?? 0),
                    headers: responseHeaders,
                    body: responseBody,
                });
            });
            timer = setTimeout(() => {
                request.close(http2.constants.NGHTTP2_CANCEL);
                fail(new Error("timeout po " + Math.round(timeoutMs / 1000) + " s"));
            }, timeoutMs);
            request.end(body);
        });
    }
    async request(path, method = "GET", body, timeoutMs = 60_000) {
        let currentPath = (0, core_js_1.safeIpoPath)(path);
        let lastError = "";
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                await this.throttle();
                let response = await this.rawRequest(currentPath, method, body, timeoutMs);
                for (let redirects = 0; redirects < 3; redirects += 1) {
                    if (response.status < 300 ||
                        response.status >= 400 ||
                        !response.headers.location) {
                        break;
                    }
                    currentPath = (0, core_js_1.safeIpoPath)(Array.isArray(response.headers.location)
                        ? response.headers.location[0]
                        : response.headers.location);
                    await this.throttle();
                    response = await this.rawRequest(currentPath, "GET", undefined, timeoutMs);
                }
                if (response.status >= 200 && response.status < 300) {
                    return response.body;
                }
                lastError = "HTTP " + response.status;
                if (response.status !== 429 &&
                    (response.status < 500 || response.status > 599)) {
                    break;
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
            }
        }
        throw new core_js_1.TkError("upstream_error", "Oficjalny portal IPO nie odpowiedział poprawnie (" +
            lastError +
            "). Spróbuj ponownie później.");
    }
    async openSession() {
        if (this.searchForm)
            return;
        await this.request("/ipo/");
        const html = await this.request("/ipo/Szukaj?cid=1");
        if (!html.includes(core_js_1.SEARCH_FIELDS.phrase) ||
            !html.includes(core_js_1.SEARCH_FIELDS.signature) ||
            !/javax\.faces\.ViewState/i.test(html) ||
            !/SzukajDrukuj/i.test(html)) {
            throw new core_js_1.TkError("api_changed", "Portal IPO zmienił kontrakt formularza. Zgłoś: " + core_js_1.ISSUE_URL);
        }
        const form = (0, core_js_1.parseForm)(html);
        this.searchAction = (0, core_js_1.safeIpoPath)(form.action);
        this.searchForm = form.body;
    }
    async submit(mode, values, inflection = true) {
        await this.openSession();
        const controls = (0, core_js_1.parseSuccessfulControls)(this.searchForm);
        const source = mode === "phrase"
            ? core_js_1.SEARCH_FIELDS.phraseButton
            : core_js_1.SEARCH_FIELDS.metadataButton;
        for (const [name, value] of Object.entries(values)) {
            if (value === undefined || value === "")
                controls.delete(name);
            else
                controls.set(name, value);
        }
        if (mode === "phrase") {
            controls.set(core_js_1.SEARCH_FIELDS.where, values[core_js_1.SEARCH_FIELDS.where] || "wyrok");
            if (inflection)
                controls.set(core_js_1.SEARCH_FIELDS.inflection, "on");
            else
                controls.delete(core_js_1.SEARCH_FIELDS.inflection);
        }
        controls.set(core_js_1.SEARCH_FIELDS.activeIndex, mode === "phrase" ? "0" : "1");
        controls.set("javax.faces.partial.ajax", "true");
        controls.set("javax.faces.source", source);
        controls.set("javax.faces.partial.execute", "wyszukiwanie");
        controls.set("javax.faces.partial.render", "wyszukiwanie filtr");
        controls.set(source, source);
        controls.set("wyszukiwanie", "wyszukiwanie");
        if (!controls.has("javax.faces.ViewState")) {
            throw new core_js_1.TkError("api_changed", "Portal IPO nie udostępnił ViewState. Zgłoś: " + core_js_1.ISSUE_URL);
        }
        const response = await this.request(this.searchAction, "POST", new URLSearchParams([...controls.entries()]).toString(), 120_000);
        (0, core_js_1.validatePartialResponse)(response);
    }
    printPath(page) {
        return ("/ipo/SzukajDrukuj?" +
            new URLSearchParams({
                cid: (0, core_js_1.cidFromAction)(this.searchAction),
                page: String(page),
            }).toString());
    }
    async collectWindow(pageNumber, pageSize) {
        const firstIndex = (pageNumber - 1) * pageSize;
        const lastExclusive = firstIndex + pageSize;
        const firstPortalPage = Math.floor(firstIndex / core_js_1.PORTAL_PAGE_SIZE);
        const lastPortalPage = Math.floor(Math.max(firstIndex, lastExclusive - 1) / core_js_1.PORTAL_PAGE_SIZE);
        const collected = [];
        let totalPages = null;
        let totalResults = null;
        for (let portalPage = firstPortalPage; portalPage <= lastPortalPage; portalPage += 1) {
            const parsed = (0, core_js_1.parseSearchPage)(await this.request(this.printPath(portalPage)));
            collected.push(...parsed.results);
            totalPages = parsed.totalPages ?? totalPages;
            totalResults = parsed.totalResults ?? totalResults;
            if (!parsed.results.length)
                break;
        }
        const localStart = firstIndex - firstPortalPage * core_js_1.PORTAL_PAGE_SIZE;
        return {
            results: collected.slice(localStart, localStart + pageSize),
            totalPages,
            totalResults,
        };
    }
    async search(options) {
        await this.submit("phrase", {
            [core_js_1.SEARCH_FIELDS.phrase]: options.query,
            [core_js_1.SEARCH_FIELDS.where]: core_js_1.SEARCH_AREAS[options.where],
            [core_js_1.SEARCH_FIELDS.dateFrom]: options.dateFrom,
            [core_js_1.SEARCH_FIELDS.dateTo]: options.dateTo,
            [core_js_1.SEARCH_FIELDS.subject]: options.subject,
        }, options.inflection);
        return this.collectWindow(options.pageNumber, options.pageSize);
    }
    async searchBySignature(signature, pageNumber, pageSize) {
        await this.submit("metadata", {
            [core_js_1.SEARCH_FIELDS.signature]: signature,
        });
        return this.collectWindow(pageNumber, pageSize);
    }
    async listRecent(pageNumber, pageSize) {
        await this.openSession();
        return this.collectWindow(pageNumber, pageSize);
    }
    async crawlAll(onProgress) {
        await this.openSession();
        const first = (0, core_js_1.parseSearchPage)(await this.request(this.printPath(0)));
        if (!first.results.length || !first.totalPages) {
            throw new core_js_1.TkError("api_changed", "IPO nie zwróciło pełnej listy ani pagera. Zgłoś: " + core_js_1.ISSUE_URL);
        }
        if (first.totalPages > 1_000) {
            throw new core_js_1.TkError("api_changed", "Nieoczekiwana liczba stron IPO: " + first.totalPages + ".");
        }
        const results = [...first.results];
        onProgress?.(1, first.totalPages);
        for (let page = 1; page < first.totalPages; page += 1) {
            const parsed = (0, core_js_1.parseSearchPage)(await this.request(this.printPath(page)));
            results.push(...parsed.results);
            onProgress?.(page + 1, first.totalPages);
        }
        const unique = new Map();
        for (const result of results)
            unique.set(result.documentId, result);
        return [...unique.values()];
    }
    async getJudgment(documentId, caseId) {
        await this.openSession();
        const params = new URLSearchParams({
            cid: (0, core_js_1.cidFromAction)(this.searchAction),
            dokument: documentId,
        });
        if (caseId)
            params.set("sprawa", caseId);
        const html = await this.request("/ipo/Sprawa?" + params.toString());
        return (0, core_js_1.parseJudgmentPage)(html, documentId, caseId);
    }
}
exports.IpoClient = IpoClient;
//# sourceMappingURL=client.js.map