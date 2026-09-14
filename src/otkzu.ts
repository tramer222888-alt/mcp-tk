import * as http2 from "node:http2";
import {
    ISSUE_URL,
    OTKZU_BASE,
    TkError,
    decodeHtml,
    flattenHtml,
} from "./core.js";

const ORIGIN = "https://otkzu.trybunal.gov.pl";
const USER_AGENT =
    "mcp-tk/1.0 (+https://github.com/tramer222888-alt/mcp-tk; public legal research)";

export interface ResolvedOtkZuReference {
    reference: string;
    url: string;
    pdfUrl?: string;
    documentId: string;
    caseId?: string;
    signature: string;
}

export function normalizeOtkZuReference(value: string): string | undefined {
    const clean = value
        .trim()
        .replace(/^https?:\/\/otkzu\.trybunal\.gov\.pl\//i, "")
        .replace(/^\/+|\/+$/g, "");
    return /^\d{4}\/(?:[AB]|\d+[AB])\/\d+$/i.test(clean)
        ? clean.toUpperCase()
        : undefined;
}

export function parseOtkZuDetail(
    html: string,
    reference: string,
): ResolvedOtkZuReference {
    const link = html.match(
        /href=["']https?:\/\/ipo\.trybunal\.gov\.pl\/ipo\/Sprawa\?([^"']*\bdokument=\d+[^"']*)["']/i,
    );
    if (!link) {
        throw new TkError(
            "api_changed",
            "Strona OTK ZU " +
                reference +
                " nie zawiera oczekiwanego odsyłacza do IPO. Zgłoś: " +
                ISSUE_URL,
        );
    }
    const params = new URLSearchParams(decodeHtml(link[1]).replace(/&amp;/g, "&"));
    const documentId = params.get("dokument");
    if (!documentId) {
        throw new TkError(
            "api_changed",
            "Odsyłacz OTK ZU nie zawiera ID dokumentu. Zgłoś: " + ISSUE_URL,
        );
    }
    const signature =
        flattenHtml(
            html.match(
                /<span\b[^>]*class=["'][^"']*\bsygnatura\b[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i,
            )?.[1] ?? "",
        ) || "";
    const pdfPath = decodeHtml(
        html.match(/href=["'](\/downloadOTK\?mpo=\d+)["']/i)?.[1] ?? "",
    );
    return {
        reference,
        url: OTKZU_BASE + "/" + reference,
        pdfUrl: pdfPath ? OTKZU_BASE + pdfPath : undefined,
        documentId,
        caseId: params.get("sprawa") || undefined,
        signature,
    };
}

export class OtkZuClient {
    async resolve(value: string): Promise<ResolvedOtkZuReference> {
        const reference = normalizeOtkZuReference(value);
        if (!reference) {
            throw new TkError(
                "invalid_arg",
                "Referencja OTK ZU musi mieć format RRRR/A/POZ albo RRRR/NR-A/POZ.",
            );
        }
        const path = "/" + reference;
        const html = await new Promise<string>((resolve, reject) => {
            const client = http2.connect(ORIGIN);
            let body = "";
            let status = 0;
            let settled = false;
            const fail = (error: Error) => {
                if (settled) return;
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
            request.on("data", (chunk: string) => {
                body += chunk;
            });
            request.on("error", fail);
            request.on("end", () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                client.close();
                if (status === 404) {
                    reject(
                        new TkError(
                            "not_found",
                            "Nie znaleziono publikacji OTK ZU " + reference + ".",
                        ),
                    );
                } else if (status < 200 || status >= 300) {
                    reject(
                        new TkError(
                            "upstream_error",
                            "OTK ZU zwróciło HTTP " + status + ".",
                        ),
                    );
                } else {
                    resolve(body);
                }
            });
            const timer = setTimeout(() => {
                request.close(http2.constants.NGHTTP2_CANCEL);
                fail(new Error("timeout OTK ZU"));
            }, 60_000);
            request.end();
        }).catch((error) => {
            if (error instanceof TkError) throw error;
            throw new TkError(
                "upstream_error",
                "Nie udało się pobrać OTK ZU: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        });
        return parseOtkZuDetail(html, reference);
    }
}
