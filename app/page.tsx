export default function Home() {
  return (
    <main>
      <section>
        <p className="eyebrow">ITA Navegador</p>
        <h1>Seu ponto de partida para navegar pelo ITA.</h1>
        <p className="description">
          O projeto está configurado para desenvolvimento local e deploy contínuo
          pela Vercel.
        </p>
        <a href="/api/health">Verificar status da aplicação</a>
      </section>
    </main>
  );
}
