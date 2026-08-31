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