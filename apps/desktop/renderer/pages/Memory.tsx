import { useEffect, useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  profile: "Perfil",
  preference: "Preferências",
  project: "Projetos",
  location: "Localizações",
  application: "Aplicações",
  workflow: "Fluxos de trabalho",
  other: "Outros"
};

export function Memory() {
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [deleting, setDeleting] = useState<{ key: string; value: string } | null>(null);

  const load = () => window.nexo.listMemories().then((data: any) => setGrouped(data ?? {}));

  useEffect(() => { void load(); }, []);

  async function handleSearch() {
    if (!search.trim()) { setSearchResults(null); return; }
    const results = await window.nexo.searchMemory(search.trim());
    setSearchResults(results ?? []);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await window.nexo.removeMemory(deleting.key);
    setDeleting(null);
    setSearchResults(null);
    await load();
  }

  const categories = Object.keys(grouped);

  return (
    <div>
      <header>
        <div>
          <h1>Memória</h1>
          <p>Informações salvas pelo agente ou por você.</p>
        </div>
      </header>

      {/* Barra de busca */}
      <section className="panel">
        <div className="inline">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleSearch(); }}
            placeholder="Buscar na memória…"
          />
          <button onClick={() => void handleSearch()}>Buscar</button>
          {searchResults !== null && <button className="ghost" onClick={() => { setSearch(""); setSearchResults(null); }}>Limpar</button>}
        </div>
      </section>

      {/* Resultados da busca */}
      {searchResults !== null && (
        <section className="panel list">
          <h3>Resultados da busca</h3>
          {searchResults.length === 0
            ? <div className="empty">Nenhuma memória encontrada para "{search}".</div>
            : searchResults.map((r: any) => (
              <div className="row" key={r.key}>
                <div>
                  <b>{r.key}</b>
                  <span>{r.value}</span>
                </div>
                <button className="ghost" onClick={() => setDeleting({ key: r.key, value: r.value })}>Remover</button>
              </div>
            ))
          }
        </section>
      )}

      {/* Memórias por categoria */}
      {searchResults === null && (
        categories.length === 0
          ? <section className="panel"><div className="empty">Nenhuma memória salva ainda.</div></section>
          : categories.map(cat => (
            <section className="panel list" key={cat}>
              <h3>{CATEGORY_LABELS[cat] ?? cat}</h3>
              <hr />
              {grouped[cat].map((m: any) => (
                <div className="row" key={m.key}>
                  <div>
                    <b>{m.key.replace(/^[a-z]+\./, "").replace(/\./g, " › ")}</b>
                    <span>{m.value}</span>
                  </div>
                  <button className="ghost" onClick={() => setDeleting({ key: m.key, value: m.value })}>⋯</button>
                </div>
              ))}
            </section>
          ))
      )}

      {/* Modal de confirmação de remoção */}
      {deleting && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Remover memória?</h2>
            <p>Encontrei esta memória:</p>
            <code>{deleting.key}: {deleting.value}</code>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setDeleting(null)}>Cancelar</button>
              <button onClick={() => void confirmDelete()}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
