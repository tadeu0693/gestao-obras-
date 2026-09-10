import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { Campo, Icone, NumInput } from '../components.jsx';
import { data, numero, semAcento, uid, hojeISO, exportarExcel } from '../lib/util.js';

const vazio = () => ({ id: uid(), data: hojeISO(), endereco: '', codigo: '', descricao: '', qtd: 0, po: '', obs: '' });

export default function Estoque() {
  const { dados, salvar, excluir, podeEditar, toast } = useApp();
  const [form, setForm] = useState(vazio);
  const [busca, setBusca] = useState('');
  const editando = dados.estoque.some((e) => e.id === form.id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // sugere a descrição a partir do código dos orçamentos
  const catalogo = useMemo(() => {
    const m = new Map();
    dados.orcamentos.forEach((o) => o.itens?.forEach((i) => i.codigo && !m.has(i.codigo) && m.set(i.codigo, i.descricao)));
    return m;
  }, [dados.orcamentos]);
  const enderecos = [...new Set(dados.estoque.map((e) => e.endereco).filter(Boolean))];

  const lista = useMemo(() => {
    const q = semAcento(busca);
    return dados.estoque
      .filter((e) => !q || semAcento(`${e.codigo} ${e.descricao} ${e.endereco} ${e.po}`).includes(q))
      .sort((a, b) => (b.data || '').localeCompare(a.data || '') || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
  }, [dados.estoque, busca]);

  const gravar = async () => {
    if (!form.descricao.trim() || !form.qtd) return toast('Informe a descrição e a quantidade.', true);
    await salvar('estoque', form);
    toast(editando ? 'Entrada atualizada' : 'Entrada registrada');
    setForm(vazio());
  };

  return (
    <>
      <div className="topo">
        <div>
          <h1>Estoque recebido</h1>
          <div className="sub">Registre o material que chegou. O saldo a receber aparece em Materiais.</div>
        </div>
        <div className="topo-acoes">
          <button
            onClick={() =>
              exportarExcel('Estoque_recebido.xlsx', {
                Estoque: lista.map((e) => ({ Data: data(e.data), Endereço: e.endereco, Código: e.codigo, Descrição: e.descricao, 'Qtd Recebida': e.qtd, PO: e.po || '', Obs: e.obs })),
              })
            }
          >
            <Icone nome="baixar" /> Exportar Excel
          </button>
        </div>
      </div>

      {podeEditar && (
        <section className="bloco">
          <h3 style={{ marginBottom: 12 }}>{editando ? 'Editar entrada' : 'Nova entrada'}</h3>
          <div className="grade">
            <Campo rotulo="Data">
              <input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} />
            </Campo>
            <Campo rotulo="Código">
              <input
                value={form.codigo}
                onChange={(e) => {
                  const c = e.target.value.trim();
                  setForm((f) => ({ ...f, codigo: c, descricao: f.descricao || catalogo.get(c) || '' }));
                }}
              />
            </Campo>
            <Campo rotulo="Descrição" className="largo">
              <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
            </Campo>
            <Campo rotulo="Quantidade">
              <NumInput valor={form.qtd} onChange={(v) => set('qtd', v)} />
            </Campo>
            <Campo rotulo="Local de armazenagem">
              <input list="enderecos" value={form.endereco} onChange={(e) => set('endereco', e.target.value)} />
              <datalist id="enderecos">{enderecos.map((e) => <option key={e} value={e} />)}</datalist>
            </Campo>
            <Campo rotulo="PO" dica="opcional">
              <input value={form.po || ''} onChange={(e) => set('po', e.target.value.trim())} />
            </Campo>
            <Campo rotulo="Obs">
              <input value={form.obs} onChange={(e) => set('obs', e.target.value)} />
            </Campo>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="primario" onClick={gravar}>
              {editando ? 'Salvar entrada' : 'Registrar entrada'}
            </button>
            {editando && <button onClick={() => setForm(vazio())}>Cancelar edição</button>}
          </div>
        </section>
      )}

      <div className="filtros">
        <input type="search" placeholder="Buscar código, descrição ou local" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="muted pequeno-txt">{lista.length} entradas</span>
      </div>
      <section className="bloco">
        {lista.length ? (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th className="num">Qtd</th>
                  <th>Armazenagem</th>
                  <th>PO</th>
                  <th>Obs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} className={podeEditar ? 'clicavel' : ''} onClick={() => podeEditar && setForm({ ...e })}>
                    <td>{data(e.data) || <span className="muted">—</span>}</td>
                    <td>{e.codigo}</td>
                    <td>{e.descricao}</td>
                    <td className="num">{numero(e.qtd)}</td>
                    <td className="muted">{e.endereco}</td>
                    <td>{e.po}</td>
                    <td className="muted pequeno-txt">{e.obs}</td>
                    <td>
                      {podeEditar && (
                        <button
                          className="fantasma"
                          aria-label="Excluir entrada"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            if (confirm('Excluir esta entrada de estoque?')) await excluir('estoque', e.id);
                          }}
                        >
                          <Icone nome="lixo" tam={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vazio">Nenhuma entrada de estoque registrada.</div>
        )}
      </section>
    </>
  );
}
