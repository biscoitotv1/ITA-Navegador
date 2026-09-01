# ITA Navegador

Navegador desktop (Electron) com navegação **direta e real** na Internet.
Digite qualquer endereço na barra (google.com, youtube.com, instagram.com...)
ou clique nos cards da página inicial e o site abre de verdade.

## Como rodar

```
npm install
npm start
```

## Como gerar o instalador (Windows)

```
npm run dist
```

## Como funciona

- **UI:** `index.html` — interface completa (abas, favoritos, downloads, histórico)
- **Home:** `home.html` — cards que abrem sites reais (YouTube, Twitch, Steam, Reddit, GitHub)
- **Webviews:** cada aba tem o próprio `<webview>` com partição persistente (`persist:ita-tabs`)
- **Sessão:** abas e histórico são restaurados ao reabrir o app
- **Barra de endereço:** `normalizeUrl` padroniza HTTPS e busca na web quando não é URL
- **Portal oficial:** `site/` — itabrowser.top é servido de dentro do app via `itaportal://`,
  então o card **ITA Cloud** abre o portal FORGE na nova interface 100% das vezes (até offline)

## Portal itabrowser.top na interface

- `src/portal/PortalBridge.js` registra o esquema privilegiado `itaportal://` e serve a pasta
  `site/` (MIME correto + proteção contra path traversal)
- Navegar para `https://itabrowser.top` (ou www) em qualquer aba redireciona para o portal local
  — a barra de endereço continua mostrando `https://itabrowser.top`
- Deep links do portal (`itabrowser://open?url=...`) clicados dentro das abas viram nova aba ITA
- Se a pasta `site/` não existir na instalação, o domínio remoto é usado normalmente

## Testes

```
npm test            # sintaxe de todos os .js
npm run test:agent  # validação do agente IA
npm run test:portal # smoke test do portal com Electron real
```


## Estrutura principal

| Arquivo | Papel |
| --- | --- |
| `main.js` | Processo principal do Electron (janela, sessão, downloads, IPC) |
| `preload.js` | Ponte segura (`contextBridge`) entre a UI e o Electron |
| `index.html` | Interface do navegador (abas, barra, favoritos, status) |
| `home.html` | Página inicial com cards de sites reais |
| `site/` | Portal oficial itabrowser.top (servido localmente pelo app) |
| `src/portal/PortalBridge.js` | Esquema `itaportal://` + redirect do portal nas sessões |

> O app é 100% desktop e navega direto na Internet — tudo carregado do
> próprio aplicativo.
