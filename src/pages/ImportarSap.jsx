import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { moeda, numero, data } from '../lib/util.js';
import { parseSapCompras, casarComOrcamentos } from '../lib/parseSap.js';

export default function ImportarSap() {
  const { dados, salvar, podeEditar, toast } = useApp();
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [excluir, setExcluir] = useState('4059');
  const [resultado, setResultado] = useState(null);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [aplicando, setAplicando] = useState(false);
  const [sobre, setSobre] = useState(false);
  const inputRef = useRef();

  const processar = async (files) => {
    const file = [...files].find((f) => /\.(xlsx|xlsm|xls)$/i.test(f.name));
    if (!file) return toast('Envie um arquivo .xlsx, .xlsm ou .xls', true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, bookVBA: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const excluirLista = excluir
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      const { consolidado, semCodigo, avisos, resumo } = parseSapCompras(aoa, { ano: ano ? Number(ano) : null, excluirSolicitacoes: excluirLista });
      const { atualizacoes, naoCasados } = casarComOrcamentos(consolidado, dados.orcamentos);
      setResultado({ atualizacoes, naoCasados, semCodigo, avisos, resumo, arquivo: file.name });
      setMarcadas(new Set(atualizacoes.map((a) => a.itemId)));
    } catch (err) {
      toast('Não consegui ler esse arquivo: ' + err.message, true);
    }
  };

  const alternar = (itemId) =>
    setMarcadas((s) => {
      const n = new Set(s);
      n.has(itemId) ? n.delete(itemId) : n.add(itemId);
      return n;
    });

  const aplicar = async () => {
    if (!resultado) return;
    setAplicando(true);
    const porOrcamento = new Map();
    for (const a of resultado.atualizacoes) {
      if (!marcadas.has(a.itemId)) continue;
      if (!porOrcamento.has(a.orcamentoId)) porOrcamento.set(a.orcamentoId, []);
      porOrcamento.get(a.orcamentoId).push(a);
    }
    for (const [orcamentoId, upds] of porOrcamento) {
      const o = dados.orcamentos.find((x) => x.id === orcamentoId);
      if (!o) continue;
      const itens = o.itens.map((i) => {
        const u = upds.find((x) => x.itemId === i.id);
        if (!u) return i;
        return { ...i, qtdComprada: u.qtdNova, valorUnitPago: u.precoNovo, dataCompra: u.dataNova || i.dataCompra };
      });
      await salvar('orcamentos', { ...o, itens });
    }
    setAplicando(false);
    toast(`${[...porOrcamento.values()].flat().length} itens atualizados.`);
    setResultado(null);
  };

  if (!podeEditar) return <div className="bloco vazio">Seu perfil é somente leitura e não pode importar compras do SAP.</div>;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Importar SAP</h1>
          <div className="sub">Sobe o relatório de Solicitação → Pedido → Recebimento → NF e atualiza a quantidade comprada e o valor pago dos itens.</div>
        </div>
      </div>

      <section className="bloco">
        <div className="filtros" style={{ marginBottom: 14 }}>
          <label className="campo" style={{ maxWidth: 140 }}>
            <span>Ano</span>
            <input value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ''))} placeholder="ex: 2026" />
          </label>
          <label className="campo" style={{ maxWidth: 260 }}>
            <span>Excluir nº de solicitação</span>
            <input value={excluir} onChange={(e) => setExcluir(e.target.value)} placeholder="ex: 4059, 4100" />
          </label>
        </div>

        <div
          className={`dropzone ${sobre ? 'sobre' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            processar(e.dataTransfer.files);
          }}
        >
          <Icone nome="importar" tam={28} />
          <p>Arraste o relatório do SAP aqui, ou clique para escolher</p>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => e.target.files.length && processar(e.target.files)} />
        </div>
      </section>

      {resultado && (
        <>
          {resultado.avisos.length > 0 && (
            <section className="bloco" style={{ borderColor: 'var(--amarelo)' }}>
              <p className="pequeno-txt">
                ⚠ O modelo da planilha parece diferente do esperado — confira se os dados abaixo saíram certos:
                <br />
                {resultado.avisos.join(' · ')}
              </p>
            </section>
          )}

          <section className="bloco">
            <p className="pequeno-txt muted">
              {resultado.resumo.linhasLidas} linhas lidas · {resultado.resumo.descartadasCanceladas} canceladas · {resultado.resumo.descartadasSemPedido} sem PO ·{' '}
              {resultado.resumo.descartadasAno} fora do ano · {resultado.resumo.descartadasExcluidas} de solicitações excluídas
            </p>
          </section>

          <section className="bloco">
            <div className="bloco-cab">
              <h2>
                Itens que vão ser atualizados <span className="tag ok">{resultado.atualizacoes.length}</span>
              </h2>
              <button className="pequeno" disabled={aplicando || !marcadas.size} onClick={aplicar}>
                {aplicando ? 'Aplicando…' : `Aplicar ${marcadas.size} atualização(ões)`}
              </button>
            </div>
            {resultado.atualizacoes.length ? (
              <div className="tabela-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th>PO</th>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th className="num">Qtd comprada</th>
                      <th className="num">Valor unit.</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.atualizacoes.map((a) => (
                      <tr key={a.itemId}>
                        <td>
                          <input type="checkbox" checked={marcadas.has(a.itemId)} onChange={() => alternar(a.itemId)} />
                        </td>
                        <td>{a.po}</td>
                        <td className="muted">{a.codigo}</td>
                        <td style={{ minWidth: 220 }}>{a.descricao}</td>
                        <td className="num">
                          {a.qtdAntes !== a.qtdNova ? (
                            <>
                              <span className="muted">{numero(a.qtdAntes)}</span> → <strong>{numero(a.qtdNova)}</strong>
                            </>
                          ) : (
                            numero(a.qtdNova)
                          )}
                        </td>
                        <td className="num">
                          {a.precoAntes !== a.precoNovo ? (
                            <>
                              <span className="muted">{moeda(a.precoAntes)}</span> → <strong>{moeda(a.precoNovo)}</strong>
                            </>
                          ) : (
                            moeda(a.precoNovo)
                          )}
                        </td>
                        <td className="pequeno-txt muted">{data(a.dataNova)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted pequeno-txt">Nenhum item bateu com os orçamentos cadastrados.</p>
            )}
          </section>

          <section className="bloco">
            <h2>
              Não encontrados nos orçamentos <span className="tag falta">{resultado.naoCasados.length}</span>
            </h2>
            <p className="pequeno-txt muted" style={{ marginBottom: 10 }}>
              Comprados no SAP para essas POs, mas sem item correspondente cadastrado no orçamento — não foram alterados. Adicione manualmente na tela do orçamento se fizer sentido.
            </p>
            {resultado.naoCasados.length > 0 && (
              <div className="tabela-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Projeto</th>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.naoCasados.map((g) => (
                      <tr key={g.projeto + g.codigo}>
                        <td>{g.projeto}</td>
                        <td className="muted">{g.codigo}</td>
                        <td style={{ minWidth: 220 }}>{g.descricao}</td>
                        <td className="num">{numero(g.qtd)}</td>
                        <td className="num">{moeda(g.preco)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
