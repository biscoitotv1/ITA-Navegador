# ITA Navegador

Aplicação Next.js configurada para deploy na Vercel.

## Desenvolvimento local

```bash
npm install
copy .env.example .env.local
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A rota
`/api/health` confirma que a aplicação está disponível.

## Deploy na Vercel

1. Envie este repositório para o GitHub.
2. Na [Vercel](https://vercel.com/new), importe o repositório
   `biscoitotv1/ITA-Navegador`.
3. Em **Settings > Environment Variables**, defina
   `NEXT_PUBLIC_APP_URL` com a URL de cada ambiente.
4. Faça o deploy. A Vercel detecta automaticamente o Next.js e aplica as
   configurações em `vercel.json`.

Todo push para a branch de produção configurada na Vercel gera um deploy de
produção; os demais branches recebem Preview Deployments.

## Interface remota no app desktop (fallback local)

O app desktop (Electron) carrega a interface principal direto do deploy da
branch main na Vercel (`DEFAULT_REMOTE_UI_URL` em `main.js`). Antes de abrir,
uma sonda verifica se o deploy responde com a nossa UI. Se estiver inacessível
(sem internet, proteção SSO da Vercel ativa ou erro do servidor), o app cai
automaticamente para o `index.html` local — sem tela branca nem página de
login da Vercel. Uma falha de rede durante o uso também retorna ao arquivo
local.

> **Importante:** com a *Deployment Protection* (SSO) ativa na Vercel, a URL
> `*.vercel.app` exige login e o app usa o arquivo local. Para que a UI
> hospedada seja carregada, desative a proteção em **Project Settings →
> Deployment Protection** (ou libere o acesso público ao deploy).

Variável de ambiente opcional (defina antes de abrir o app):

| Valor | Comportamento |
| --- | --- |
| *(não definida)* | usa o deploy da branch main na Vercel (padrão) |
| `ITA_UI_URL=<url>` | usa outra URL remota (ex.: `https://…/ui/` para abrir direto a UI do navegador) |
| `ITA_UI_URL=local` | força sempre o arquivo local, ignorando a rede |

## Navegação web: HTTPS por padrão e proxy de conteúdo

### 1. HTTPS por padrão (evita bloqueio de Mixed Content)

Todo endereço digitado na barra é convertido para `https://` antes de
carregar. Se o usuário digitar apenas `google.com` — ou até `http://google.com`
— a URL é formatada como `https://google.com`. Isso evita o bloqueio de
*Mixed Content* dos navegadores modernos, que recusam carregar conteúdo `http://`
dentro de uma página servida em `https://` (caso do deploy na Vercel).

Exceção: hosts locais e de rede privada (`localhost`, `127.0.0.1`, `::1`,
`10.*`, `192.168.*`, `172.16–31.*`, `*.local`) mantêm `http://`, pois não
dispõem de TLS.

Pontos aplicados: `normalizeInput` em `public/ui/ita-ui.js` e
`public/ide/ita-ide.js`, `navigateTo` em `public/index.html` e `index.html`
(desktop) e o handler IPC `browser-navigate` em
`src/browser/BrowserModule.js`.

### 2. Proxy de navegação (contorna X-Frame-Options de iframes)

Sites grandes (Google, YouTube, redes sociais) enviam o cabeçalho
`X-Frame-Options` / `frame-ancestors` e se recusam a ser exibidos dentro de
iframes de outros sites. O ITA Navegador contorna isso com um **proxy reverso**
em vez de carregar as páginas diretamente:

- **Desktop (Electron):** o servidor local (`src/server/LocalServer.js`) busca
  a página, remove os cabeçalhos de bloqueio de frame, reescreve HTML/CSS para
  que links e recursos passem pelo proxy e injeta um shim de navegação.
- **Web (Vercel):** a rota serverless **`/proxy`** (`app/proxy/route.ts` +
  `app/proxy/rewrite.ts`) faz o mesmo papel. As UIs web montam as URLs com a
  própria origem HTTPS (mesma origem = sem Mixed Content), e o IDE web
  (`public/ide/ita-ide.js`) detecta a rota automaticamente e exibe
  “🛡 Proxy ITA ativo”.

A rota `/proxy` também aplica proteção contra SSRF (bloqueia localhost/rede
privada), transmite binários (imagens, mídia, downloads) sem alteração e
devolve uma página de erro amigável quando o site de destino falha — a
navegação nunca quebra com exceção não tratada.

> **Limitação conhecida:** alguns sites detectam e bloqueiam proxies
> (Cloudflare, logins com proteção anti-bot). Nesses casos a página de erro do
> proxy é exibida, e o site continua acessível abrindo direto no app desktop.