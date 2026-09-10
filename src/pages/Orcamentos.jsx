import { useMemo, useState } from 'react';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { Icone, MiniRegua } from '../components.jsx';
import { filtrarPorCliente, totaisOrc, moeda0, pct, data, semAcento, uid, STATUS_ORC } from '../lib/util.js';

export default function Orcamentos() {
  const { dados, clienteId, nomeCliente, salvar, podeEditar, toast } = useApp();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const d = filtrarPorCliente(dados, clienteId);

  const linhas = useMemo(() => {
    const q = semAcento(busca);
    return d.orcamentos
      .filter((o) => !status || (o.status || 'Em análise') === status)
      .filter((o) => !q || semAcento(`${o.po} ${o.nome} ${nomeCliente(o.clienteId)} ${o.comercial}`).includes(q))
      .map((o) => ({ o, t: totaisOrc(o) }))
      .sort((a, b) => String(a.o.po).localeCompare(String(b.o.po), 'pt-BR', { numeric: true }) || a.o.nome.localeCompare(b.o.nome));
  }, [d, busca, status, nomeCliente]);

  const novo = async () => {
    const cid = clienteId || dados.clientes[0]?.id;
    if (!cid) {
      toast('Cadastre um cliente antes de criar um orçamento.', true);
      return navegar('clientes');
    }
    const [o] = await salvar('orcamentos', { id: uid(), clienteId: cid, po: '', nome: 'Novo orçamento', status: 'Em análise', itens: [] });
    navegar(`orcamentos/${o.id}`);
  };

  const soma = linhas.reduce((s, { t }) => ({ orcado: s.orcado + t.orcado, pago: s.pago + t.pago, rob: s.rob + t.rob }), { orcado: 0, pago: 0, rob: 0 });

  return (
    <>
      <div className="topo">
        <div>
          <h1>Orçamentos</h1>
          <div className="sub">Cada proposta importada vira um orçamento, agrupado pela PO.</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
          {podeEditar && (
            <>
              <button onClick={novo}>
                <Icone nome="mais" /> Em branco
              </button>
              <a className="btn primario" href="#/importar">
                <Icone nome="importar" /> Importar proposta
              </a>
            </>
          )}
        </div>
      </div>
      <div className="filtros">
        <input type="search" placeholder="Buscar por PO, nome ou comercial" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUS_ORC.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <section className="bloco">
        {linhas.length ? (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Orçamento</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Vencimento</th>
                  <th className="num">Itens</th>
                  <th className="num">Custo orçado</th>
                  <th className="num">Venda (ROB)</th>
                  <th className="num">Margem</th>
                  <th className="num">Gasto</th>
                  <th style={{ width: 120 }}>Consumo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ o, t }) => (
                  <tr key={o.id} className="clicavel" onClick={() => navegar(`orcamentos/${o.id}`)}>
                    <td>
                      <strong>{o.po || '—'}</strong>
                    </td>
                    <td>
                      {o.nome}
                      {o.revisao && <span className="tag" style={{ marginLeft: 6 }}>Rev {o.revisao}</span>}
                    </td>
                    <td>{nomeCliente(o.clienteId)}</td>
                    <td>{o.status || 'Em análise'}</td>
                    <td>{data(o.vencimento)}</td>
                    <td className="num">{o.itens?.length || 0}</td>
                    <td className="num">{moeda0(t.orcado)}</td>
                    <td className="num">{t.rob ? moeda0(t.rob) : '—'}</td>
                    <td className="num">{t.rob ? pct((t.rob - t.orcado) / t.rob) : '—'}</td>
                    <td className="num">{moeda0(t.pago)}</td>
                    <td>
                      <MiniRegua p={t.orcado ? t.pago / t.orcado : 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>{linhas.length} orçamento(s)</td>
                  <td className="num">{moeda0(soma.orcado)}</td>
                  <td className="num">{soma.rob ? moeda0(soma.rob) : '—'}</td>
                  <td />
                  <td className="num">{moeda0(soma.pago)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="vazio">Nenhum orçamento encontrado. Importe uma proposta para começar.</div>
        )}
      </section>
    </>
  );
}
