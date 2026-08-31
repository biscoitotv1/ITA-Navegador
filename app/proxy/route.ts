/**
 * route.ts — Proxy reverso de navegação do ITA Navegador (versão WEB).
 *
 * Serve /proxy?url=<alvo> no deploy da Vercel com o mesmo papel do servidor
 * local do desktop (src/server/LocalServer.js):
 *   - remove X-Frame-Options / CSP / HSTS para permitir exibição em iframe;
 *   - reescreve HTML e CSS para que links e recursos passem pelo proxy;
 *   - transmite binários (imagens, mídia, downloads) sem alteração;
 *   - devolve uma página de erro amigável em vez de quebrar a navegação.
 *
 * Proteção SSRF: hosts locais/privados são bloqueados (é um proxy público).
 */

import { NextRequest, NextResponse } from "next/server";
import { isForbiddenTargetHost, rewriteCss, rewriteHtml } from "./rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Headers que nunca são repassados ao cliente (hop-by-hop + bloqueios de frame). */
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "content-encoding",
  "content-length",
  "x-frame-options",
  "content-security-policy",
  "strict-transport-security",
  "clear-site-data",
]);

/** Página de erro amigável (a navegação nunca deve "quebrar" com exceção). */
function errorPage(targetUrl: string, message: string): NextResponse {
  const safe = String(targetUrl || "").replace(/[<>&"]/g, "").slice(0, 300);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ITA Navegador — Proxy</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#e6edf3;font-family:system-ui,Segoe UI,sans-serif}.card{max-width:560px;padding:32px;border:1px solid #30363d;border-radius:12px;background:#161b22;text-align:center}.logo{font-size:34px;margin-bottom:8px}h1{font-size:18px;margin:8px 0}p{color:#8b949e;line-height:1.5;font-size:14px;word-break:break-all}code{background:#0d1117;padding:2px 6px;border-radius:4px;font-size:13px;color:#79c0ff}</style></head>
<body><div class="card"><div class="logo">🧭</div><h1>Não foi possível abrir esta página pelo proxy</h1>
<p>${message}</p>${safe ? `<p><code>${safe}</code></p>` : ""}<p style="margin-top:18px">ITA Navegador • Proxy de navegação</p></div></body></html>`;
  return new NextResponse(html, {
    status: 502,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function handle(req: NextRequest, method: "GET" | "HEAD" | "POST"): Promise<NextResponse> {
  const target = req.nextUrl.searchParams.get("url") || "";
  if (!target) {
    return errorPage("", "Faltou o parâmetro <code>?url=</code> na chamada do proxy.");
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return errorPage(target, "O endereço informado é inválido.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorPage(target, "O proxy aceita apenas endereços <strong>http(s)</strong>.");
  }
  if (isForbiddenTargetHost(parsed.hostname)) {
    return errorPage(target, "Endereços locais ou de rede privada não podem ser acessados pelo proxy web.");
  }

  const fwd = new Headers();
  fwd.set("user-agent", BROWSER_UA);
  fwd.set("accept-language", req.headers.get("accept-language") || "pt-BR,pt;q=0.9,en;q=0.8");
  const accept = req.headers.get("accept");
  if (accept) fwd.set("accept", accept);
  const range = req.headers.get("range");
  if (range) fwd.set("range", range);

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    body = await req.arrayBuffer();
    const ct = req.headers.get("content-type");
    if (ct) fwd.set("content-type", ct);
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.href, {
      method,
      headers: fwd,
      redirect: "follow",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return errorPage(
      target,
      "Não foi possível conectar ao site. Ele pode estar fora do ar ou bloquear acessos automatizados."
    );
  }

  // URL final (após redirecionamentos) — base correta para reescrever links
  const finalUrl = upstream.url || parsed.href;

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (DROPPED_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  try {
    const anyHeaders = upstream.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = anyHeaders.getSetCookie ? anyHeaders.getSetCookie() : [];
    for (const cookie of cookies) {
      headers.append(
        "set-cookie",
        String(cookie).replace(/domain=[^;]+;?/gi, "").replace(/;\s*secure/gi, "")
      );
    }
  } catch {
    // ambiente sem getSetCookie — segue sem ajuste fino de cookies
  }
  headers.set("access-control-allow-origin", "*");

  const contentType = upstream.headers.get("content-type") || "";
  const isCss = /text\/css/i.test(contentType);
  const isHtml = /text\/html|application\/xhtml/i.test(contentType);

  // Binários (imagens, mídia, downloads) e demais conteúdos: transmite direto
  if (method === "HEAD" || (!isCss && !isHtml)) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  try {
    // fetch já descomprime gzip/deflate/br — chega como texto plano
    const text = await upstream.text();
    const finalText = isCss ? rewriteCss(text, finalUrl) : rewriteHtml(text, finalUrl);
    headers.set("content-type", isCss ? "text/css; charset=utf-8" : "text/html; charset=utf-8");
    return new NextResponse(finalText, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    // Qualquer falha ao reescrever NÃO pode quebrar a navegação
    return errorPage(finalUrl, "Não foi possível processar o conteúdo desta página.");
  }
}

export async function GET(req: NextRequest) {
  return handle(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return handle(req, "HEAD");
}

export async function POST(req: NextRequest) {
  return handle(req, "POST");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,HEAD,OPTIONS",
      "access-control-allow-headers": "*",
    },
  });
}
