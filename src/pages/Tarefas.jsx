import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { uid, data } from '../lib/util.js';

const GERAL = '__geral';

export default function Tarefas() {
  const { dados, salvar, excluir, podeEditar, nomeCliente } = useApp();
  const [texto, setTexto] = useState('');
  const [alvo, setAlvo] = useState(''); // projeto da nova tarefa ('' = geral)
  const [filtro, setFiltro] = useState(''); // '' = todos
  const [mostrarFeitas, setMostrarFeitas] = useState(true);

  const orcs = useMemo(
    () => dados.orcamentos.slice().sort((a, b) => String(a.po).localeCompare(String(b.po), 'pt-BR', { numeric: true })),
    [dados.orcamentos],
  );
  const rotulo = (id) => {
    if (!id) return 'Geral';
    const o = dados.orcamentos.find((x) => x.id === id);
    return o ? `${o.po || '—'} · ${o.nome}` : 'Projeto removido';
  };

  const adicionar = async () => {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) return;
    await salvar('tarefas', linhas.map((t) => ({ id: uid(), texto: t, feito: false, orcId: alvo || null })));
    setTexto('');
  };
  const alternar = (t) => salvar('tarefas', { ...t, feito: !t.feito, feitoEm: !t.feito ? new Date().toISOString() : null });

  const lista = dados.tarefas
    .filter((t) => (filtro === '' ? true : filtro === GERAL ? !t.orcId : t.orcId === filtro))
    .filter((t) => mostrarFeitas || !t.feito);

  const grupos = useMemo(() => {
    const m = new Map();
    lista.forEach((t) => {
      const k = t.orcId || GERAL;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    });
    m.forEach((v) => v.sort((a, b) => Number(a.feito) - Number(b.feito) || String(a.criadoEm).localeCompare(String(b.criadoEm))));
    return [...m.entries()].sort((a, b) => rotulo(a[0] === GERAL ? '' : a[0]).localeCompare(rotulo(b[0] === GERAL ? '' : b[0]), 'pt-BR', { numeric: true }));
  }, [lista, dados.orcamentos]);

  const abertas = dados.tarefas.filter((t) => !t.feito).length;
  const feitas = dados.tarefas.length - abertas;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Tarefas</h1>
          <div className="sub">
            {abertas} em aberto · {feitas} concluída{feitas === 1 ? '' : 's'}
          </div>
        </div>
        <div className="topo-acoes">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por projeto" style={{ width: 'auto', minWidth: 200 }}>
            <option value="">Todos os projetos</option>
            <option value={GERAL}>Geral (sem projeto)</option>
            {orcs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.po || '—'} · {o.nome}
              </option>
            ))}
          </select>
          <label className="pequeno-txt" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={mostrarFeitas} onChange={(e) => setMostrarFeitas(e.target.checked)} style={{ width: 'auto' }} />
            Mostrar concluídas
          </label>
        </div>
      </div>

      {podeEditar && (
        <div className="bloco">
          <div className="bloco-cab">
            <div>
              <strong>Nova anotação</strong>
              <p>Uma tarefa por linha. Ctrl+Enter adiciona.</p>
            </div>
          </div>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && adicionar()}
            placeholder="Ex.: Pedir cotação dos cabos&#10;Agendar vistoria"
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <select value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Projeto da tarefa" style={{ width: 'auto', minWidth: 220 }}>
              <option value="">Geral (sem projeto)</option>
              {orcs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.po || '—'} · {o.nome} ({nomeCliente(o.clienteId)})
                </option>
              ))}
            </select>
            <button className="primario" onClick={adicionar} disabled={!texto.trim()}>
              <Icone nome="mais" tam={16} /> Adicionar
            </button>
          </div>
        </div>
      )}

      {!grupos.length && <div className="vazio">Nenhuma tarefa por aqui.</div>}

      {grupos.map(([k, itens]) => (
        <div className="bloco" key={k}>
          <div className="bloco-cab">
            <strong>{rotulo(k === GERAL ? '' : k)}</strong>
            <span className="pequeno-txt">
              {itens.filter((t) => t.feito).length}/{itens.length}
            </span>
          </div>
          {itens.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--linha)' }}>
              <input type="checkbox" checked={!!t.feito} disabled={!podeEditar} onChange={() => alternar(t)} style={{ width: 'auto', flex: 'none' }} aria-label="Concluir tarefa" />
              <span style={{ flex: 1, textDecoration: t.feito ? 'line-through' : 'none', color: t.feito ? 'var(--texto-2)' : 'inherit' }}>{t.texto}</span>
              {t.feito && t.feitoEm && <span className="pequeno-txt">{data(t.feitoEm)}</span>}
              {podeEditar && (
                <button className="fantasma pequeno" onClick={() => excluir('tarefas', t.id)} title="Excluir" aria-label="Excluir tarefa">
                  <Icone nome="lixo" tam={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
