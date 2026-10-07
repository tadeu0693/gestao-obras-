import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { moeda, numero, data, uid } from '../lib/util.js';
import { parseSapCompras, casarComOrcamentos } from '../lib/parseSap.js';

export default function ImportarSap() {
  const { dados, salvar, podeEditar, toast } = useApp();
  const [ano, setAno] = useState('');
  const [excluir, setExcluir] = useState('4059');
  const [resultado, setResultado] = useState(null);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [novasMarcadas, setNovasMarcadas] = useState(() => new Set());
  const [filtroPo, setFiltroPo] = useState('');
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
      const { consolidado, semCodigo, avisos, resumo, historico } = parseSapCompras(aoa, { ano: ano && ano.trim() ? Number(ano) : null, excluirSolicitacoes: excluirLista });
      const { atualizacoes, naoCasados } = casarComOrcamentos(consolidado, dados.orcamentos, semCodigo);
      setResultado({ atualizacoes, naoCasados, semCodigo, avisos, resumo, historico, arquivo: file.name });
      setMarcadas(new Set(atualizacoes.map((a) => a.itemId)));
      setNovasMarcadas(new Set()); // itens fora do orçamento: nada marcado por padrão, o usuário escolhe
      setFiltroPo('');
    } catch (err) {
      toast('Não consegui ler esse arquivo: ' + err.message, true);
    }
  };

  const chaveNova = (g) => `${g.projeto}|${g.codigo}|${g.pedidosNumeros}|${g.descricao}`;
  const alternarNova = (g) =>
    setNovasMarcadas((s) => {
      const n = new Set(s);
      const k = chaveNova(g);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const alternar = (itemId) =>
    setMarcadas((s) => {
      const n = new Set(s);
      n.has(itemId) ? n.delete(itemId) : n.add(itemId);
      return n;
    });

  const atualizacoesFiltradas = (resultado?.atualizacoes || []).filter((a) => !filtroPo || String(a.po).toLowerCase().includes(filtroPo.trim().toLowerCase()));
  const naoCasadosFiltrados = (resultado?.naoCasados || []).filter((g) => !filtroPo || String(g.projeto).toLowerCase().includes(filtroPo.trim().toLowerCase()));

  const adicoesPendentes = (resultado?.naoCasados || []).filter((g) => g.orcamentoId && novasMarcadas.has(chaveNova(g))).length;
  const marcarNovas = (marcar) =>
    setNovasMarcadas((s) => {
      const n = new Set(s);
      naoCasadosFiltrados.filter((g) => g.orcamentoId).forEach((g) => (marcar ? n.add(chaveNova(g)) : n.delete(chaveNova(g))));
      return n;
    });

  const marcarTodos = (marcar) =>
    setMarcadas((s) => {
      const n = new Set(s);
      atualizacoesFiltradas.forEach((a) => (marcar ? n.add(a.itemId) : n.delete(a.itemId)));
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
    // Itens comprados que não existem no orçamento: adiciona ao orçamento da PO
    // (qtd/custo orçado = 0) para que o gasto seja contabilizado.
    const novosPorOrc = new Map();
    for (const g of resultado.naoCasados) {
      if (!g.orcamentoId || !novasMarcadas.has(chaveNova(g))) continue;
      if (!novosPorOrc.has(g.orcamentoId)) novosPorOrc.set(g.orcamentoId, []);
      novosPorOrc.get(g.orcamentoId).push(g);
    }
    // Um único salvamento por orçamento (atualizações + itens novos juntos),
    // senão o 2º salvamento sobrescreve o 1º.
    let adicionados = 0;
    const ids = new Set([...porOrcamento.keys(), ...novosPorOrc.keys()]);
    for (const orcamentoId of ids) {
      const o = dados.orcamentos.find((x) => x.id === orcamentoId);
      if (!o) continue;
      const upds = porOrcamento.get(orcamentoId) || [];
      const itens = (o.itens || []).map((i) => {
        const u = upds.find((x) => x.itemId === i.id);
        if (!u) return i;
        return {
          ...i,
          qtdComprada: u.qtdNova,
          valorUnitPago: u.precoNovo,
          dataCompra: u.dataNova || i.dataCompra,
          scNumeros: u.scNumeros || i.scNumeros,
          pedidosNumeros: u.pedidosNumeros || i.pedidosNumeros,
        };
      });
      for (const g of novosPorOrc.get(orcamentoId) || []) {
        // evita duplicar em reimportação (itens sem código: compara descrição + pedido)
        if (!g.codigo && itens.some((i) => i.foraOrcamento && i.descricao === g.descricao && i.pedidosNumeros === g.pedidosNumeros)) continue;
        itens.push({
          id: uid(),
          grupo: 'Fora do orçamento',
          categoria: 'Miscelâneas',
          codigo: g.codigo,
          descricao: g.descricao,
          unidade: '',
          marca: '',
          modelo: '',
          qtd: 0,
          custoUnit: 0,
          rob: 0,
          qtdComprada: g.qtd,
          valorUnitPago: g.preco,
          dataCompra: g.data,
          scNumeros: g.scNumeros,
          pedidosNumeros: g.pedidosNumeros,
          foraOrcamento: true,
        });
        adicionados++;
      }
      await salvar('orcamentos', { ...o, itens });
    }

    // Grava TODO o histórico de compras (SC, Pedido, Solicitante, Data, Qtd, Preço)
    // no rastreamento, independente de casar ou não com um orçamento existente.
    // O usuário quer ver e validar todas as informações do SAP, não só as aplicadas.
    const historicoRegistros = {};
    for (const h of resultado.historico || []) {
      // Chave única: SC + Pedido + Código
      const k = `${h.solicitacao}-${h.pedido}-${h.codigo}`;
      if (!historicoRegistros[k]) {
        historicoRegistros[k] = {
          id: k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 60),
          projeto: h.projeto,
          solicitacao: h.solicitacao,
          pedido: h.pedido,
          codigo: h.codigo,
          descricao: h.descricao,
          solicitante: h.solicitante,
          data: h.data,
          qtd: h.qtd,
          preco: h.preco,
          total: (Number(h.qtd) || 0) * (Number(h.preco) || 0),
          importadoEm: new Date().toISOString(),
        };
      }
    }
    
    if (Object.keys(historicoRegistros).length) {
      // Grava em lotes para não estourar limite de requisição
      const registros = Object.values(historicoRegistros);
      for (let i = 0; i < registros.length; i += 200) {
        await salvar('rastreamentoCompras', registros.slice(i, i + 200));
      }
    }
    
    setAplicando(false);
    toast(`${[...porOrcamento.values()].flat().length} itens atualizados${adicionados ? ', ' + adicionados + ' adicionados ao orçamento' : ''}${Object.keys(historicoRegistros).length ? ' e ' + Object.keys(historicoRegistros).length + ' registros gravados em Rastreamento SC' : ''}.`);
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
              {resultado.resumo.descartadasAno} fora do ano · {resultado.resumo.descartadasExcluidas} de solicitações excluídas ·{' '}
              {resultado.resumo.descartadasAbertas} pedidos em aberto (ainda não recebidos)
            </p>
          </section>

          <section className="bloco">
            <div className="filtros">
              <label className="campo" style={{ maxWidth: 220 }}>
                <span>Filtrar por PO</span>
                <input value={filtroPo} onChange={(e) => setFiltroPo(e.target.value)} placeholder="ex: 7634" />
              </label>
              <button className="pequeno" style={{ alignSelf: 'flex-end' }} onClick={() => marcarTodos(true)}>
                Marcar {filtroPo ? 'filtrados' : 'todos'}
              </button>
              <button className="pequeno" style={{ alignSelf: 'flex-end' }} onClick={() => marcarTodos(false)}>
                Desmarcar {filtroPo ? 'filtrados' : 'todos'}
              </button>
            </div>
          </section>

          <section className="bloco">
            <div className="bloco-cab">
              <h2>
                Itens que vão ser atualizados <span className="tag ok">{atualizacoesFiltradas.length}</span>
                {filtroPo && <span className="muted pequeno-txt"> de {resultado.atualizacoes.length} no total</span>}
              </h2>
              <button className="pequeno" disabled={aplicando || !(resultado?.historico?.length || resultado?.naoCasados?.length)} onClick={aplicar}>
                {aplicando ? 'Aplicando…' : (marcadas.size || adicoesPendentes) ? `Aplicar ${marcadas.size} atualização(ões)${adicoesPendentes ? ` + adicionar ${adicoesPendentes} ao orçamento` : ''}` : 'Gravar em Rastreamento SC'}
              </button>
            </div>
            {atualizacoesFiltradas.length ? (
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
                    {atualizacoesFiltradas.map((a) => (
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
              <p className="muted pequeno-txt">{filtroPo ? 'Nenhum item bate com esse filtro.' : 'Nenhum item bateu com os orçamentos cadastrados.'}</p>
            )}
          </section>

          <section className="bloco">
            <h2>
              Não encontrados nos orçamentos <span className="tag falta">{naoCasadosFiltrados.length}</span>
              {filtroPo && <span className="muted pequeno-txt"> de {resultado.naoCasados.length} no total</span>}
            </h2>
            <p className="pequeno-txt muted" style={{ marginBottom: 10 }}>
              Comprados no SAP para essas POs, mas sem item correspondente no orçamento — marque os que realmente pertencem a esta obra para adicionar ao orçamento da PO (grupo &quot;Fora do orçamento&quot;, qtd orçada 0) ao aplicar. Os desmarcados não entram.
            </p>
            {naoCasadosFiltrados.length > 0 && (
              <div className="filtros" style={{ marginBottom: 10 }}>
                <button className="pequeno" onClick={() => marcarNovas(true)}>Marcar {filtroPo ? 'filtrados' : 'todos'}</button>
                <button className="pequeno" onClick={() => marcarNovas(false)}>Desmarcar {filtroPo ? 'filtrados' : 'todos'}</button>
              </div>
            )}
            {naoCasadosFiltrados.length > 0 && (
              <div className="tabela-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th>Projeto</th>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor unit.</th>
                      <th>Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {naoCasadosFiltrados.map((g) => (
                      <tr key={chaveNova(g)}>
                        <td>{g.orcamentoId && <input type="checkbox" checked={novasMarcadas.has(chaveNova(g))} onChange={() => alternarNova(g)} />}</td>
                        <td>{g.projeto}</td>
                        <td className="muted">{g.codigo}</td>
                        <td style={{ minWidth: 220 }}>{g.descricao}</td>
                        <td className="num">{numero(g.qtd)}</td>
                        <td className="num">{moeda(g.preco)}</td>
                        <td className="pequeno-txt">{g.orcamentoId ? <>Adicionar em <strong>{g.orcamentoNome || 'orçamento'}</strong></> : <span className="muted">Sem orçamento para esta PO</span>}</td>
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
