import { useMemo, useState } from 'react';
import { useApp, FiltroCliente } from '../App.jsx';
import { Icone } from '../components.jsx';
import { filtrarPorCliente, consolidarOrcamentos, numero, moeda0, exportarExcel } from '../lib/util.js';

export default function Consolidado() {
  const { dados, clienteId, nomeCliente } = useApp();
  const d = filtrarPorCliente(dados, clienteId);
  const orcs = d.orcamentos;
  const [selecionados, setSelecionados] = useState(() => new Set(orcs.map((o) => o.id)));

  // Mantém a seleção coerente quando o cliente filtrado muda (seleciona tudo de novo)
  const chavesAtuais = orcs.map((o) => o.id).join(',');
  const [chaveAnterior, setChaveAnterior] = useState(chavesAtuais);
  if (chavesAtuais !== chaveAnterior) {
    setChaveAnterior(chavesAtuais);
    setSelecionados(new Set(orcs.map((o) => o.id)));
  }

  const marcados = orcs.filter((o) => selecionados.has(o.id));
  const pos = [...new Set(marcados.map((o) => o.po))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  const linhas = useMemo(() => consolidarOrcamentos(marcados), [marcados.map((o) => o.id).join(',')]);
  const totCusto = linhas.reduce((s, r) => s + r.custo, 0);

  const alternar = (id) =>
    setSelecionados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const exportar = () =>
    exportarExcel(`Consolidado_${clienteId ? nomeCliente(clienteId) : 'todos'}.xlsx`, {
      Consolidado: linhas.map((r) => ({
        Grupo: r.grupo,
        Categoria: r.categoria,
        'Cód.': r.codigo,
        'Descrição do Item': r.descricao,
        Un: r.un,
        ...Object.fromEntries(pos.map((p) => [`Qtd ${p}`, r.porPO[p] || 0])),
        'Qtd Total Orçada': r.qtd,
        'Custo Total Orçado (R$)': r.custo,
      })),
    });

  return (
    <>
      <div className="topo">
        <div>
          <h1>Consolidado</h1>
          <div className="sub">Escolha os projetos e veja o total de material somado entre eles.</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
        </div>
      </div>

      <section className="bloco">
        <h3 style={{ marginBottom: 10 }}>Projetos incluídos</h3>
        {orcs.length ? (
          <div className="filtros" style={{ flexWrap: 'wrap' }}>
            {orcs.map((o) => (
              <label key={o.id} className="check">
                <input type="checkbox" checked={selecionados.has(o.id)} onChange={() => alternar(o.id)} />
                {o.po ? `PO ${o.po}` : 'sem PO'} — {o.nome}
              </label>
            ))}
            <button className="pequeno" onClick={() => setSelecionados(new Set(orcs.map((o) => o.id)))} style={{ marginLeft: 'auto' }}>
              Marcar todos
            </button>
            <button className="pequeno" onClick={() => setSelecionados(new Set())}>
              Desmarcar todos
            </button>
          </div>
        ) : (
          <div className="vazio">Nenhum orçamento cadastrado para esta seleção.</div>
        )}
      </section>

      {marcados.length > 0 && (
        <section className="bloco">
          <div className="filtros">
            <span className="muted pequeno-txt">
              {marcados.length} projeto{marcados.length !== 1 && 's'} selecionado{marcados.length !== 1 && 's'}, {linhas.length} itens, total {moeda0(totCusto)}
            </span>
            <button className="pequeno" onClick={exportar} style={{ marginLeft: 'auto' }}>
              <Icone nome="baixar" tam={15} /> Exportar
            </button>
          </div>
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Descrição do Item</th>
                  {pos.map((p) => (
                    <th key={p} className="num">
                      Qtd {p}
                    </th>
                  ))}
                  <th className="num">Qtd Total Orçada</th>
                  <th className="num">Custo Total Orçado (R$)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <tr key={(r.codigo || '') + r.descricao}>
                    <td>{r.grupo}</td>
                    <td style={{ minWidth: 260 }}>{r.descricao}</td>
                    {pos.map((p) => (
                      <td key={p} className="num muted">
                        {r.porPO[p] ? numero(r.porPO[p]) : '—'}
                      </td>
                    ))}
                    <td className="num">{numero(r.qtd)}</td>
                    <td className="num">{r.custo ? moeda0(r.custo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2 + pos.length} className="num muted">
                    {linhas.length} itens
                  </td>
                  <td />
                  <td className="num">{moeda0(totCusto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
