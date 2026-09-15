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
exports.OtkZuClient = void 0;
exports.normalizeOtkZuReference = normalizeOtkZuReference;
exports.parseOtkZuDetail = parseOtkZuDetail;
const http2 = __importStar(require("node:http2"));
const core_js_1 = require("./core.js");
const ORIGIN = "https://otkzu.trybunal.gov.pl";
const USER_AGENT = "mcp-tk/1.0 (+https://github.com/tramer222888-alt/mcp-tk; public legal research)";
function normalizeOtkZuReference(value) {
    const clean = value
        .trim()
        .replace(/^https?:\/\/otkzu\.trybunal\.gov\.pl\//i, "")
        .replace(/^\/+|\/+$/g, "");
    return /^\d{4}\/(?:[AB]|\d+[AB])\/\d+$/i.test(clean)
        ? clean.toUpperCase()
        : undefined;
}
function parseOtkZuDetail(html, reference) {
    const link = html.match(/href=["']https?:\/\/ipo\.trybunal\.gov\.pl\/ipo\/Sprawa\?([^"']*\bdokument=\d+[^"']*)["']/i);
    if (!link) {
        throw new core_js_1.TkError("api_changed", "Strona OTK ZU " +
            reference +
            " nie zawiera oczekiwanego odsyłacza do IPO. Zgłoś: " +
            core_js_1.ISSUE_URL);
    }
    const params = new URLSearchParams((0, core_js_1.decodeHtml)(link[1]).replace(/&amp;/g, "&"));
    const documentId = params.get("dokument");
    if (!documentId) {
        throw new core_js_1.TkError("api_changed", "Odsyłacz OTK ZU nie zawiera ID dokumentu. Zgłoś: " + core_js_1.ISSUE_URL);
    }
    const signature = (0, core_js_1.flattenHtml)(html.match(/<span\b[^>]*class=["'][^"']*\bsygnatura\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i)?.[1] ?? "") || "";
    const pdfPath = (0, core_js_1.decodeHtml)(html.match(/href=["'](\/downloadOTK\?mpo=\d+)["']/i)?.[1] ?? "");
    return {
        reference,
        url: core_js_1.OTKZU_BASE + "/" + reference,
        pdfUrl: pdfPath ? core_js_1.OTKZU_BASE + pdfPath : undefined,
        documentId,
        caseId: params.get("sprawa") || undefined,
        signature,
    };
}
class OtkZuClient {
    async resolve(value) {
        const reference = normalizeOtkZuReference(value);
        if (!reference) {
            throw new core_js_1.TkError("invalid_arg", "Referencja OTK ZU musi mieć format RRRR/A/POZ albo RRRR/NR-A/POZ.");
        }
        const path = "/" + reference;
        const html = await new Promise((resolve, reject) => {
            const client = http2.connect(ORIGIN);
            let body = "";
            let status = 0;
            let settled = false;
            const fail = (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                client.close();
                reject(error);
            };
            client.on("error", fail);
            const request = client.request({
                ":method": "GET",
                ":path": path,
                ":scheme": "https",
                ":authority": "otkzu.trybunal.gov.pl",
                "user-agent": USER_AGENT,
                accept: "text/html,application/xhtml+xml",
                "accept-language": "pl-PL,pl;q=0.9",
            });
            request.setEncoding("utf8");
            request.on("response", (headers) => {
                status = Number(headers[":status"] ?? 0);
            });
            request.on("data", (chunk) => {
                body += chunk;
            });
            request.on("error", fail);
            request.on("end", () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                client.close();
                if (status === 404) {
                    reject(new core_js_1.TkError("not_found", "Nie znaleziono publikacji OTK ZU " + reference + "."));
                }
                else if (status < 200 || status >= 300) {
                    reject(new core_js_1.TkError("upstream_error", "OTK ZU zwróciło HTTP " + status + "."));
                }
                else {
                    resolve(body);
                }
            });
            const timer = setTimeout(() => {
                request.close(http2.constants.NGHTTP2_CANCEL);
                fail(new Error("timeout OTK ZU"));
            }, 60_000);
            request.end();
        }).catch((error) => {
            if (error instanceof core_js_1.TkError)
                throw error;
            throw new core_js_1.TkError("upstream_error", "Nie udało się pobrać OTK ZU: " +
                (error instanceof Error ? error.message : String(error)));
        });
        return parseOtkZuDetail(html, reference);
    }
}
exports.OtkZuClient = OtkZuClient;
//# sourceMappingURL=otkzu.js.map