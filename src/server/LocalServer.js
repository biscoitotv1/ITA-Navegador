const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const url = require('url')
const zlib = require('zlib')

class LocalServer {
  constructor(port = 8080) {
    this.port = port
    this.server = null
    // Serve a raiz do projeto (index.html real + módulos em /src)
    this.root = path.normalize(path.join(__dirname, '..', '..'))
    this.ensurePublicFolder()
  }

  ensurePublicFolder() {
    const legacy = path.join(__dirname, '..', 'public')
    if (!fs.existsSync(legacy)) {
      try {
        fs.mkdirSync(legacy, { recursive: true })
      } catch {
        // sem permissão: segue sem a pasta legada
      }
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res))
      this.server.listen(this.port, () => {
        console.log(`ITA Browser Local Server running at http://localhost:${this.port}`)
        resolve({ success: true, url: `http://localhost:${this.port}` })
      })
      this.server.on('error', (err) => reject({ success: false, error: err.message }))
    })
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve({ success: true }))
      } else {
        resolve({ success: true })
      }
    })
  }

  handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://localhost:${this.port}`)

    // ===== CORS: permite que a UI oficial (itabrowser.top) consuma a API local =====
    if (this.applyCors(req, res)) {
      return // preflight OPTIONS já respondido
    }

    // ===== Rotas da API local (terminal, IA e sub-agentes) =====
    if (parsedUrl.pathname.startsWith('/api/')) {
      this.handleApi(req, res, parsedUrl)
      return
    }

    if (parsedUrl.pathname === '/proxy' && parsedUrl.searchParams.get('url')) {
      this.handleProxy(req, res, parsedUrl.searchParams.get('url'))
      return
    }

    // ===== UI principal do ITA Navegador (tema escuro azul/verde) =====
    if (parsedUrl.pathname === '/app' || parsedUrl.pathname === '/app/') {
      this.serveAppUi(res)
      return
    }
    // ===== IDE Workspace (layout duplo: editor + navegador) =====
    if (parsedUrl.pathname === '/ide' || parsedUrl.pathname === '/ide/') {
      this.serveIdeUi(res)
      return
    }

    let filePath = decodeURIComponent(parsedUrl.pathname)

    if (filePath === '/') {
      filePath = '/index.html'
    }
    if (filePath === '/ui') {
      filePath = '/ui/index.html'
    }

    // Assets vivem em public/{ui,ide,brand} (mesmas pastas servidas pelo Next na Vercel)
    const publicPrefix =
      filePath === '/ui' || filePath.startsWith('/ui/') ||
      filePath === '/ide' || filePath.startsWith('/ide/') ||
      filePath === '/brand' || filePath.startsWith('/brand/') ||
      filePath.startsWith('/fonts/') ||
      filePath === '/sw.js' || filePath === '/manifest.json' || filePath === '/offline.html'

    const fullPath = path.normalize(path.join(this.root, publicPrefix ? 'public' : '', filePath))

    // Proteção contra path traversal (só serve arquivos dentro do projeto)
    if (!fullPath.startsWith(this.root + path.sep) && fullPath !== this.root) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>403 - Acesso negado</h1>')
      return
    }

    // Denylist: arquivos e pastas sensíveis nunca são servidos
    const relative = path.relative(this.root, fullPath)
    const firstSegment = relative.split(path.sep)[0]
    const denyDirs = ['.ita-agent', '.git', 'node_modules']
    const denyFiles = ['package.json', 'package-lock.json', 'main.js', 'preload.js', 'validate-project.js']
    if (denyDirs.includes(firstSegment) || denyFiles.includes(relative)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>403 - Acesso negado</h1>')
      return
    }

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>404 - Arquivo não encontrado</h1>')
      return
    }

    const ext = path.extname(fullPath).toLowerCase()
    const contentType = this.getContentType(ext)

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>500 - Erro interno</h1>')
        return
      }

      res.writeHead(200, { 'Content-Type': contentType })
      res.end(data)
    })
  }

  // =========================================================
  //  UI PRINCIPAL (/app) — interface escura azul/verde do ITA
  //  Arquivos: public/ui/index.html + public/ui/ita-ui.css + public/ui/ita-ui.js
  //  (mesma pasta servida como estáticos pelo Next.js no site itabrowser.top)
  // =========================================================

  serveAppUi(res) {
    const fullPath = path.join(this.root, 'public', 'ui', 'index.html')
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>500 - Falha ao carregar a interface do ITA Navegador</h1>')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    })
  }

  // =========================================================
  //  IDE WORKSPACE (/ide) — layout duplo: editor + navegador
  //  Arquivos: public/ide/index.html + ita-ide.css + ita-ide.js
  //  (mesma pasta servida como estáticos pelo Next.js no site)
  // =========================================================

  serveIdeUi(res) {
    const fullPath = path.join(this.root, 'public', 'ide', 'index.html')
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>500 - Falha ao carregar o ITA IDE Workspace</h1>')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    })
  }

  // =========================================================
  //  API LOCAL (http://localhost:8080/api/...)
  //  Ponte entre a interface (itabrowser.top) e o backend:
  //  motor de IA local (Ollama via ITA_AI) e sub-agentes.
  // =========================================================

  applyCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return true
    }
    return false
  }

  handleApi(req, res, parsedUrl) {
    const route = `${req.method} ${parsedUrl.pathname}`

    if (route === 'GET /api/health') {
      return this.sendJson(res, 200, {
        ok: true,
        server: 'ita-local-server',
        port: this.port,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      })
    }

    if (route === 'GET /api/ai/status') {
      return this.getAiEngine()
        .getProvider()
        .healthCheck()
        .then(health => this.sendJson(res, 200, { ok: true, ai: health }))
        .catch(err => this.sendJson(res, 500, { ok: false, error: err.message }))
    }

    if (route === 'POST /api/ai/chat') {
      return this.readJsonBody(req)
        .then(body => {
          const provider = this.getAiEngine().getProvider()
          const messages = Array.isArray(body.messages) && body.messages.length > 0
            ? body.messages
            : [{ role: 'user', content: String(body.prompt || body.message || '') }]
          return provider.chat(messages, body.options || {})
        })
        .then(result => this.sendJson(res, 200, { ok: !result.error, ...result }))
        .catch(err => this.sendJson(res, 500, { ok: false, error: err.message }))
    }

    if (route === 'POST /api/agent/run') {
      return this.readJsonBody(req)
        .then(body => {
          // Import tardio: evita dependência circular no bootstrap do app
          const Agent = require('../ai/agent')
          const goal = String(body.goal || body.prompt || '').trim()
          if (!goal) {
            throw new Error('Informe o campo "goal" com o objetivo do agente')
          }
          return Agent.agent.runCycle(goal)
        })
        .then(result => this.sendJson(res, 200, { ok: true, result }))
        .catch(err => this.sendJson(res, 500, { ok: false, error: err.message }))
    }

    this.sendJson(res, 404, { ok: false, error: `Rota de API não encontrada: ${route}` })
  }

  getAiEngine() {
    if (!this._aiEngine) {
      this._aiEngine = require('../ai/ITA_AI')
    }
    return this._aiEngine
  }

  readJsonBody(req) {
    return this.collectBody(req).then(raw => {
      if (!raw || raw.length === 0) return {}
      try {
        return JSON.parse(raw.toString('utf-8'))
      } catch {
        throw new Error('Corpo JSON inválido')
      }
    })
  }

  sendJson(res, statusCode, payload) {
    try {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(payload))
    } catch {
      // resposta já encerrada
    }
  }

  handleProxy(req, res, targetUrl) {
    this.collectBody(req)
      .then(body => this.fetchThrough(targetUrl, req.method, body, req.headers, [], res))
      .catch(() => this.sendProxyError(res, targetUrl, 'Erro ao processar a requisição'))
  }

  collectBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size > 8 * 1024 * 1024) {
          reject(new Error('Corpo da requisição muito grande'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  fetchThrough(targetUrl, method, body, clientHeaders, hops, res) {
    if (hops.length > 5) {
      this.sendProxyError(res, targetUrl, 'Muitos redirecionamentos seguidos')
      return
    }

    let parsed
    try {
      parsed = new URL(targetUrl)
    } catch {
      this.sendProxyError(res, targetUrl, 'URL inválida', 400)
      return
    }

    const isHttps = parsed.protocol === 'https:'
    if (!isHttps && parsed.protocol !== 'http:') {
      this.sendProxyError(res, targetUrl, 'Protocolo não suportado — use http:// ou https://', 400)
      return
    }

    const lib = isHttps ? https : http
    const outHeaders = {
      'user-agent': clientHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept': clientHeaders['accept'] || 'text/html,application/xhtml+xml,image/*,*/*;q=0.8',
      'accept-language': clientHeaders['accept-language'] || 'pt-BR,pt;q=0.9,en;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
      'referer': parsed.origin + '/'
    }
    if (clientHeaders.cookie) outHeaders.cookie = clientHeaders.cookie
    if (body.length > 0) {
      outHeaders['content-type'] = clientHeaders['content-type'] || 'application/x-www-form-urlencoded'
      outHeaders['content-length'] = body.length
    }

    const proxyReq = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: outHeaders,
      timeout: 30000
    }, proxyRes => {
      const status = proxyRes.statusCode
      const location = proxyRes.headers.location

      if (status >= 300 && status < 400 && location) {
        proxyRes.resume()
        let nextUrl
        try {
          nextUrl = new URL(location, targetUrl).href
        } catch {
          this.sendProxyError(res, targetUrl, 'Redirecionamento inválido')
          return
        }
        const nextMethod = status === 303 || (status === 302 && method === 'POST') ? 'GET' : method
        const nextBody = nextMethod === 'GET' ? Buffer.alloc(0) : body
        this.fetchThrough(nextUrl, nextMethod, nextBody, clientHeaders, [...hops, targetUrl], res)
        return
      }

      this.respondWith(res, proxyRes, targetUrl, method)
    })

    proxyReq.on('timeout', () => proxyReq.destroy(new Error('timeout')))
    proxyReq.on('error', err => this.sendProxyError(res, targetUrl, this.explainNetworkError(err)))

    if (body.length > 0) proxyReq.write(body)
    proxyReq.end()
  }

  respondWith(res, proxyRes, targetUrl, method) {
    const headers = { ...proxyRes.headers }
    delete headers['content-security-policy']
    delete headers['x-frame-options']
    delete headers['strict-transport-security']
    delete headers['clear-site-data']
    if (Array.isArray(headers['set-cookie'])) {
      headers['set-cookie'] = headers['set-cookie'].map(cookie =>
        cookie.replace(/domain=[^;]+;?/gi, '').replace(/;\s*secure/gi, '')
      )
    }

    const contentType = String(headers['content-type'] || '')
    const needsRewrite = /text\/html|application\/xhtml|text\/css/i.test(contentType)

    if (method === 'HEAD' || !needsRewrite) {
      res.writeHead(proxyRes.statusCode, headers)
      proxyRes.pipe(res)
      return
    }

    const chunks = []
    proxyRes.on('data', chunk => chunks.push(chunk))
    proxyRes.on('error', () => this.sendProxyError(res, targetUrl, 'Conexão interrompida durante o download'))
    proxyRes.on('end', () => {
      const raw = Buffer.concat(chunks)
      let text
      try {
        text = this.decodeBody(raw, headers['content-encoding'])
      } catch {
        text = raw.toString('utf-8')
      }
      delete headers['content-encoding']
      delete headers['content-length']

      const isCss = /text\/css/i.test(contentType)
      const finalText = isCss ? this.rewriteCss(text, targetUrl) : this.rewriteHtml(text, targetUrl)
      headers['content-type'] = isCss ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'
      res.writeHead(proxyRes.statusCode, headers)
      res.end(finalText)
    })
  }

  decodeBody(buffer, encoding) {
    const enc = String(encoding || '').toLowerCase().trim()
    if (enc === 'gzip') return zlib.gunzipSync(buffer)
    if (enc === 'deflate') {
      try {
        return zlib.inflateSync(buffer)
      } catch {
        return zlib.inflateRawSync(buffer)
      }
    }
    if (enc === 'br') return zlib.brotliDecompressSync(buffer)
    return buffer
  }

  toProxyPath(absoluteUrl) {
    return `/proxy?url=${encodeURIComponent(absoluteUrl)}`
  }

  isSkippableUrl(value) {
    return !value || /^(data:|blob:|about:|javascript:|mailto:|tel:|sms:|#|\{\{)/i.test(value.trim())
  }

  absolutize(value, baseUrl) {
    try {
      if (this.isSkippableUrl(value)) return null
      const href = new URL(value.trim(), baseUrl).href
      return /^https?:/i.test(href) ? href : null
    } catch {
      return null
    }
  }

  rewriteCss(css, baseUrl) {
    if (!css) return css
    return css
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
        const absolute = this.absolutize(rawUrl, baseUrl)
        return absolute ? `url("${this.toProxyPath(absolute)}")` : match
      })
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, rawUrl) => {
        const absolute = this.absolutize(rawUrl, baseUrl)
        return absolute ? `@import "${this.toProxyPath(absolute)}"` : match
      })
  }

  rewriteHtml(html, baseUrl) {
    if (!html) return html

    let out = String(html)

    // Atributos com URL (href, src, action, poster, formaction, data-src, xlink:href)
    out = out.replace(/\s(?:xlink:)?(href|src|action|poster|formaction|data-src)\s*=\s*("([^"]*)"|'([^']*)')/gi,
      (match, attr, quoted, dq, sq) => {
        const value = dq !== undefined ? dq : sq
        const absolute = this.absolutize(value, baseUrl)
        if (!absolute) return match
        return ` ${attr.toLowerCase()}="${this.toProxyPath(absolute).replace(/"/g, '&quot;')}"`
      })

    // srcset (imagens responsivas)
    out = out.replace(/\ssrcset\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, quoted, dq, sq) => {
      const value = dq !== undefined ? dq : sq
      const rewritten = value.split(',').map(part => {
        const bits = part.trim().split(/\s+/)
        if (bits[0]) {
          const absolute = this.absolutize(bits[0], baseUrl)
          if (absolute) bits[0] = this.toProxyPath(absolute)
        }
        return bits.join(' ')
      }).join(', ')
      return ` srcset="${rewritten.replace(/"/g, '&quot;')}"`
    })

    // <meta http-equiv="refresh" content="0;url=...">
    out = out.replace(/(<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=)([^"';]+)/gi,
      (match, prefix, rawUrl) => {
        const absolute = this.absolutize(rawUrl, baseUrl)
        return absolute ? `${prefix}${this.toProxyPath(absolute)}` : match
      })

    // Blocos <style> internos
    out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi,
      (match, attrs, css) => `<style${attrs}>${this.rewriteCss(css, baseUrl)}</style>`)

    // Atributos style="..." inline
    out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, quoted, dq, sq) => {
      const value = dq !== undefined ? dq : sq
      return ` style="${this.rewriteCss(value, baseUrl).replace(/"/g, '&quot;')}"`
    })

    // Shim ITA (título real + cliques de links via proxy)
    return out.replace(/<\/body>/i, `${this.buildShim(baseUrl)}</body>`)
  }

  buildShim(baseUrl) {
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

  explainNetworkError(err) {
    const code = err && err.code
    const message = String((err && err.message) || '')
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Site não encontrado (DNS). Verifique se o endereço foi digitado corretamente.'
    if (code === 'ECONNREFUSED') return 'O servidor do site recusou a conexão.'
    if (code === 'ETIMEDOUT' || /timeout|tempo/i.test(message)) return 'O site demorou demais para responder (tempo esgotado).'
    if (code === 'ECONNRESET') return 'A conexão foi interrompida pelo site.'
    if (code === 'EPROTO' || /certificate|ssl|tls/i.test(message)) return 'Falha de segurança na conexão (certificado/TLS inválido).'
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'Host inacessível — verifique sua conexão com a internet.'
    return 'Não foi possível conectar ao site.'
  }

  sendProxyError(res, targetUrl, reason, statusCode = 502) {
    const safeTarget = String(targetUrl || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const safeReason = String(reason || 'Erro desconhecido')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const retryPath = this.toProxyPath(targetUrl || '')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>ITA Browser — Não foi possível carregar</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:'Segoe UI',system-ui,sans-serif;background:#0b1020;color:#e5e9f0}
  .box{max-width:520px;padding:40px;text-align:center;background:#141b30;
    border:1px solid #232e4d;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  .logo{font-size:40px;margin-bottom:6px}
  h1{font-size:19px;margin:10px 0 6px;color:#ffffff}
  .target{font-size:12px;color:#8b93a7;word-break:break-all;margin-bottom:14px}
  .reason{font-size:14px;color:#c3cad9;line-height:1.6;background:#0e1425;
    border:1px solid #232e4d;border-radius:10px;padding:14px 16px;margin-bottom:22px}
  a.retry{display:inline-block;padding:10px 26px;border-radius:10px;text-decoration:none;
    font-size:14px;font-weight:600;color:#fff;
    background:linear-gradient(135deg,#3b5bdb,#5f3bdc)}
  a.retry:hover{filter:brightness(1.15)}
  small{display:block;margin-top:16px;color:#5b6478;font-size:11px}
</style>
</head>
<body>
  <div class="box">
    <div class="logo">🌐</div>
    <h1>Não foi possível carregar esta página</h1>
    <div class="target">${safeTarget}</div>
    <div class="reason">${safeReason}</div>
    <a class="retry" href="${retryPath}">↻ Tentar novamente</a>
    <small>ITA Browser — Navegação protegida via proxy interno</small>
  </div>
</body>
</html>`

    try {
      res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch {
      // resposta já encerrada
    }
  }

  getContentType(ext) {
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    }
    return types[ext] || 'application/octet-stream'
  }

  getPort() {
    return this.port
  }

  getUrl() {
    return `http://localhost:${this.port}`
  }

  getProxyUrl(targetUrl) {
    return `http://localhost:${this.port}/proxy?url=${encodeURIComponent(targetUrl)}`
  }
}

module.exports = new LocalServer()
