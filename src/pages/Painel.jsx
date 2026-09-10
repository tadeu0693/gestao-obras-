import { useMemo } from 'react';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { Regua, MiniRegua, Pill, GraficoSemanal, Totais } from '../components.jsx';
import { agruparPOs, filtrarPorCliente, totaisOrc, serieSemanal, moeda0, pct, data, STATUS_LOCAL, COR_STATUS, hojeISO } from '../lib/util.js';

export default function Painel() {
  const { dados, clienteId, nomeCliente } = useApp();
  const d = useMemo(() => filtrarPorCliente(dados, clienteId), [dados, clienteId]);
  const pos = useMemo(() => agruparPOs(d), [d]);

  const tot = useMemo(() => {
    const t = { orcado: 0, pago: 0, rob: 0, orcadoComRob: 0, cat: {} };
    d.orcamentos.forEach((o) => {
      const x = totaisOrc(o);
      t.orcado += x.orcado;
      t.pago += x.pago;
      t.rob += x.rob;
      if (x.rob) t.orcadoComRob += x.orcado;
      Object.entries(x.cat).forEach(([k, v]) => {
        t.cat[k] = t.cat[k] || { orcado: 0, pago: 0 };
        t.cat[k].orcado += v.orcado;
        t.cat[k].pago += v.pago;
      });
    });
    return t;
  }, [d]);

  const regioes = useMemo(() => {
    const m = {};
    d.locais.forEach((l) => {
      const r = l.regiao || 'Sem região';
      m[r] = m[r] || Object.fromEntries(STATUS_LOCAL.map((s) => [s, 0]));
      m[r][l.status || 'Não iniciada'] = (m[r][l.status || 'Não iniciada'] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [d]);

  const agenda = useMemo(() => {
    const hoje = hojeISO();
    const limite = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
    const ev = [];
    d.locais.forEach((l) => {
      if (l.inicioPrevisto && l.inicioPrevisto >= hoje && l.inicioPrevisto <= limite && l.status === 'Não iniciada') ev.push({ data: l.inicioPrevisto, tipo: 'Início previsto', l });
      if (l.fimPrevisto && l.fimPrevisto >= hoje && l.fimPrevisto <= limite && l.status !== 'Concluída') ev.push({ data: l.fimPrevisto, tipo: 'Término previsto', l });
      if (l.postes?.dataEntrega && l.postes.dataEntrega >= hoje && l.postes.dataEntrega <= limite) ev.push({ data: l.postes.dataEntrega, tipo: `Entrega de ${l.postes.qtd} poste(s)${l.postes.horaEntrega ? ' às ' + l.postes.horaEntrega : ''}`, l });
    });
    return ev.sort((a, b) => a.data.localeCompare(b.data)).slice(0, 14);
  }, [d]);

  const atrasados = d.locais.filter((l) => l.fimPrevisto && l.fimPrevisto < hojeISO() && l.status !== 'Concluída');
  const serie = useMemo(() => serieSemanal(d.orcamentos), [d]);

  if (!dados.orcamentos.length && !dados.locais.length) {
    return (
      <>
        <div className="topo">
          <div>
            <h1>Painel</h1>
          </div>
        </div>
        <div className="bloco vazio">
          <h2 style={{ marginBottom: 8 }}>Nenhum projeto cadastrado</h2>
          <p>Importe a planilha de uma proposta para criar o primeiro orçamento, ou carregue um backup em Configurações.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a className="btn primario" href="#/importar">Importar proposta</a>
            <a className="btn" href="#/config">Carregar backup</a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topo">
        <div>
          <h1>Painel</h1>
          <div className="sub">
            {pos.length} PO{pos.length !== 1 && 's'}, {d.locais.length} locais{clienteId ? ` de ${nomeCliente(clienteId)}` : ''}
          </div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
        </div>
      </div>

      <section className="bloco">
        <Regua orcado={tot.orcado} gasto={tot.pago} />
        {tot.rob > 0 && (
          <p className="muted pequeno-txt" style={{ margin: '10px 0 0' }}>
            Nas propostas com valor de venda informado: venda (ROB) de {moeda0(tot.rob)} para um custo de {moeda0(tot.orcadoComRob)}, margem bruta de {pct((tot.rob - tot.orcadoComRob) / tot.rob)}.
          </p>
        )}
      </section>

      {atrasados.length > 0 && (
        <div className="aviso">
          <strong>{atrasados.length} local(is) passaram do término previsto sem estar concluídos:</strong>{' '}
          {atrasados.slice(0, 6).map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}
              <a href={`#/locais/${l.id}`}>{l.nome}</a>
            </span>
          ))}
          {atrasados.length > 6 && ` e mais ${atrasados.length - 6}`}
        </div>
      )}

      <section className="bloco">
        <div className="bloco-cab">
          <h2>Orçado e gasto por PO</h2>
        </div>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>PO</th>
                <th>Cliente</th>
                <th>Orçamentos</th>
                <th className="num">Locais</th>
                <th className="num">Orçado</th>
                <th className="num">Gasto</th>
                <th className="num">Saldo</th>
                <th style={{ width: 150 }}>Consumo</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((g) => (
                <tr key={g.clienteId + g.po} className="clicavel" onClick={() => (g.orcamentos.length === 1 ? navegar(`orcamentos/${g.orcamentos[0].id}`) : navegar('orcamentos'))}>
                  <td>
                    <strong>{g.po}</strong>
                  </td>
                  <td>{nomeCliente(g.clienteId)}</td>
                  <td className="muted trunc" style={{ maxWidth: 300 }} title={g.orcamentos.map((o) => o.nome).join('\n')}>
                    {g.orcamentos.length > 1 ? `${g.orcamentos.length} orçamentos` : g.orcamentos[0]?.nome || '—'}
                  </td>
                  <td className="num">{g.locais.length}</td>
                  <td className="num">{moeda0(g.orcado)}</td>
                  <td className="num">{moeda0(g.pago)}</td>
                  <td className="num">{moeda0(g.orcado - g.pago)}</td>
                  <td>
                    <MiniRegua p={g.orcado ? g.pago / g.orcado : 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="duas-col" style={{ marginBottom: 20 }}>
        <section className="bloco">
          <div className="bloco-cab">
            <h2>Status por região</h2>
            <a href="#/locais" className="pequeno-txt">Ver locais</a>
          </div>
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Região</th>
                  {STATUS_LOCAL.map((s) => (
                    <th key={s} className="num">
                      <span className="pill" style={{ '--cor': COR_STATUS[s] }}>{s}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regioes.map(([r, c]) => (
                  <tr key={r}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r}</td>
                    {STATUS_LOCAL.map((s) => (
                      <td key={s} className="num" style={{ color: c[s] ? undefined : 'var(--linha-forte)' }}>
                        {c[s] || 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bloco">
          <div className="bloco-cab">
            <div>
              <h2>Próximas 5 semanas</h2>
              <p>Inícios, términos e entregas de postes</p>
            </div>
          </div>
          {agenda.length ? (
            <table>
              <tbody>
                {agenda.map((e, i) => (
                  <tr key={i} className="clicavel" onClick={() => navegar(`locais/${e.l.id}`)}>
                    <td className="num" style={{ width: 70 }}>
                      {data(e.data).slice(0, 5)}
                    </td>
                    <td>
                      <strong>{e.l.nome}</strong> <span className="muted">PO {e.l.po}</span>
                      <div className="pequeno-txt muted">{e.tipo}</div>
                    </td>
                    <td>
                      <Pill status={e.l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vazio">Nada programado para as próximas semanas.</div>
          )}
        </section>
      </div>

      <div className="duas-col">
        <section className="bloco">
          <div className="bloco-cab">
            <h2>Gasto acumulado por semana</h2>
          </div>
          <GraficoSemanal serie={serie} orcado={tot.orcado} />
        </section>
        <section className="bloco">
          <div className="bloco-cab">
            <h2>Por categoria</h2>
          </div>
          <Totais t={tot} />
        </section>
      </div>
    </>
  );
}
