/**
 * rewrite.ts — Reescrita de HTML/CSS para o proxy de navegação do ITA Navegador.
 *
 * Portado de src/server/LocalServer.js para que a versão WEB (Vercel) tenha o
 * mesmo comportamento do proxy local do desktop: contorna X-Frame-Options,
 * reescreve URLs para passarem pelo proxy e injeta o shim de navegação.
 *
 * Funções puras (sem dependências) — podem ser testadas isoladamente com Node.
 */

/** Empacota uma URL absoluta no caminho do proxy. */
export function toProxyPath(absoluteUrl: string): string {
  return `/proxy?url=${encodeURIComponent(absoluteUrl)}`
}

/** URLs que não devem ser reescritas (dados, protocolos internos, âncoras). */
export function isSkippableUrl(value: string): boolean {
  return (
    !value ||
    /^(data:|blob:|about:|javascript:|mailto:|tel:|sms:|#|\{\{)/i.test(value.trim())
  )
}

/** Converte uma URL (possivelmente relativa) em absoluta http(s) a partir de baseUrl. */
export function absolutize(value: string, baseUrl: string): string | null {
  try {
    if (isSkippableUrl(value)) return null
    const href = new URL(value.trim(), baseUrl).href
    return /^https?:/i.test(href) ? href : null
  } catch {
    return null
  }
}

/**
 * Reescreve url(...) e @import de um CSS para passarem pelo proxy.
 * Guard de string: conteúdo que não seja texto é descartado sem lançar erro.
 */
export function rewriteCss(css: string, baseUrl: string): string {
  if (!css || typeof css !== 'string') {
    return ''
  }

  let out = css

  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match: string, quote: string, rawUrl: string) => {
    const absolute = absolutize(rawUrl, baseUrl)
    return absolute ? `url("${toProxyPath(absolute)}")` : match
  })

  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (match: string, quote: string, rawUrl: string) => {
    const absolute = absolutize(rawUrl, baseUrl)
    return absolute ? `@import "${toProxyPath(absolute)}"` : match
  })

  return out
}

/**
 * Reescreve um documento HTML para navegar dentro do proxy:
 * - atributos href/src/action/poster/formaction/data-src/xlink:href
 * - srcset (imagens responsivas)
 * - <meta http-equiv="refresh">
 * - blocos <style> e atributos style="..." inline
 * - injeta o shim ITA antes de </body> (título real + cliques via proxy)
 */
export function rewriteHtml(html: string, baseUrl: string): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  let out = html

  // Atributos com URL (href, src, action, poster, formaction, data-src, xlink:href)
  out = out.replace(
    /\s(?:xlink:)?(href|src|action|poster|formaction|data-src)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match: string, attr: string, _quoted: string, dq: string, sq: string) => {
      const value = dq !== undefined ? dq : sq
      const absolute = absolutize(value, baseUrl)
      if (!absolute) return match
      return ` ${attr.toLowerCase()}="${toProxyPath(absolute).replace(/"/g, '&quot;')}"`
    }
  )

  // srcset (imagens responsivas)
  out = out.replace(
    /\ssrcset\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match: string, _quoted: string, dq: string, sq: string) => {
      const value = dq !== undefined ? dq : sq
      const rewritten = value
        .split(',')
        .map((part) => {
          const bits = part.trim().split(/\s+/)
          if (bits[0]) {
            const absolute = absolutize(bits[0], baseUrl)
            if (absolute) bits[0] = toProxyPath(absolute)
          }
          return bits.join(' ')
        })
        .join(', ')
      return ` srcset="${rewritten.replace(/"/g, '&quot;')}"`
    }
  )

  // <meta http-equiv="refresh" content="0;url=...">
  out = out.replace(
    /(<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=)([^"';]+)/gi,
    (match: string, prefix: string, rawUrl: string) => {
      const absolute = absolutize(rawUrl, baseUrl)
      return absolute ? `${prefix}${toProxyPath(absolute)}` : match
    }
  )

  // Blocos <style> internos
  out = out.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (match: string, attrs: string, css: string) => `<style${attrs}>${rewriteCss(css, baseUrl)}</style>`
  )

  // Atributos style="..." inline
  out = out.replace(
    /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match: string, _quoted: string, dq: string, sq: string) => {
      const value = dq !== undefined ? dq : sq
      return ` style="${rewriteCss(value, baseUrl).replace(/"/g, '&quot;')}"`
    }
  )

  // Shim ITA (título real + cliques de links e envios de formulário via proxy)
  return out.replace(/<\/body>/i, `${buildShim(baseUrl)}</body>`)
}

/**
 * Shim injetado nas páginas proxyadas: reporta título/URL à UI via postMessage
 * e encaminha cliques em links e envios de formulários através do proxy.
 */
export function buildShim(baseUrl: string): string {
  const encoded = encodeURIComponent(baseUrl)
  return `<script data-ita-shim>(function(){
try{
var ORIG="${encoded}";
function post(t){try{t.__ita=1;window.parent.postMessage(t,"*")}catch(e){}}
post({type:"ita-page-info",title:document.title||"",url:ORIG});
window.addEventListener("load",function(){post({type:"ita-page-info",title:document.title||"",url:ORIG})});
document.addEventListener("click",function(e){
var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;
if(!a)return;
var h=a.getAttribute("href")||"";
if(!h||h.charAt(0)==="#"||/^(javascript:|mailto:|tel:|data:)/i.test(h))return;
if(a.target==="_blank"){e.preventDefault();window.open("/proxy?url="+encodeURIComponent(new URL(h,ORIG).href),"_self");return}
try{
var abs=new URL(h,ORIG).href;
if(/^https?:/i.test(abs)){e.preventDefault();post({type:"ita-navigated",url:abs});location.href="/proxy?url="+encodeURIComponent(abs)}
}catch(err){}
},true);
document.addEventListener("submit",function(e){
try{
var f=e.target;if(!f||!f.tagName||f.tagName!=="FORM")return;
var action=f.getAttribute("action");
var abs=new URL(action&&action!=="#"?action:ORIG,ORIG).href;
if(!/^https?:/i.test(abs))return;
if((f.method||"get").toLowerCase()==="get"){
e.preventDefault();
var params=new URLSearchParams(new FormData(f)).toString();
var target=abs+(params?(abs.indexOf("?")===-1?"?":"&")+params:"");
post({type:"ita-navigated",url:target});
location.href="/proxy?url="+encodeURIComponent(target);
}
}catch(err){}
},true);
}catch(e){}
})();</script>`
}

/**
 * Hosts que não devem ser buscados por um proxy público (SSRF):
 * loopback, rede privada e link-local.
 */
export function isForbiddenTargetHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80')
  ) {
    return true
  }
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host)
  )
}
