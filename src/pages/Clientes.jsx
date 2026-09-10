import { useState } from 'react';
import { useApp } from '../App.jsx';
import { Icone } from '../components.jsx';
import { totaisOrc, moeda0, uid, semAcento } from '../lib/util.js';

export default function Clientes() {
  const { dados, salvar, excluir, podeEditar, toast, setClienteId } = useApp();
  const [nome, setNome] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');

  const adicionar = async () => {
    const n = nome.trim();
    if (!n) return;
    if (dados.clientes.some((c) => semAcento(c.nome) === semAcento(n))) return toast('Esse cliente já existe.', true);
    await salvar('clientes', { id: uid(), nome: n });
    setNome('');
    toast('Cliente adicionado');
  };

  const linhas = dados.clientes
    .map((c) => {
      const orcs = dados.orcamentos.filter((o) => o.clienteId === c.id);
      const t = orcs.reduce((s, o) => {
        const x = totaisOrc(o);
        return { orcado: s.orcado + x.orcado, pago: s.pago + x.pago };
      }, { orcado: 0, pago: 0 });
      return { c, orcs: orcs.length, pos: new Set(orcs.map((o) => o.po)).size, locais: dados.locais.filter((l) => l.clienteId === c.id).length, ...t };
    })
    .sort((a, b) => a.c.nome.localeCompare(b.c.nome));

  return (
    <>
      <div className="topo">
        <div>
          <h1>Clientes</h1>
          <div className="sub">Clientes novos também são criados automaticamente ao importar uma proposta.</div>
        </div>
      </div>
      {podeEditar && (
        <div className="filtros">
          <input placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
          <button className="primario" onClick={adicionar}>
            <Icone nome="mais" /> Adicionar cliente
          </button>
        </div>
      )}
      <section className="bloco">
        {linhas.length ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">POs</th>
                <th className="num">Orçamentos</th>
                <th className="num">Locais</th>
                <th className="num">Orçado</th>
                <th className="num">Gasto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ c, orcs, pos, locais, orcado, pago }) => (
                <tr key={c.id}>
                  <td>
                    {editId === c.id ? (
                      <input
                        autoFocus
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && editNome.trim()) {
                            await salvar('clientes', { ...c, nome: editNome.trim() });
                            setEditId(null);
                          }
                          if (e.key === 'Escape') setEditId(null);
                        }}
                        onBlur={() => setEditId(null)}
                      />
                    ) : (
                      <strong>{c.nome}</strong>
                    )}
                  </td>
                  <td className="num">{pos}</td>
                  <td className="num">{orcs}</td>
                  <td className="num">{locais}</td>
                  <td className="num">{moeda0(orcado)}</td>
                  <td className="num">{moeda0(pago)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="pequeno"
                      onClick={() => {
                        setClienteId(c.id);
                        window.location.hash = '/painel';
                      }}
                    >
                      Ver painel
                    </button>{' '}
                    {podeEditar && (
                      <>
                        <button
                          className="pequeno"
                          onClick={() => {
                            setEditId(c.id);
                            setEditNome(c.nome);
                          }}
                        >
                          Renomear
                        </button>{' '}
                        <button
                          className="pequeno perigo"
                          onClick={async () => {
                            if (orcs || locais) return toast('Este cliente tem orçamentos ou locais. Exclua ou mova esses registros antes.', true);
                            if (confirm(`Excluir o cliente ${c.nome}?`)) await excluir('clientes', c.id);
                          }}
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="vazio">Nenhum cliente cadastrado.</div>
        )}
      </section>
    </>
  );
}
