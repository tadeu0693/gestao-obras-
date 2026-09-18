import { useRef, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { moeda, numero, data as formatData } from '../lib/util.js';
import { parseSapCompras } from '../lib/parseSap.js';

export default function RastreamentoCompras() {
  const { dados, toast } = useApp();
  const [historico, setHistorico] = useState(null); // Linhas do SAP carregadas
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [filtros, setFiltros] = useState({
    po: '',
    sc: '',
    pedido: '',
    solicitante: '',
    dataInicio: '',
    dataFim: '',
  });
  const inputRef = useRef();

  const processar = async (files) => {
    const file = [...files].find((f) => /\.(xlsx|xlsm|xls)$/i.test(f.name));
    if (!file) return toast('Envie um arquivo .xlsx, .xlsm ou .xls', true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, bookVBA: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const { historico: linhas, avisos } = parseSapCompras(aoa, { ano: null });
      setHistorico(linhas);
      setMarcadas(new Set());
      setFiltros({ po: '', sc: '', pedido: '', solicitante: '', dataInicio: '', dataFim: '' });
      if (avisos.length) {
        avisos.forEach((a) => toast('⚠️ ' + a));
      }
      toast(`${linhas.length} linhas carregadas.`);
    } catch (err) {
      toast('Erro ao ler arquivo: ' + err.message, true);
    }
  };

  const linhasFiltradas = useMemo(() => {
    if (!historico) return [];
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
      return true;
    });
  }, [historico, filtros]);

  const selecionadas = useMemo(
    () => linhasFiltradas.filter((l) => marcadas.has(l.solicitacao + '|' + l.pedido + '|' + l.codigo)),
    [linhasFiltradas, marcadas]
  );

  const somaValor = selecionadas.reduce((s, l) => s + (Number(l.qtd) || 0) * (Number(l.preco) || 0), 0);
  const somaQtd = selecionadas.reduce((s, l) => s + (Number(l.qtd) || 0), 0);

  const alternar = (linha) => {
    const k = linha.solicitacao + '|' + linha.pedido + '|' + linha.codigo;
    setMarcadas((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const marcarTodos = (marcar) => {
    if (marcar) {
      const n = new Set(marcadas);
      linhasFiltradas.forEach((l) => n.add(l.solicitacao + '|' + l.pedido + '|' + l.codigo));
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
      'Total': (Number(l.qtd) || 0) * (Number(l.preco) || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compras');
    XLSX.writeFile(wb, `rastreamento-compras-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Exportado com sucesso.');
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Rastreamento de Compras (SAP)</h1>

      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '4px' }}>
        <h3 style={{ marginTop: 0 }}>Carregar Relatório SAP</h3>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          onChange={(e) => processar(e.target.files)}
          style={{ display: 'none' }}
        />
        <button onClick={() => inputRef.current?.click()}>
          <Icone>📁</Icone> Selecionar arquivo
        </button>
        {historico && <span style={{ marginLeft: '1rem', color: '#666' }}>{historico.length} linhas carregadas</span>}
      </div>

      {historico && (
        <>
          <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Filtrar PO..."
              value={filtros.po}
              onChange={(e) => setFiltros({ ...filtros, po: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar SC..."
              value={filtros.sc}
              onChange={(e) => setFiltros({ ...filtros, sc: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar Pedido..."
              value={filtros.pedido}
              onChange={(e) => setFiltros({ ...filtros, pedido: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="text"
              placeholder="Filtrar Solicitante..."
              value={filtros.solicitante}
              onChange={(e) => setFiltros({ ...filtros, solicitante: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="date"
              placeholder="Data Início"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <input
              type="date"
              placeholder="Data Fim"
              value={filtros.dataFim}
              onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={() => marcarTodos(true)}>✓ Marcar filtrados</button>
            <button onClick={() => marcarTodos(false)}>✗ Desmarcar</button>
            <button onClick={exportarSelecionadas} disabled={!selecionadas.length}>
              <Icone>📊</Icone> Exportar selecionadas
            </button>
            <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>
              {selecionadas.length} linhas | {somaQtd} unidades | {moeda(somaValor)}
            </span>
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
                {linhasFiltradas.map((l, i) => {
                  const k = l.solicitacao + '|' + l.pedido + '|' + l.codigo;
                  const marcada = marcadas.has(k);
                  const total = (Number(l.qtd) || 0) * (Number(l.preco) || 0);
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
                      <td style={{ padding: '0.5rem' }}>{l.projeto}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{l.solicitacao}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{l.pedido}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{l.codigo}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{l.descricao}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.85rem' }}>{l.solicitante}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{l.data}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numero(l.qtd)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{moeda(l.preco)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: marcada ? 'bold' : 'normal' }}>
                        {moeda(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {linhasFiltradas.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Nenhuma linha encontrada com esses filtros.</p>}
        </>
      )}
    </div>
  );
}
