const FEATURES = [
  {
    icon: "⚡",
    title: "Navegação veloz",
    text: "Motor moderno com abas leves e carregamento otimizado das suas páginas.",
  },
  {
    icon: "🛡️",
    title: "Proteção ITA",
    text: "Bloqueio automático de sites perigosos e avisos de segurança em tempo real.",
  },
  {
    icon: "🌙",
    title: "Tema escuro nativo",
    text: "Azul profundo com acentos verdes tecnológicos — confortável em qualquer hora do dia.",
  },
  {
    icon: "⭐",
    title: "Favoritos e sessão",
    text: "Salve seus sites favoritos e retome a sessão exatamente de onde parou.",
  },
  {
    icon: "⬇️",
    title: "Downloads em tempo real",
    text: "Acompanhe o progresso dos downloads direto na interface, sem pop-ups.",
  },
  {
    icon: "🔎",
    title: "Omnibox inteligente",
    text: "Busque ou digite endereços com indicador de conexão segura a cada site.",
  },
];

export default function Home() {
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ITA</span>
          <span className="brand-name">
            Navegador<span className="brand-dot">.</span>
          </span>
        </div>
        <nav className="top-nav">
          <a href="#recursos">Recursos</a>
          <a href="#desktop">Desktop</a>
          <a href="/ide">IDE</a>
          <a className="btn btn-ghost" href="/ui/index.html">
            Abrir versão web
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">ITA Navegador · itabrowser.top</p>
          <h1>
            Seu ponto de partida para navegar pelo{" "}
            <span className="accent">ITA</span>.
          </h1>
          <p className="description">
            Navegação rápida, privada e protegida — com bloqueio de sites
            perigosos, favoritos, downloads e sessão persistente. Use direto no
            navegador ou instale o app desktop.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="/ui/index.html">
              Abrir o Navegador
            </a>
            <a className="btn btn-outline" href="#desktop">
              Baixar para Desktop
            </a>
          </div>
          <p className="hint">Sem instalação · Grátis · Tema escuro nativo</p>

          <div
            className="mockup"
            role="img"
            aria-label="Prévia da interface do ITA Navegador"
          >
            <div className="mockup-bar">
              <span className="dot dot-r" />
              <span className="dot dot-y" />
              <span className="dot dot-g" />
              <span className="omnibox">
                <span className="lock">🔒</span> itabrowser.top
              </span>
            </div>
            <div className="mockup-body">
              <div className="mock-line w-60" />
              <div className="mock-line w-80" />
              <div className="mock-line w-40" />
              <div className="mock-tiles">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="features">
          <h2>Feito para navegar sem preocupação</h2>
          <div className="cards">
            {FEATURES.map((feature) => (
              <article className="card" key={feature.title}>
                <span className="card-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="desktop" className="desktop">
          <div className="desktop-copy">
            <h2>Prefere um app no seu PC?</h2>
            <p>
              O ITA Navegador também roda como aplicativo desktop, com abas,
              histórico, favoritos e o protetor ITA ativo em todas as páginas —
              tudo no mesmo tema escuro que você já conhece.
            </p>
            <div className="cta-row">
              <a
                className="btn btn-primary"
                href="https://github.com/biscoitotv1/ITA-Navegador"
                target="_blank"
                rel="noreferrer"
              >
                Ver no GitHub
              </a>
              <a className="btn btn-outline" href="/api/health">
                Status da aplicação
              </a>
            </div>
          </div>
          <pre className="terminal">
            <code>{`git clone https://github.com/biscoitotv1/ITA-Navegador
cd ITA-Navegador
npm install
npm run app`}</code>
          </pre>
        </section>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} ITA Games Studios · ITA Navegador</span>
        <nav>
          <a href="/ui/index.html">Navegador</a>
          <a href="/ide">IDE Workspace</a>
          <a href="/api/health">Status</a>
          <a
            href="https://github.com/biscoitotv1/ITA-Navegador"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
