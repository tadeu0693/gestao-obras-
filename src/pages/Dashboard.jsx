import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { filtrarPorCliente, agruparPOs, moeda0, data, hojeISO, COR_STATUS, pagoItem, custoItem } from '../lib/util.js';

const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const diasNaFrente = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const SEGUNDOS_POR_SLIDE = 12;

export default function Dashboard() {
  const { dados, clienteId, nomeCliente } = useApp();
  const d = filtrarPorCliente(dados, clienteId);

  const pos = useMemo(
    () =>
      agruparPOs(d)
        .map((g) => {
          const totalLocais = g.locais.length;
          const concluidos = g.locais.filter((l) => l.status === 'Concluída').length;
          const pctLocais = totalLocais ? Math.round((concluidos / totalLocais) * 100) : null;
          const estourado = g.pago > g.orcado;
          const pctGasto = g.orcado ? Math.min(Math.round((g.pago / g.orcado) * 100), 100) : 0;

          let materialTotal = 0;
          let materialComprado = 0;
          for (const o of g.orcamentos)
            for (const i of o.itens || []) {
              materialTotal += custoItem(i);
              materialComprado += Math.min(Number(i.qtdComprada) || 0, Number(i.qtd) || 0) * (Number(i.custoUnit) || 0);
            }
          const materialFaltante = Math.max(materialTotal - materialComprado, 0);
          const pctMaterial = materialTotal ? Math.round((materialComprado / materialTotal) * 100) : 0;

          return { ...g, totalLocais, concluidos, pctLocais, pctGasto, estourado, materialTotal, materialComprado, materialFaltante, pctMaterial };
        })
        .sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true })),
    [d],
  );

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

  const slides = [
    { titulo: 'Progresso por PO', conteudo: <SlideProgresso pos={pos} nomeCliente={nomeCliente} /> },
    { titulo: 'Orçamento e material por PO', conteudo: <SlideOrcamentoMaterial pos={pos} nomeCliente={nomeCliente} /> },
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

      <Carrossel slides={slides} />
    </>
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

function SlideProgresso({ pos, nomeCliente }) {
  return pos.length ? (
    <div className="progresso-pos">
      {pos.map((g) => (
        <div key={g.clienteId + g.po} className="linha-progresso clicavel" onClick={() => (g.orcamentos.length === 1 ? navegar(`orcamentos/${g.orcamentos[0].id}`) : navegar('orcamentos'))}>
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

function SlideOrcamentoMaterial({ pos, nomeCliente }) {
  if (!pos.length) return <p className="muted pequeno-txt">Nenhum projeto cadastrado ainda.</p>;
  return (
    <div className="grid-cards-po">
      {pos.map((g) => (
        <CardOrcamentoPO key={g.clienteId + g.po} g={g} nomeCliente={nomeCliente} />
      ))}
    </div>
  );
}

function CardOrcamentoPO({ g, nomeCliente }) {
  const cor = g.estourado ? 'var(--vermelho)' : 'var(--verde)';
  const pctMostrado = g.estourado ? 100 : g.pctGasto;
  const dadosGauge = [{ value: pctMostrado, fill: cor }];
  const dadosMaterial = [{ po: 'material', Comprado: Math.round(g.materialComprado), Faltante: Math.round(g.materialFaltante) }];

  return (
    <div className="card-po clicavel" onClick={() => (g.orcamentos.length === 1 ? navegar(`orcamentos/${g.orcamentos[0].id}`) : navegar('orcamentos'))}>
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
            {semana.concluidosSemana.map((l) => (
              <li key={l.id}>
                ✓ {l.nome} <span className="muted pequeno-txt">— {data(l.atualizadoEm)}</span>
              </li>
            ))}
          </ul>
        )}
        {semana.proximosInicios.length > 0 && (
          <>
            <h3 style={{ margin: '18px 0 8px' }}>Próximos a começar</h3>
            <ul className="lista-simples">
              {semana.proximosInicios.map((l) => (
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

  return <div ref={divRef} style={{ height: 300, borderRadius: 10, overflow: 'hidden' }} />;
}
