import { useEffect, useMemo, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { filtrarPorCliente, agruparPOs, moeda0, data, hojeISO, COR_STATUS, pagoItem } from '../lib/util.js';

const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const diasNaFrente = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

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
          const pctGasto = g.orcado ? Math.min(Math.round((g.pago / g.orcado) * 100), 100) : 0;
          return { ...g, totalLocais, concluidos, pctLocais, pctGasto };
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
    return { concluidosSemana, gastoSemana, vencendoSemana };
  }, [d]);

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

      <section className="bloco">
        <h2 style={{ marginBottom: 14 }}>Progresso por PO</h2>
        {pos.length ? (
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
        )}
      </section>

      <div className="duas-col">
        <section className="bloco">
          <h2 style={{ marginBottom: 10 }}>Essa semana</h2>
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
        </section>

        <section className="bloco">
          <h2 style={{ marginBottom: 10 }}>Mapa da operação</h2>
          <MapaOperacao locais={d.locais} />
          <div className="legenda-mapa">
            {Object.entries(COR_STATUS).map(([status, cor]) => (
              <span key={status}>
                <i style={{ background: cor }} /> {status}
              </span>
            ))}
          </div>
        </section>
      </div>
    </>
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

  return <div ref={divRef} style={{ height: 340, borderRadius: 10, overflow: 'hidden' }} />;
}
