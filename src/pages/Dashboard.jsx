import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { filtrarPorCliente, agruparPOs, moeda0, data, hojeISO, COR_STATUS, pagoItem, custoItem, api } from '../lib/util.js';

const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const diasNaFrente = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const SEGUNDOS_POR_SLIDE = 12;

function materiaisPorCodigo(d, poFiltro) {
  const mapa = new Map();
  for (const o of d.orcamentos) {
    if (poFiltro && o.po !== poFiltro) continue;
    for (const i of o.itens || []) {
      if (i.categoria === 'M.O') continue;
      const chave = i.codigo || i.descricao;
      if (!chave) continue;
      if (!mapa.has(chave)) mapa.set(chave, { codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, qtd: 0, comprada: 0 });
      const m = mapa.get(chave);
      m.qtd += Number(i.qtd) || 0;
      m.comprada += Math.min(Number(i.qtdComprada) || 0, Number(i.qtd) || 0);
    }
  }
  return [...mapa.values()]
    .map((m) => ({ ...m, faltante: Math.max(m.qtd - m.comprada, 0) }))
    .filter((m) => m.qtd > 0)
    .sort((a, b) => b.faltante - a.faltante);
}

export default function Dashboard() {
  const { dados, clienteId, nomeCliente, recarregar, podeEditar } = useApp();
  const d = filtrarPorCliente(dados, clienteId);

  const [poFiltro, setPoFiltro] = useState(null);
  const idleTimer = useRef(null);
  const selecionarPo = useCallback((po) => {
    setPoFiltro(po);
    clearTimeout(idleTimer.current);
    if (po) idleTimer.current = setTimeout(() => setPoFiltro(null), 5 * 60 * 1000);
  }, []);

  const [mo, setMo] = useState(null);
  useEffect(() => {
    const buscar = () => api('mo-integracao').then((r) => setMo(r.porPo || [])).catch(() => setMo([]));
    buscar();
    const t = setInterval(async () => {
      if (podeEditar) await api(`mo-integracao?sincronizar=1`).catch(() => {});
      recarregar();
      buscar();
    }, 60_000);
    return () => clearInterval(t);
  }, [recarregar, podeEditar]);

  const pos = useMemo(
    () =>
      agruparPOs(d)
        .map((g) => {
          const totalLocais = g.locais.length;
          const concluidos = g.locais.filter((l) => l.status === 'Concluída').length;
          const pctLocais = totalLocais ? Math.round((concluidos / totalLocais) * 100) : null;

          // Nos dashboards, M.O (recurso técnico/horas) fica de fora do orçado e gasto —
          // ainda não é medido, entra quando as horas técnicas forem implementadas.
          let orcado = 0;
          let pago = 0;
          let materialTotal = 0;
          let materialComprado = 0;
          for (const o of g.orcamentos)
            for (const i of o.itens || []) {
              if (i.categoria === 'M.O') continue;
              orcado += custoItem(i);
              pago += pagoItem(i);
              materialTotal += custoItem(i);
              materialComprado += Math.min(Number(i.qtdComprada) || 0, Number(i.qtd) || 0) * (Number(i.custoUnit) || 0);
            }
          const estourado = pago > orcado;
          const pctGasto = orcado ? Math.min(Math.round((pago / orcado) * 100), 100) : 0;
          const materialFaltante = Math.max(materialTotal - materialComprado, 0);
          const pctMaterial = materialTotal ? Math.round((materialComprado / materialTotal) * 100) : 0;

          return { ...g, orcado, pago, totalLocais, concluidos, pctLocais, pctGasto, estourado, materialTotal, materialComprado, materialFaltante, pctMaterial };
        })
        .sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true })),
    [d],
  );

  useEffect(() => {
    setPoFiltro(null);
    clearTimeout(idleTimer.current);
  }, [clienteId]);

  const materiaisGeral = useMemo(() => materiaisPorCodigo(d, null), [d]);
  const materiaisFiltrados = useMemo(() => materiaisPorCodigo(d, poFiltro), [d, poFiltro]);

  const moPorPo = useMemo(() => {
    const posValidas = new Set(d.orcamentos.map((o) => o.po));
    return (mo || [])
      .filter((r) => posValidas.has(r.po) && (r.moOrcado || r.custo))
      .sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true }));
  }, [mo, d]);

  const semana = useMemo(() => {
    const corte = diasAtras(7);
    const concluidosSemana = d.locais.filter((l) => l.status === 'Concluída' && l.atualizadoEm && l.atualizadoEm.slice(0, 10) >= corte);
    let gastoSemana = 0;
    for (const o of d.orcamentos) for (const i of o.itens || []) if (i.dataCompra && i.dataCompra >= corte) gastoSemana += pagoItem(i);
    const hoje = hojeISO();
    const limite = diasNaFrente(7);
    const vencendoSemana = d.orcamentos.filter((o) => o.vencimento && o.vencimento >= hoje && o.vencimento <= limite && !['Encerrado', 'Perdido'].includes(o.status));
    const proximosInicios = d.locais
      .filter((l) => l.status === 'Não iniciada' && l.inicioPrevisto && l.inicioPrevisto >= hoje)
      .sort((a, b) => a.inicioPrevisto.localeCompare(b.inicioPrevisto))
      .slice(0, 5);
    return { concluidosSemana, gastoSemana, vencendoSemana, proximosInicios };
  }, [d]);

  const POR_SLIDE_PROGRESSO = 4;
  const POR_SLIDE_CARDS = 6;
  const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  const paginasProgresso = chunk(pos, POR_SLIDE_PROGRESSO);
  const paginasCards = chunk(pos, POR_SLIDE_CARDS);
  const paginasMO = chunk(moPorPo, POR_SLIDE_CARDS);

  const slides = [
    ...paginasProgresso.map((pagina, i) => ({
      titulo: paginasProgresso.length > 1 ? `Progresso por PO (${i + 1}/${paginasProgresso.length})` : 'Progresso por PO',
      conteudo: <SlideProgresso pos={pagina} nomeCliente={nomeCliente} onSelecionarPo={selecionarPo} poAtiva={poFiltro} />,
    })),
    ...paginasCards.map((pagina, i) => ({
      titulo: paginasCards.length > 1 ? `Orçamento e material por PO (${i + 1}/${paginasCards.length})` : 'Orçamento e material por PO',
      conteudo: <SlideOrcamentoMaterial pos={pagina} nomeCliente={nomeCliente} onSelecionarPo={selecionarPo} poAtiva={poFiltro} />,
    })),
    ...(paginasMO.length
      ? paginasMO.map((pagina, i) => ({
          titulo: paginasMO.length > 1 ? `M.O por PO (${i + 1}/${paginasMO.length})` : 'M.O por PO',
          conteudo: <SlideMO pos={pagina} onSelecionarPo={selecionarPo} poAtiva={poFiltro} />,
        }))
      : [{ titulo: 'M.O por PO', conteudo: <p className="muted pequeno-txt">Nenhum dado de M.O disponível ainda.</p> }]),
    { titulo: 'Materiais por quantidade', conteudo: <SlideMateriaisQtd materiais={materiaisGeral} /> },
    { titulo: 'Essa semana e mapa da operação', conteudo: <SlideSemanaMapa semana={semana} locais={d.locais} /> },
  ];

  return (
    <>
      <div className="topo">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Visão geral da operação — pensada pra ficar num telão ou monitor.</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
        </div>
      </div>

      {poFiltro ? (
        <PainelInterativo
          pos={pos}
          moPorPo={moPorPo}
          materiais={materiaisFiltrados}
          nomeCliente={nomeCliente}
          poFiltro={poFiltro}
          setPoFiltro={selecionarPo}
        />
      ) : (
        <Carrossel slides={slides} />
      )}
    </>
  );
}

function PainelInterativo({ pos, moPorPo, materiais, nomeCliente, poFiltro, setPoFiltro }) {
  const posFiltradas = poFiltro ? pos.filter((g) => g.po === poFiltro) : pos;
  const moFiltrado = poFiltro ? moPorPo.filter((r) => r.po === poFiltro) : moPorPo;

  return (
    <div>
      {poFiltro && (
        <div className="filtro-ativo">
          Filtrando por <strong>PO {poFiltro}</strong>
          <span className="muted pequeno-txt">— volta ao carrossel automático após 5 min sem uso</span>
          <button className="fantasma" onClick={() => setPoFiltro(null)}>
            ❚❚ Voltar ao carrossel
          </button>
        </div>
      )}
      <div className="grid-interativo">
        <section className="painel-secao">
          <h3>Progresso por PO</h3>
          <SlideProgresso pos={pos} nomeCliente={nomeCliente} onSelecionarPo={setPoFiltro} poAtiva={poFiltro} />
        </section>
        <section className="painel-secao">
          <h3>Orçamento e material por PO</h3>
          <SlideOrcamentoMaterial pos={posFiltradas} nomeCliente={nomeCliente} onSelecionarPo={setPoFiltro} poAtiva={poFiltro} />
        </section>
        <section className="painel-secao">
          <h3>Materiais por quantidade{poFiltro ? ` — PO ${poFiltro}` : ''}</h3>
          <SlideMateriaisQtd materiais={materiais} />
        </section>
        <section className="painel-secao">
          <h3>M.O por PO</h3>
          {moFiltrado.length ? <SlideMO pos={moFiltrado} /> : <p className="muted pequeno-txt">Nenhum dado de M.O disponível ainda.</p>}
        </section>
      </div>
    </div>
  );
}

function Carrossel({ slides }) {
  const [ativo, setAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setAtivo((a) => (a + 1) % slides.length), SEGUNDOS_POR_SLIDE * 1000);
    return () => clearInterval(t);
  }, [pausado, slides.length]);

  return (
    <div className="carrossel">
      <div className="carrossel-cab">
        <h2>{slides[ativo].titulo}</h2>
        <div className="carrossel-controles">
          <button className="fantasma" aria-label="Slide anterior" onClick={() => setAtivo((a) => (a - 1 + slides.length) % slides.length)}>
            ‹
          </button>
          <button className="fantasma" aria-label={pausado ? 'Retomar rotação' : 'Pausar rotação'} onClick={() => setPausado((p) => !p)}>
            {pausado ? '▶' : '❚❚'}
          </button>
          <button className="fantasma" aria-label="Próximo slide" onClick={() => setAtivo((a) => (a + 1) % slides.length)}>
            ›
          </button>
        </div>
      </div>

      <div className="carrossel-viewport">
        <div className="carrossel-trilho" style={{ transform: `translateX(-${ativo * 100}%)` }}>
          {slides.map((s, i) => (
            <div className="carrossel-slide" key={i}>
              {s.conteudo}
            </div>
          ))}
        </div>
      </div>

      <div className="carrossel-pontos">
        {slides.map((s, i) => (
          <button key={i} className={`ponto ${i === ativo ? 'ativo' : ''}`} aria-label={`Ir para ${s.titulo}`} onClick={() => setAtivo(i)} />
        ))}
      </div>
    </div>
  );
}

function SlideProgresso({ pos, nomeCliente, onSelecionarPo, poAtiva }) {
  return pos.length ? (
    <div className="progresso-pos">
      {pos.map((g) => (
        <div
          key={g.clienteId + g.po}
          className={`linha-progresso clicavel${poAtiva === g.po ? ' ativa' : ''}`}
          onClick={() =>
            onSelecionarPo
              ? onSelecionarPo(poAtiva === g.po ? null : g.po)
              : g.orcamentos.length === 1
                ? navegar(`orcamentos/${g.orcamentos[0].id}`)
                : navegar('orcamentos')
          }
        >
          <div className="linha-progresso-cab">
            <strong>PO {g.po}</strong>
            <span className="muted pequeno-txt">
              {nomeCliente(g.clienteId)} · {g.totalLocais} local{g.totalLocais !== 1 && 'is'}
            </span>
          </div>
          <div className="barra-dupla">
            <div className="barra-rotulo">
              <span>Locais concluídos</span>
              <span>{g.pctLocais == null ? '—' : `${g.concluidos}/${g.totalLocais} (${g.pctLocais}%)`}</span>
            </div>
            <div className="barra-fundo">
              <div className="barra-preenchida verde" style={{ width: `${g.pctLocais || 0}%` }} />
            </div>
            <div className="barra-rotulo">
              <span>Orçamento gasto</span>
              <span>
                {moeda0(g.pago)} de {moeda0(g.orcado)} ({g.pctGasto}%)
              </span>
            </div>
            <div className="barra-fundo">
              <div className="barra-preenchida aqua" style={{ width: `${g.pctGasto}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="muted pequeno-txt">Nenhum projeto cadastrado ainda.</p>
  );
}

function SlideOrcamentoMaterial({ pos, nomeCliente, onSelecionarPo, poAtiva }) {
  if (!pos.length) return <p className="muted pequeno-txt">Nenhum projeto cadastrado ainda.</p>;
  return (
    <div className="grid-cards-po">
      {pos.map((g) => (
        <CardOrcamentoPO key={g.clienteId + g.po} g={g} nomeCliente={nomeCliente} onSelecionarPo={onSelecionarPo} poAtiva={poAtiva} />
      ))}
    </div>
  );
}

function CardOrcamentoPO({ g, nomeCliente, onSelecionarPo, poAtiva }) {
  const cor = g.estourado ? 'var(--vermelho)' : 'var(--verde)';
  const pctMostrado = g.estourado ? 100 : g.pctGasto;
  const dadosGauge = [{ value: pctMostrado, fill: cor }];
  const dadosMaterial = [{ po: 'material', Comprado: Math.round(g.materialComprado), Faltante: Math.round(g.materialFaltante) }];
  const ativa = poAtiva === g.po;

  return (
    <div
      className={`card-po clicavel${ativa ? ' ativa' : ''}`}
      onClick={() =>
        onSelecionarPo
          ? onSelecionarPo(ativa ? null : g.po)
          : g.orcamentos.length === 1
            ? navegar(`orcamentos/${g.orcamentos[0].id}`)
            : navegar('orcamentos')
      }
    >
      <div className="card-po-cab">
        <strong>PO {g.po}</strong>
        <span className="muted pequeno-txt">{nomeCliente(g.clienteId)}</span>
      </div>

      <div className="gauge-wrap">
        <ResponsiveContainer width="100%" height={130}>
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={dadosGauge} startAngle={90} endAngle={-270} barSize={12}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'var(--nevoa)' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="gauge-centro">
          <strong style={{ color: cor }}>{g.estourado ? `+${Math.round(((g.pago - g.orcado) / g.orcado) * 100)}%` : `${g.pctGasto}%`}</strong>
          <span>{g.estourado ? 'estourado' : 'do orçado'}</span>
        </div>
      </div>
      <p className="pequeno-txt muted" style={{ textAlign: 'center', margin: '2px 0 12px' }}>
        {moeda0(g.pago)} de {moeda0(g.orcado)}
      </p>

      <div className="pequeno-txt muted" style={{ marginBottom: 4 }}>
        Material: {moeda0(g.materialComprado)} comprado, falta {moeda0(g.materialFaltante)}
      </div>
      <div style={{ width: '100%', height: 34 }}>
        <ResponsiveContainer>
          <BarChart data={dadosMaterial} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="po" hide />
            <Tooltip formatter={(v) => moeda0(v)} />
            <Bar dataKey="Comprado" stackId="m" fill="var(--aqua)" />
            <Bar dataKey="Faltante" stackId="m" fill="var(--nevoa)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const truncar = (txt, n = 22) => (txt && txt.length > n ? `${txt.slice(0, n - 1)}…` : txt || '');

function SlideMateriaisQtd({ materiais }) {
  if (!materiais.length) return <p className="muted pequeno-txt">Nenhum material cadastrado ainda.</p>;
  const top = materiais.slice(0, 8);
  return (
    <div style={{ width: '100%', height: top.length * 44 + 20 }}>
      <ResponsiveContainer>
        <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barCategoryGap={10}>
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="descricao"
            width={130}
            interval={0}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => truncar(v)}
          />
          <Tooltip
            labelFormatter={(v) => v}
            formatter={(valor, nome, item) => [`${valor.toLocaleString('pt-BR')} ${item.payload.unidade || ''}`.trim(), nome]}
          />
          <Bar dataKey="comprada" name="Comprado" stackId="m" fill="var(--aqua)" barSize={18} />
          <Bar dataKey="faltante" name="Faltante" stackId="m" fill="var(--nevoa)" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SlideMO({ pos, onSelecionarPo, poAtiva }) {
  if (!pos.length) return <p className="muted pequeno-txt">Nenhum dado de M.O disponível ainda.</p>;
  return (
    <div className="grid-cards-po">
      {pos.map((r) => (
        <CardMO key={r.po} r={r} onSelecionarPo={onSelecionarPo} poAtiva={poAtiva} />
      ))}
    </div>
  );
}

function CardMO({ r, onSelecionarPo, poAtiva }) {
  const estourado = r.pctConsumido != null && r.pctConsumido > 100;
  const cor = estourado ? 'var(--vermelho)' : 'var(--verde)';
  const pctMostrado = estourado ? 100 : r.pctConsumido || 0;
  const dadosGauge = [{ value: pctMostrado, fill: cor }];
  const horas = (r.horasNormais || 0) + (r.horasExtras || 0);
  const ativa = poAtiva === r.po;

  return (
    <div
      className={`card-po${ativa ? ' ativa' : ''}`}
      onClick={() => (onSelecionarPo ? onSelecionarPo(ativa ? null : r.po) : navegar('orcamentos'))}
    >
      <div className="card-po-cab">
        <strong>PO {r.po}</strong>
        <span className="muted pequeno-txt">{horas.toLocaleString('pt-BR')}h apontadas</span>
      </div>
      <div className="gauge-wrap">
        <ResponsiveContainer width="100%" height={130}>
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={dadosGauge} startAngle={90} endAngle={-270} barSize={12}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'var(--nevoa)' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="gauge-centro">
          <strong style={{ color: cor }}>{r.pctConsumido == null ? '—' : estourado ? `+${r.pctConsumido - 100}%` : `${r.pctConsumido}%`}</strong>
          <span>{estourado ? 'estourado' : 'do M.O'}</span>
        </div>
      </div>
      <p className="pequeno-txt muted" style={{ textAlign: 'center', margin: '2px 0 6px' }}>
        {moeda0(r.custo)} de {moeda0(r.moOrcado)}
      </p>
      {r.terceiros > 0 && (
        <p className="pequeno-txt muted" style={{ textAlign: 'center', margin: '0 0 6px' }}>
          inclui {moeda0(r.terceiros)} de terceiros (SC)
        </p>
      )}
      {r.composicoesSemRegra?.length > 0 && (
        <p className="pequeno-txt" style={{ color: 'var(--amarelo)', textAlign: 'center' }}>
          {r.composicoesSemRegra.length} equipe(s) sem regra de valor
        </p>
      )}
    </div>
  );
}

function SlideSemanaMapa({ semana, locais }) {
  return (
    <div className="duas-col" style={{ marginTop: 0 }}>
      <section>
        <h3 style={{ marginBottom: 10 }}>Essa semana</h3>
        <div className="resumo-semana">
          <div>
            <strong>{semana.concluidosSemana.length}</strong>
            <span>local{semana.concluidosSemana.length !== 1 && 'is'} concluído{semana.concluidosSemana.length !== 1 && 's'}</span>
          </div>
          <div>
            <strong>{moeda0(semana.gastoSemana)}</strong>
            <span>gasto em compras</span>
          </div>
          <div>
            <strong>{semana.vencendoSemana.length}</strong>
            <span>orçamento{semana.vencendoSemana.length !== 1 && 's'} vencendo</span>
          </div>
        </div>
        {semana.concluidosSemana.length > 0 && (
          <ul className="lista-simples">
            {semana.concluidosSemana.slice(0, 4).map((l) => (
              <li key={l.id}>
                ✓ {l.nome} <span className="muted pequeno-txt">— {data(l.atualizadoEm)}</span>
              </li>
            ))}
            {semana.concluidosSemana.length > 4 && <li className="muted pequeno-txt">+ {semana.concluidosSemana.length - 4} mais</li>}
          </ul>
        )}
        {semana.proximosInicios.length > 0 && (
          <>
            <h3 style={{ margin: '18px 0 8px' }}>Próximos a começar</h3>
            <ul className="lista-simples">
              {semana.proximosInicios.slice(0, 4).map((l) => (
                <li key={l.id}>
                  {l.nome} <span className="muted pequeno-txt">— início previsto {data(l.inicioPrevisto)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h3 style={{ marginBottom: 10 }}>Mapa da operação</h3>
        <MapaOperacao locais={locais} />
        <div className="legenda-mapa">
          {Object.entries(COR_STATUS).map(([status, cor]) => (
            <span key={status}>
              <i style={{ background: cor }} /> {status}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function MapaOperacao({ locais }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const camadaRef = useRef(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { scrollWheelZoom: false }).setView([-22.4, -48.5], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    camadaRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const camada = camadaRef.current;
    if (!map || !camada) return;
    camada.clearLayers();
    const pontos = locais.filter((l) => l.lat && l.lng);
    for (const l of pontos) {
      L.circleMarker([l.lat, l.lng], {
        radius: 7,
        color: '#fff',
        weight: 1.5,
        fillColor: COR_STATUS[l.status] || 'var(--cinza-status)',
        fillOpacity: 0.9,
      })
        .bindTooltip(`${l.nome} — ${l.status || 'Não iniciada'}`)
        .addTo(camada);
    }
    if (pontos.length) {
      const grupo = L.featureGroup(pontos.map((l) => L.marker([l.lat, l.lng])));
      map.fitBounds(grupo.getBounds().pad(0.15));
    }
    setTimeout(() => map.invalidateSize(), 50);
  }, [locais]);

  const semCoordenadas = !locais.some((l) => l.lat && l.lng);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={divRef} style={{ height: 300, borderRadius: 10, overflow: 'hidden' }} />
      {semCoordenadas && (
        <div className="mapa-vazio">
          Nenhum local com coordenadas ainda.
          <br />
          Importe o backup atualizado para ver os pontos aqui.
        </div>
      )}
    </div>
  );
}
