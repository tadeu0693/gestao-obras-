import { useMemo, useState } from 'react';
import { useApp, FiltroCliente } from '../App.jsx';
import { Icone } from '../components.jsx';
import { filtrarPorCliente, validacaoPO, quantitativo, numero, moeda0, exportarExcel } from '../lib/util.js';

const COR_SIT = { 'Falta na OP': 'falta', 'Sobra na OP': 'sobra', OK: 'ok', Recebido: 'ok', Parcial: 'sobra', 'Não recebido': '' };

export default function Materiais() {
  const { dados, clienteId } = useApp();
  const [aba, setAba] = useState('validacao');
  const d = filtrarPorCliente(dados, clienteId);
  return (
    <>
      <div className="topo">
        <div>
          <h1>Materiais</h1>
          <div className="sub">Compare o orçado nas POs com o levantamento de campo e acompanhe o que já chegou.</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
        </div>
      </div>
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'validacao'} className={aba === 'validacao' ? 'ativo' : ''} onClick={() => setAba('validacao')}>
          Orçado × levantado
        </button>
        <button role="tab" aria-selected={aba === 'quant'} className={aba === 'quant' ? 'ativo' : ''} onClick={() => setAba('quant')}>
          Quantitativo e recebimento
        </button>
      </div>
      {aba === 'validacao' ? <Validacao d={d} /> : <Quantitativo d={d} estoque={dados.estoque} />}
    </>
  );
}

function Validacao({ d }) {
  const pos = [...new Set([...d.orcamentos.map((o) => o.po), ...d.locais.map((l) => l.po)].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  const [po, setPo] = useState('');
  const [soLevantados, setSoLevantados] = useState(true);
  const orcs = d.orcamentos.filter((o) => !po || String(o.po) === po);
  const locs = d.locais.filter((l) => !po || String(l.po) === po);
  const linhas = useMemo(() => validacaoPO(orcs, locs).filter((r) => !soLevantados || r.levantado > 0), [orcs, locs, soLevantados]);
  const locaisComLev = locs.filter((l) => l.levantamento?.length).length;
  const cont = linhas.reduce((m, r) => ((m[r.sit] = (m[r.sit] || 0) + 1), m), {});

  const exportar = () =>
    exportarExcel(`Validacao_${po || 'todas'}.xlsx`, {
      Validação: linhas.map((r) => ({ Código: r.codigo, Descrição: r.descricao, Un: r.un, Orçado: r.orcado, Levantado: r.levantado, Diferença: r.dif, Situação: r.sit })),
    });

  return (
    <section className="bloco">
      <div className="filtros">
        <select value={po} onChange={(e) => setPo(e.target.value)} aria-label="PO">
          <option value="">Todas as POs</option>
          {pos.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={soLevantados} onChange={(e) => setSoLevantados(e.target.checked)} /> Só materiais levantados em campo
        </label>
        <span className="muted pequeno-txt">
          {locaisComLev} de {locs.length} locais com levantamento
        </span>
        <button className="pequeno" onClick={exportar} style={{ marginLeft: 'auto' }}>
          <Icone nome="baixar" tam={15} /> Exportar
        </button>
      </div>
      {Object.keys(cont).length > 0 && (
        <p className="pequeno-txt" style={{ marginTop: 0 }}>
          {Object.entries(cont).map(([k, v]) => (
            <span key={k} className={`tag ${COR_SIT[k] || ''}`} style={{ marginRight: 6 }}>
              {v} {k.toLowerCase()}
            </span>
          ))}
        </p>
      )}
      {linhas.length ? (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Un.</th>
                <th className="num">Orçado</th>
                <th className="num">Levantado</th>
                <th className="num">Diferença</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={(r.codigo || '') + r.descricao}>
                  <td>{r.codigo || <span className="muted">—</span>}</td>
                  <td>{r.descricao}</td>
                  <td>{r.un}</td>
                  <td className="num">{numero(r.orcado)}</td>
                  <td className="num">{numero(r.levantado)}</td>
                  <td className="num" style={{ color: r.dif < 0 && r.codigo ? 'var(--vermelho)' : undefined }}>
                    {r.codigo ? `${r.dif > 0 ? '+' : ''}${numero(r.dif)}` : <span className="muted">—</span>}
                  </td>
                  <td>
                    <span className={`tag ${COR_SIT[r.sit] || ''}`}>{r.sit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vazio">Nenhum levantamento de campo lançado para esta seleção. Preencha o levantamento técnico dentro de cada local.</div>
      )}
    </section>
  );
}

function Quantitativo({ d, estoque }) {
  const [so, setSo] = useState('');
  const linhas = useMemo(() => quantitativo(d.orcamentos, estoque).filter((r) => !so || r.sit === so), [d, estoque, so]);
  const pos = [...new Set(d.orcamentos.map((o) => o.po))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  const tot = linhas.reduce((s, r) => ({ custo: s.custo + r.custo, pago: s.pago + r.pago }), { custo: 0, pago: 0 });

  const exportar = () =>
    exportarExcel('Quantitativo_geral.xlsx', {
      Quantitativo: linhas.map((r) => ({
        'Cód.': r.codigo,
        Grupo: r.grupo,
        'Descrição do Item': r.descricao,
        ...Object.fromEntries(pos.map((p) => [`Qtd ${p}`, r.porPO[p] || 0])),
        'Qtd Total Orçada': r.qtd,
        'Custo Total Orçado (R$)': r.custo,
        'Qtd Total Comprada': r.comprada,
        'Valor Total Pago (R$)': r.pago,
        'Qtd Recebida (Estoque)': r.recebido,
        'Saldo a Receber': r.saldo,
        'Status Recebimento': r.sit,
        'Sobra sem OP': r.sobra,
      })),
    });

  return (
    <section className="bloco">
      <div className="filtros">
        <select value={so} onChange={(e) => setSo(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option>Não recebido</option>
          <option>Parcial</option>
          <option>Recebido</option>
        </select>
        <span className="muted pequeno-txt">
          {linhas.length} códigos, orçado {moeda0(tot.custo)}, pago {moeda0(tot.pago)}
        </span>
        <button className="pequeno" onClick={exportar} style={{ marginLeft: 'auto' }}>
          <Icone nome="baixar" tam={15} /> Exportar
        </button>
      </div>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              {pos.map((p) => (
                <th key={p} className="num">
                  {p}
                </th>
              ))}
              <th className="num">Total orçado</th>
              <th className="num">Custo orçado</th>
              <th className="num">Comprado</th>
              <th className="num">Recebido</th>
              <th className="num">A receber</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={(r.codigo || '') + r.descricao}>
                <td>{r.codigo || <span className="muted">—</span>}</td>
                <td style={{ minWidth: 240 }}>{r.descricao}</td>
                {pos.map((p) => (
                  <td key={p} className="num muted">
                    {r.porPO[p] ? numero(r.porPO[p]) : ''}
                  </td>
                ))}
                <td className="num">{numero(r.qtd)}</td>
                <td className="num">{moeda0(r.custo)}</td>
                <td className="num">{r.comprada ? numero(r.comprada) : ''}</td>
                <td className="num">{r.recebido ? numero(r.recebido) : ''}</td>
                <td className="num">{r.saldo ? numero(r.saldo) : ''}</td>
                <td>
                  <span className={`tag ${COR_SIT[r.sit] || ''}`}>{r.sit}</span>
                  {r.sobra > 0 && <span className="tag sobra" style={{ marginLeft: 4 }}>sobra {numero(r.sobra)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
