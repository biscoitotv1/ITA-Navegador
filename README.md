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