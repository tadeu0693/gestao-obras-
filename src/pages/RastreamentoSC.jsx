import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { moeda, numero } from '../lib/util.js';
import { linhaEhTerceiro } from '../lib/moTerceiros.js';

export default function RastreamentoSC() {
  const { dados, toast } = useApp();
  const [historico, setHistorico] = useState([]);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [filtrosInput, setFiltrosInput] = useState({
    po: '',
    sc: '',
    pedido: '',
    solicitante: '',
    dataInicio: '',
    dataFim: '',
    soTerceiros: false,
  });
  const [filtros, setFiltros] = useState(filtrosInput);
  const [pagina, setPagina] = useState(1);
  const PAGE_SIZE = 100;

  // Carrega histórico do banco ao montar
  useEffect(() => {
    const historicoArmazenado = dados?.rastreamentoCompras || [];
    setHistorico(historicoArmazenado);
    setMarcadas(new Set());
  }, [dados?.rastreamentoCompras]);

  // Debounce: só aplica o filtro 300ms depois de parar de digitar,
  // pra não travar a digitação numa lista de milhares de linhas
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros(filtrosInput);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filtrosInput]);

  const linhasFiltradas = useMemo(() => {
    if (!historico.length) return [];
    return historico.filter((l) => {
      const po = String(l.projeto || '').toLowerCase();
      const sc = String(l.solicitacao || '').toLowerCase();
      const pedido = String(l.pedido || '').toLowerCase();
      const solicitante = String(l.solicitante || '').toLowerCase();
      const dataLine = l.data || '';

      if (filtros.po && !po.includes(filtros.po.toLowerCase())) return false;
      if (filtros.sc && !sc.includes(filtros.sc.toLowerCase())) return false;
      if (filtros.pedido && !pedido.includes(filtros.pedido.toLowerCase())) return false;
      if (filtros.solicitante && !solicitante.includes(filtros.solicitante.toLowerCase())) return false;
      if (filtros.dataInicio && dataLine < filtros.dataInicio) return false;
      if (filtros.dataFim && dataLine > filtros.dataFim) return false;
      if (filtros.soTerceiros && !linhaEhTerceiro(l, dados?.moTerceiros)) return false;
      return true;
    });
  }, [historico, filtros, dados?.moTerceiros]);

  const selecionadas = useMemo(
    () => linhasFiltradas.filter((l) => marcadas.has(l.id || (l.solicitacao + '|' + l.pedido + '|' + l.codigo))),
    [linhasFiltradas, marcadas]
  );

  const somaValor = selecionadas.reduce((s, l) => s + (Number(l.total) || (Number(l.qtd) || 0) * (Number(l.preco) || 0)), 0);
  const somaQtd = selecionadas.reduce((s, l) => s + (Number(l.qtd) || 0), 0);
  const somaTerceiros = linhasFiltradas
    .filter((l) => linhaEhTerceiro(l, dados?.moTerceiros))
    .reduce((s, l) => s + (Number(l.total) || (Number(l.qtd) || 0) * (Number(l.preco) || 0)), 0);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasPagina = useMemo(
    () => linhasFiltradas.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE),
    [linhasFiltradas, paginaAtual]
  );

  const alternar = (linha) => {
    const k = linha.id || (linha.solicitacao + '|' + linha.pedido + '|' + linha.codigo);
    setMarcadas((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const marcarTodos = (marcar) => {
    if (marcar) {
      const n = new Set(marcadas);
      linhasFiltradas.forEach((l) => n.add(l.id || (l.solicitacao + '|' + l.pedido + '|' + l.codigo)));
      setMarcadas(n);
    } else {
      setMarcadas(new Set());
    }
  };

  const exportarSelecionadas = () => {
    if (!selecionadas.length) return toast('Nenhuma linha selecionada', true);
    const dados = selecionadas.map((l) => ({
      'PO': l.projeto,
      'SC': l.solicitacao,
      'Pedido': l.pedido,
      'Código': l.codigo,
      'Descrição': l.descricao,
      'Solicitante': l.solicitante,
      'Data': l.data,
      'Qtd': l.qtd,
      'Preço Unit.': l.preco,
      'Total': l.total || (Number(l.qtd) || 0) * (Number(l.preco) || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SC');
    XLSX.writeFile(wb, `rastreamento-sc-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Exportado com sucesso.');
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Rastreamento SC</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        {historico.length > 0 ? (
          <span style={{ color: '#2196F3' }}>✓ {historico.length} registros carregados do SAP</span>
        ) : (
          <span style={{ color: '#999' }}>Nenhum dado importado ainda. Importe um relatório SAP para ver as informações aqui.</span>
        )}
      </p>

      {historico.length > 0 && (
        <>
          <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Filtrar PO..."
              value={filtrosInput.po}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, po: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar SC..."
              value={filtrosInput.sc}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, sc: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar Pedido..."
              value={filtrosInput.pedido}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, pedido: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar Solicitante..."
              value={filtrosInput.solicitante}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, solicitante: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="date"
              placeholder="Data Início"
              value={filtrosInput.dataInicio}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, dataInicio: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="date"
              placeholder="Data Fim"
              value={filtrosInput.dataFim}
              onChange={(e) => setFiltrosInput({ ...filtrosInput, dataFim: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={filtrosInput.soTerceiros}
                onChange={(e) => setFiltrosInput({ ...filtrosInput, soTerceiros: e.target.checked })}
              />
              Só serviços de terceiros (M.O)
            </label>
            <button onClick={() => marcarTodos(true)}>✓ Marcar todos os filtrados ({linhasFiltradas.length})</button>
            <button onClick={() => marcarTodos(false)}>✗ Desmarcar</button>
            <button onClick={exportarSelecionadas} disabled={!selecionadas.length}>
              <Icone>📊</Icone> Exportar selecionadas
            </button>
            <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>
              {selecionadas.length} selecionadas | {somaQtd} unidades | {moeda(somaValor)}
            </span>
            {somaTerceiros > 0 && (
              <span style={{ color: '#1565c0', fontWeight: 'bold' }}>M.O terceiro no filtro: {moeda(somaTerceiros)}</span>
            )}
          </div>

          <div style={{ marginBottom: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
            {linhasFiltradas.length} linha(s) encontrada(s) — mostrando {(paginaAtual - 1) * PAGE_SIZE + 1} a{' '}
            {Math.min(paginaAtual * PAGE_SIZE, linhasFiltradas.length)}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f0f0f0', fontWeight: 'bold' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                    <input
                      type="checkbox"
                      checked={linhasFiltradas.length > 0 && selecionadas.length === linhasFiltradas.length}
                      onChange={(e) => marcarTodos(e.target.checked)}
                    />
                  </th>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>PO</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>SC</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Pedido</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Código</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Descrição</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Solicitante</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Data</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Qtd</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Preço Unit.</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhasPagina.map((l, i) => {
                  const k = l.id || (l.solicitacao + '|' + l.pedido + '|' + l.codigo);
                  const marcada = marcadas.has(k);
                  const total = l.total || (Number(l.qtd) || 0) * (Number(l.preco) || 0);
                  return (
                    <tr
                      key={i}
                      style={{
                        background: marcada ? '#e8f5e9' : i % 2 ? '#fafafa' : 'white',
                        borderBottom: '1px solid #eee',
                      }}
                    >
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <input type="checkbox" checked={marcada} onChange={() => alternar(l)} />
                      </td>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{l.projeto}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', color: '#1976D2' }}>{l.solicitacao}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{l.pedido}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{l.codigo}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                        {l.descricao}
                        {linhaEhTerceiro(l, dados?.moTerceiros) && (
                          <span
                            title="Entra no custo de M.O da PO"
                            style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 10, background: '#e3f2fd', color: '#1565c0', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                          >
                            M.O terceiro
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.85rem' }}>{l.solicitante}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{l.data}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numero(l.qtd)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{moeda(l.preco)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: marcada ? 'bold' : 'normal', color: marcada ? '#2196F3' : 'inherit' }}>
                        {moeda(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
              <button disabled={paginaAtual <= 1} onClick={() => setPagina(1)}>« Primeira</button>
              <button disabled={paginaAtual <= 1} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
              <span style={{ margin: '0 0.5rem' }}>Página {paginaAtual} de {totalPaginas}</span>
              <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
              <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(totalPaginas)}>Última »</button>
            </div>
          )}

          {linhasFiltradas.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Nenhuma linha encontrada com esses filtros.</p>}
        </>
      )}
    </div>
  );
}
