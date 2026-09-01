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

- **UI:** `index.html` — interface completa (abas, favoritos, histórico)
- **Início:** navegação 100% direta — a página inicial é a web real (`START_PAGE_URL`)
- **Webviews:** cada aba tem o próprio `<webview>` com partição persistente (`persist:ita_secure_session`)
- **Sessão:** abas e histórico são restaurados ao reabrir o app
- **Barra de endereço:** `normalizeUrl` padroniza HTTPS e busca na web quando não é URL

> **Nota:** o portal itabrowser.top foi removido do app. A pasta `site/` e o
> `PortalBridge` (`itaportal://`) não existem mais, o card **ITA Cloud** foi
> retirado da home e o domínio é bloqueado tanto na navegação (cai na home)
> quanto no nível de rede (requisições canceladas no processo principal).
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

> O app é 100% desktop e navega direto na Internet — tudo carregado do
> próprio aplicativo.
