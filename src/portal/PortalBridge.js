/*
=========================================================
  ITA BROWSER — PORTAL BRIDGE
  Serve o portal oficial itabrowser.top DE DENTRO do app.

  - Esquema privilegiado itaportal:// entrega os arquivos
    da pasta site/ (padrão FORGE: laranja · preto · branco)
    com MIME correto e proteção contra path traversal.
  - Toda navegação para https://itabrowser.top (e www)
    dentro da nova interface é redirecionada para o portal
    local — funciona 100%, até sem internet e antes da
    publicação do domínio.
  - A ANTIGA interface hospedada em /ui também cai no
    portal FORGE (o usuário pediu: itabrowser.top no lugar
    de https://www.itabrowser.top/ui).
  - 100% legal: entregamos apenas o nosso próprio portal.
=========================================================
*/

'use strict'

const {
  protocol
} = require('electron')

const path = require('path')
const fs = require('fs')

const PORTAL_SCHEME = 'itaportal'
const PORTAL_HOST = 'itabrowser.top'
const PORTAL_DIR = path.join(__dirname, '..', '..', 'site')

const PORTAL_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
}

/*
  Deve ser chamado ANTES do app.ready.
=========================================================
*/

function registerPortalScheme() {

  protocol.registerSchemesAsPrivileged([
    {
      scheme: PORTAL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/*
  Converte https://itabrowser.top/caminho?query em
  itaportal://itabrowser.top/caminho?query
=========================================================
*/

function toPortalUrl(httpsUrl) {

  try {

    const parsed =
      new URL(httpsUrl)

    return (
      PORTAL_SCHEME + '://' +
      PORTAL_HOST +
      parsed.pathname +
      parsed.search
    )

  } catch {

    return PORTAL_SCHEME + '://' + PORTAL_HOST + '/'
  }
}

/*
  Resolve a URL itaportal:// para um arquivo dentro de
  site/ — sem escape de diretório. Retorna null quando a
  URL é de outro host ou o arquivo não existe.
=========================================================
*/

function resolvePortalFilePath(portalUrl) {

  try {

    const parsed =
      new URL(portalUrl)

    if (parsed.hostname !== PORTAL_HOST) {
      return null
    }

    let pathname

    try {

      pathname =
        decodeURIComponent(parsed.pathname || '/')

    } catch {

      pathname = parsed.pathname || '/'
    }

    /*
      A antiga interface hospedada em /ui foi aposentada:
      dentro do app ela vira o portal FORGE direto (nem
      passa pelo arquivo site/ui/index.html do site).
    ========================================================
    */

    if (pathname === '/ui' || pathname === '/ui/') {
      return path.join(PORTAL_DIR, 'index.html')
    }

    if (pathname === '' || pathname.endsWith('/')) {
      pathname += 'index.html'
    }

    const relative =
      path.normalize(pathname).replace(/^([/\\])+/, '')

    const filePath =
      path.join(PORTAL_DIR, relative)

    const portalRoot =
      path.normalize(PORTAL_DIR + path.sep)

    if (!filePath.startsWith(portalRoot)) {
      return null
    }

    if (
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      return filePath
    }

    return null

  } catch {

    return null
  }
}

function portalFileResponse(filePath) {

  const extension =
    path.extname(filePath).toLowerCase()

  const contentType =
    PORTAL_MIME_TYPES[extension] ||
    'application/octet-stream'

  return new Response(
    fs.readFileSync(filePath),
    {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-cache',
        'x-ita-portal': 'local'
      }
    }
  )
}

function servePortal(request) {

  const file =
    resolvePortalFilePath(request.url)

  if (file) {
    return portalFileResponse(file)
  }

  /*
    Fallback: qualquer rota desconhecida do portal cai no
    index.html (comportamento de site estático).
  ========================================================
  */

  const fallback =
    path.join(PORTAL_DIR, 'index.html')

  if (fs.existsSync(fallback)) {
    return portalFileResponse(fallback)
  }

  return new Response(
    '<!doctype html><meta charset="utf-8">' +
    '<title>ITA Browser</title>' +
    '<h1>🔥 ITA Browser</h1>' +
    '<p>Portal indisponível nesta instalação.</p>',
    {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    }
  )
}

/*
  Instala a ponte do portal em uma sessão:
  1. itaportal:// → arquivos de site/
  2. https://(www.)itabrowser.top → itaportal:// (redirect)
  Só é instalada quando o portal existe no app — se a pasta
  site/ não estiver presente, o domínio real é usado.
=========================================================
*/

function installPortalBridge(targetSession) {

  if (!targetSession) {
    return false
  }

  const portalIndex =
    path.join(PORTAL_DIR, 'index.html')

  if (!fs.existsSync(portalIndex)) {
    return false
  }

  try {

    targetSession.protocol.handle(
      PORTAL_SCHEME,
      servePortal
    )

  } catch (error) {

    console.warn(
      '[ITA Portal] Falha ao registrar itaportal://',
      error
    )

    return false
  }

  try {

    targetSession.webRequest.onBeforeRequest(
      {
        urls: [
          'https://' + PORTAL_HOST + '/*',
          'https://www.' + PORTAL_HOST + '/*'
        ]
      },
      (details, callback) => {

        if (
          details.url &&
          details.url.toLowerCase().startsWith(
            PORTAL_SCHEME + '://'
          )
        ) {

          callback({})

          return
        }

        callback({
          redirectURL: toPortalUrl(details.url)
        })
      }
    )

  } catch (error) {

    console.warn(
      '[ITA Portal] Falha ao instalar o redirect do portal',
      error
    )
  }

  return true
}

module.exports = {
  PORTAL_SCHEME,
  PORTAL_HOST,
  PORTAL_DIR,
  registerPortalScheme,
  installPortalBridge,
  toPortalUrl,
  resolvePortalFilePath
}
