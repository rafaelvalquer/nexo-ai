import { useMemo, useState } from "react";
import { CalendarDays, CloudSun, Cpu, FileClock, Gauge, Globe2, Landmark, ListTodo, Mail, Plus, Search, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import type { DashboardGadgetId, GadgetDefinition, DashboardGadgetInstance } from "@nexo/shared";
import { NexoDrawer } from "../ui/NexoDrawer";
import { useDeveloperDiagnosticsEnabled } from "../../hooks/useDeveloperDiagnostics";
import { userFacingError } from "../../utils/user-facing-error";
import "./gadgets/gadget-catalog-drawer.css";

const icons: Record<DashboardGadgetId, typeof Sparkles> = {
  "ai-status": Sparkles, tasks: ListTodo, approvals: ShieldCheck, automations: Gauge, activity: FileClock,
  documents: Landmark, system: Cpu, weather: CloudSun, currency: Wallet, holidays: Landmark,
  "business-days": Gauge, earthquakes: Globe2, email: Mail, agenda: CalendarDays
};

type Props = {
  catalog: GadgetDefinition[];
  close: () => void;
  add: (id: DashboardGadgetId, config: Record<string, unknown>) => Promise<void>;
  initial?: DashboardGadgetInstance;
  save?: (item: DashboardGadgetInstance, config: Record<string, unknown>) => Promise<void>;
};

export function GadgetCatalog({ catalog, close, add, initial, save }: Props) {
  const diagnostics=useDeveloperDiagnosticsEnabled();
  const initialDefinition = initial ? catalog.find(item => item.id === initial.gadgetId) : undefined;
  const initialConfig = initial?.configuration ?? {};
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<GadgetDefinition | undefined>(initialDefinition);
  const [place, setPlace] = useState(String(initialConfig.place ?? ""));
  const [latitude, setLatitude] = useState(String(initialConfig.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(initialConfig.longitude ?? ""));
  const [unit, setUnit] = useState(String(initialConfig.unit ?? "C"));
  const [currencies, setCurrencies] = useState(String(initialConfig.currencies ?? "USD,EUR,GBP,JPY"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => catalog.filter(item => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [catalog, query]);
  const grouped = new Map<string, GadgetDefinition[]>();
  for (const item of filtered) {
    const group = item.provider === "internal" ? "DADOS LOCAIS DO NEXO" : "INFORMAÇÕES ONLINE";
    grouped.set(group, [...(grouped.get(group) ?? []), item]);
  }

  async function submit() {
    if (!choice) return;
    setBusy(true);
    setError("");
    try {
      const configuration = choice.id === "weather"
        ? { place: place.trim(), latitude: Number(latitude), longitude: Number(longitude), unit }
        : choice.id === "currency" ? { currencies } : {};
      if (initial && save) await save(initial, configuration);
      else await add(choice.id, configuration);
      close();
    } catch (cause) {
      setError(userFacingError(cause,"Não foi possível salvar esse gadget. Confira os dados e tente novamente.",diagnostics));
    } finally {
      setBusy(false);
    }
  }

  const invalidWeather = choice?.id === "weather" && (!place.trim() || !latitude.trim() || !longitude.trim() || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)));
  return <NexoDrawer open title={choice ? `Configurar ${choice.title}` : "Adicionar gadget"} eyebrow="PERSONALIZE SEU ESPAÇO" onClose={close} className="gadgetCatalog">
    {!choice ? <>
      <label className="gadgetSearch"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar gadget…" /></label>
      <div className="gadgetCatalogList">{[...grouped].map(([group, items]) => <section key={group}><h3>{group}</h3>{items.map(item => {
        const Icon = icons[item.id];
        return <button className="catalogGadget" key={item.id} onClick={() => setChoice(item)}><span className="catalogIcon"><Icon size={17} /></span><span><b>{item.title}{item.requiresInternet && <small className="onlineTag">ONLINE</small>}</b><small>{item.description}</small></span><Plus size={16} /></button>;
      })}</section>)}</div>
    </> : <div className="gadgetSetup">
      <p>{choice.description}{choice.attribution && <small className="attribution">Fonte: {choice.attribution}</small>}</p>
      {choice.id === "weather" && <>
        <label>Local de referência<input value={place} onChange={event => setPlace(event.target.value)} placeholder="Ex.: São Paulo, SP" required /></label>
        <div className="coordinateFields"><label>Latitude<input inputMode="decimal" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="Ex.: -23.5505" required /></label><label>Longitude<input inputMode="decimal" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="Ex.: -46.6333" required /></label></div>
        <fieldset><legend>Unidade</legend><label><input type="radio" name="unit" checked={unit === "C"} onChange={() => setUnit("C")} /> Celsius</label><label><input type="radio" name="unit" checked={unit === "F"} onChange={() => setUnit("F")} /> Fahrenheit</label></fieldset>
      </>}
      {choice.id === "currency" && <label>Moedas (códigos separados por vírgula)<input value={currencies} onChange={event => setCurrencies(event.target.value.toUpperCase())} placeholder="USD,EUR,GBP,JPY" /></label>}
      {choice.requiresInternet && <aside className="privacyNotice"><Globe2 size={17} /><div><b>Este gadget consulta um serviço externo</b><p>{choice.id === "weather" ? `Ao adicionar, as coordenadas ${latitude || "(a configurar)"}, ${longitude || "(a configurar)"} serão enviadas à MET Norway para obter a previsão de ${place || "local escolhido"}.` : `Ao adicionar, o Nexo consultará ${choice.attribution} para carregar informações públicas.`} Conversas, documentos e dados locais não são enviados.</p></div></aside>}
      {error && <p role="alert" className="gadgetError">{error}</p>}
      <footer><button className="dashboardSecondary" onClick={() => initial ? close() : setChoice(undefined)}>{initial ? "Cancelar" : "Voltar"}</button><button className="dashboardPrimary" disabled={busy || invalidWeather} onClick={() => void submit()}>{busy ? "Salvando…" : initial ? "Salvar configuração" : "Adicionar ao dashboard"}</button></footer>
    </div>}
  </NexoDrawer>;
}
