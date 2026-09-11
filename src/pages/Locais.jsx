import { useEffect, useMemo, useState } from 'react';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { Campo, Gaveta, Icone, NumInput, Pill, StatusSelect } from '../components.jsx';
import { filtrarPorCliente, semAcento, data, moeda0, uid, STATUS_LOCAL, exportarExcel, hojeISO } from '../lib/util.js';

const NOVO = (clienteId) => ({
  id: uid(),
  clienteId,
  po: '',
  nome: '',
  endereco: '',
  uf: '',
  regiao: '',
  status: 'Não iniciada',
  equipe: '',
  inicioPrevisto: '',
  fimPrevisto: '',
  inicioReal: '',
  fimReal: '',
  obs: '',
  moUnit: 0,
  miscUnit: 0,
  valorTerceiro: 0,
  valorTerceiroPago: 0,
  cameras: { bullet: 0, dome: 0, ptz: 0, radar: 0, sonofletor: 0 },
  postes: { qtd: 0, dataEntrega: '', horaEntrega: '', rota: '', sequencia: '' },
  levantamento: [],
});
const totalCam = (c = {}) => Object.values(c).reduce((s, v) => s + (Number(v) || 0), 0);

export default function Locais({ abrirId }) {
  const { dados, clienteId, nomeCliente, salvar, podeEditar, toast } = useApp();
  const [busca, setBusca] = useState('');
  const [fPO, setFPO] = useState('');
  const [fReg, setFReg] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [agrupar, setAgrupar] = useState(true);
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    if (abrirId) {
      const l = dados.locais.find((x) => x.id === abrirId);
      if (l) setEditando(l);
    }
  }, [abrirId, dados.locais]);

  const d = filtrarPorCliente(dados, clienteId);
  const pos = [...new Set(d.locais.map((l) => l.po).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  const regioes = [...new Set(d.locais.map((l) => l.regiao).filter(Boolean))].sort();

  const lista = useMemo(() => {
    const q = semAcento(busca);
    return d.locais
      .filter((l) => (!fPO || String(l.po) === fPO) && (!fReg || l.regiao === fReg) && (!fStatus || (l.status || 'Não iniciada') === fStatus))
      .filter((l) => !q || semAcento(`${l.nome} ${l.endereco} ${l.equipe} ${l.po}`).includes(q))
      .sort((a, b) => (a.regiao || '').localeCompare(b.regiao || '') || a.nome.localeCompare(b.nome));
  }, [d, busca, fPO, fReg, fStatus]);

  const grupos = useMemo(() => {
    if (!agrupar) return [['', lista]];
    const m = new Map();
    lista.forEach((l) => {
      const k = l.regiao || 'Sem região';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    });
    return [...m.entries()];
  }, [lista, agrupar]);

  const mudarStatus = async (l, status) => {
    const extra = {};
    if (status === 'Em andamento' && !l.inicioReal) extra.inicioReal = hojeISO();
    if (status === 'Concluída' && !l.fimReal) extra.fimReal = hojeISO();
    await salvar('locais', { ...l, status, ...extra });
    toast(`${l.nome}: ${status}`);
  };

  const fechar = () => {
    setEditando(null);
    if (abrirId) navegar('locais');
  };

  const exportar = () =>
    exportarExcel('Locais.xlsx', {
      Locais: lista.map((l) => ({
        Local: l.nome,
        Cliente: nomeCliente(l.clienteId),
        PO: l.po,
        Endereço: l.endereco,
        UF: l.uf || '',
        Região: l.regiao,
        'Status da Obra': l.status,
        'Equipe Responsável': l.equipe,
        'Início previsto': data(l.inicioPrevisto),
        'Fim previsto': data(l.fimPrevisto),
        'Início real': data(l.inicioReal),
        'Fim real': data(l.fimReal),
        'M.O / Unidade': l.moUnit || 0,
        'Misc / Unidade': l.miscUnit || 0,
        'Valor Terceiro': l.valorTerceiro || 0,
        'Valor Terceiro Pago': l.valorTerceiroPago || 0,
        Bullet: l.cameras?.bullet || 0,
        Dome: l.cameras?.dome || 0,
        PTZ: l.cameras?.ptz || 0,
        Radar: l.cameras?.radar || 0,
        Sonofletor: l.cameras?.sonofletor || 0,
        Postes: l.postes?.qtd || 0,
        'Entrega postes': data(l.postes?.dataEntrega),
        Obs: l.obs,
      })),
    });

  return (
    <>
      <div className="topo">
        <div>
          <h1>Locais e obras</h1>
          <div className="sub">{lista.length} de {d.locais.length} locais</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
          <button onClick={exportar}>
            <Icone nome="baixar" /> Exportar Excel
          </button>
          {podeEditar && (
            <button
              className="primario"
              onClick={() => {
                const cid = clienteId || dados.clientes[0]?.id;
                if (!cid) return toast('Cadastre um cliente primeiro.', true);
                setEditando(NOVO(cid));
              }}
            >
              <Icone nome="mais" /> Novo local
            </button>
          )}
        </div>
      </div>
      <div className="filtros">
        <input type="search" placeholder="Buscar local, endereço ou equipe" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={fPO} onChange={(e) => setFPO(e.target.value)} aria-label="PO">
          <option value="">Todas as POs</option>
          {pos.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={fReg} onChange={(e) => setFReg(e.target.value)} aria-label="Região">
          <option value="">Todas as regiões</option>
          {regioes.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUS_LOCAL.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> Agrupar por região
        </label>
      </div>

      <section className="bloco">
        {lista.length ? (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Local</th>
                  <th>PO</th>
                  {!clienteId && <th>Cliente</th>}
                  {!agrupar && <th>Região</th>}
                  <th>Equipe</th>
                  <th>Status</th>
                  <th>Início prev.</th>
                  <th>Fim prev.</th>
                  <th className="num">Câmeras</th>
                  <th className="num">Postes</th>
                  <th className="num">M.O</th>
                  <th>Obs</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(([reg, ls]) => (
                  <GrupoLinhas key={reg || 'todos'} reg={reg} ls={ls} colspan={clienteId ? 11 : 12} agrupar={agrupar} clienteId={clienteId} nomeCliente={nomeCliente} podeEditar={podeEditar} onStatus={mudarStatus} onAbrir={setEditando} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vazio">Nenhum local encontrado com esses filtros.</div>
        )}
      </section>

      {editando && <LocalEditor local={editando} aoFechar={fechar} />}
    </>
  );
}

function GrupoLinhas({ reg, ls, colspan, agrupar, clienteId, nomeCliente, podeEditar, onStatus, onAbrir }) {
  const hoje = hojeISO();
  return (
    <>
      {agrupar && (
        <tr className="grupo">
          <td colSpan={colspan}>
            {reg} <span className="muted pequeno-txt" style={{ fontFamily: 'var(--fonte)', fontWeight: 400 }}>{ls.length} locais</span>
          </td>
        </tr>
      )}
      {ls.map((l) => {
        const atrasado = l.fimPrevisto && l.fimPrevisto < hoje && l.status !== 'Concluída';
        return (
          <tr key={l.id} className="clicavel" onClick={() => onAbrir(l)}>
            <td>
              <strong>{l.nome}</strong>
              {l.endereco && <div className="pequeno-txt muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.endereco}</div>}
            </td>
            <td>{l.po}</td>
            {!clienteId && <td>{nomeCliente(l.clienteId)}</td>}
            {!agrupar && <td>{l.regiao}</td>}
            <td>{l.equipe || <span className="muted">—</span>}</td>
            <td onClick={(e) => e.stopPropagation()}>
              <StatusSelect valor={l.status} disabled={!podeEditar} onChange={(s) => onStatus(l, s)} />
            </td>
            <td>{data(l.inicioPrevisto)}</td>
            <td style={{ color: atrasado ? 'var(--vermelho)' : undefined }} title={atrasado ? 'Término previsto já passou' : undefined}>
              {data(l.fimPrevisto)}
            </td>
            <td className="num">{totalCam(l.cameras) || ''}</td>
            <td className="num">{l.postes?.qtd || ''}</td>
            <td className="num">{l.moUnit ? moeda0(l.moUnit) : ''}</td>
            <td className="muted pequeno-txt trunc" title={l.obs}>{l.obs}</td>
          </tr>
        );
      })}
    </>
  );
}

function LocalEditor({ local, aoFechar }) {
  const { dados, salvar, excluir, podeEditar, toast } = useApp();
  const [l, setL] = useState(() => JSON.parse(JSON.stringify(local)));
  const [salvando, setSalvando] = useState(false);
  const existe = dados.locais.some((x) => x.id === l.id);
  const set = (k, v) => setL((x) => ({ ...x, [k]: v }));
  const setSub = (grupo, k, v) => setL((x) => ({ ...x, [grupo]: { ...(x[grupo] || {}), [k]: v } }));
  const setLev = (id, k, v) => setL((x) => ({ ...x, levantamento: x.levantamento.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
  const regioes = [...new Set(dados.locais.map((x) => x.regiao).filter(Boolean))].sort();
  const equipes = [...new Set(dados.locais.map((x) => x.equipe).filter(Boolean))].sort();
  const orcsPO = dados.orcamentos.filter((o) => o.clienteId === l.clienteId && String(o.po) === String(l.po) && l.po);

  const gravar = async () => {
    if (!l.nome.trim()) return toast('Informe o nome do local.', true);
    setSalvando(true);
    try {
      await salvar('locais', l);
      toast('Local salvo');
      aoFechar();
    } finally {
      setSalvando(false);
    }
  };
  const apagar = async () => {
    if (!confirm(`Excluir o local "${l.nome}"?`)) return;
    await excluir('locais', l.id);
    toast('Local excluído');
    aoFechar();
  };
  const copiarDoOrcamento = () => {
    const o = orcsPO.find((x) => x.id === l.orcamentoId) || orcsPO[0];
    if (!o) return;
    const novos = o.itens
      .filter((i) => i.categoria === 'Eletrônico')
      .map((i) => ({ id: uid(), codigo: i.codigo, descricao: i.descricao, un: i.unidade, qtd: orcsPO.length === 1 && dados.locais.filter((x) => x.po === l.po).length <= 1 ? i.qtd : 0, obs: '' }));
    setL((x) => ({ ...x, levantamento: [...x.levantamento, ...novos] }));
  };

  return (
    <Gaveta
      titulo={existe ? l.nome || 'Local' : 'Novo local'}
      sub={l.po ? `PO ${l.po}` : undefined}
      aoFechar={aoFechar}
      rodape={
        podeEditar && (
          <>
            {existe && (
              <button className="perigo" onClick={apagar} style={{ marginRight: 'auto' }}>
                <Icone nome="lixo" /> Excluir
              </button>
            )}
            <button onClick={aoFechar}>Cancelar</button>
            <button className="primario" onClick={gravar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar local'}
            </button>
          </>
        )
      }
    >
      <fieldset disabled={!podeEditar}>
        <section className="bloco">
          <h3 style={{ marginBottom: 12 }}>Identificação</h3>
          <div className="grade">
            <Campo rotulo="Nome do local" className="largo">
              <input value={l.nome} onChange={(e) => set('nome', e.target.value)} autoFocus={!existe} />
            </Campo>
            <Campo rotulo="Cliente">
              <select value={l.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
                {dados.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="PO">
              <input value={l.po} onChange={(e) => set('po', e.target.value.trim())} />
            </Campo>
            <Campo rotulo="Região">
              <input list="regioes-l" value={l.regiao} onChange={(e) => set('regiao', e.target.value)} />
              <datalist id="regioes-l">{regioes.map((r) => <option key={r} value={r} />)}</datalist>
            </Campo>
            <Campo rotulo="UF">
              <input value={l.uf || ''} maxLength={2} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
            </Campo>
            <Campo rotulo="Endereço" className="inteiro">
              <input value={l.endereco} onChange={(e) => set('endereco', e.target.value)} />
            </Campo>
          </div>
        </section>

        <section className="bloco">
          <h3 style={{ marginBottom: 12 }}>Andamento</h3>
          <div className="grade">
            <Campo rotulo="Status">
              <select value={l.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_LOCAL.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Equipe responsável">
              <input list="equipes-l" value={l.equipe} onChange={(e) => set('equipe', e.target.value)} />
              <datalist id="equipes-l">{equipes.map((r) => <option key={r} value={r} />)}</datalist>
            </Campo>
            <Campo rotulo="Início previsto">
              <input type="date" value={l.inicioPrevisto} onChange={(e) => set('inicioPrevisto', e.target.value)} />
            </Campo>
            <Campo rotulo="Fim previsto">
              <input type="date" value={l.fimPrevisto} onChange={(e) => set('fimPrevisto', e.target.value)} />
            </Campo>
            <Campo rotulo="Início real">
              <input type="date" value={l.inicioReal || ''} onChange={(e) => set('inicioReal', e.target.value)} />
            </Campo>
            <Campo rotulo="Fim real">
              <input type="date" value={l.fimReal || ''} onChange={(e) => set('fimReal', e.target.value)} />
            </Campo>
            <Campo rotulo="Observações" className="inteiro">
              <textarea value={l.obs} onChange={(e) => set('obs', e.target.value)} />
            </Campo>
          </div>
        </section>

        <section className="bloco">
          <h3 style={{ marginBottom: 12 }}>Custos do local</h3>
          <div className="grade">
            <Campo rotulo="M.O por unidade" dica="R$">
              <NumInput className="" valor={l.moUnit} onChange={(v) => set('moUnit', v)} />
            </Campo>
            <Campo rotulo="Miscelâneas por unidade" dica="R$">
              <NumInput className="" valor={l.miscUnit} onChange={(v) => set('miscUnit', v)} />
            </Campo>
            <Campo rotulo="Valor terceiro" dica="R$ fechado">
              <NumInput className="" valor={l.valorTerceiro} onChange={(v) => set('valorTerceiro', v)} />
            </Campo>
            <Campo rotulo="Valor terceiro pago" dica={`saldo ${moeda0((l.valorTerceiro || 0) - (l.valorTerceiroPago || 0))}`}>
              <NumInput className="" valor={l.valorTerceiroPago} onChange={(v) => set('valorTerceiroPago', v)} />
            </Campo>
          </div>
        </section>

        <div className="duas-col" style={{ marginBottom: 14 }}>
          <section className="bloco">
            <h3 style={{ marginBottom: 12 }}>Equipamentos do projeto</h3>
            <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
              {[
                ['bullet', 'Bullet'],
                ['dome', 'Dome'],
                ['ptz', 'PTZ'],
                ['radar', 'Radar'],
                ['sonofletor', 'Sonofletor'],
              ].map(([k, r]) => (
                <Campo key={k} rotulo={r}>
                  <NumInput valor={l.cameras?.[k]} onChange={(v) => setSub('cameras', k, v)} />
                </Campo>
              ))}
            </div>
          </section>
          <section className="bloco">
            <h3 style={{ marginBottom: 12 }}>Postes</h3>
            <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              <Campo rotulo="Quantidade">
                <NumInput valor={l.postes?.qtd} onChange={(v) => setSub('postes', 'qtd', v)} />
              </Campo>
              <Campo rotulo="Data de entrega">
                <input type="date" value={l.postes?.dataEntrega || ''} onChange={(e) => setSub('postes', 'dataEntrega', e.target.value)} />
              </Campo>
              <Campo rotulo="Hora">
                <input type="time" value={l.postes?.horaEntrega || ''} onChange={(e) => setSub('postes', 'horaEntrega', e.target.value)} />
              </Campo>
              <Campo rotulo="Sequência na rota">
                <input value={l.postes?.sequencia || ''} onChange={(e) => setSub('postes', 'sequencia', e.target.value)} />
              </Campo>
            </div>
          </section>
        </div>

        <section className="bloco">
          <div className="bloco-cab">
            <div>
              <h3>Levantamento técnico</h3>
              <p>Materiais levantados em campo para este local. Usado na comparação com o orçado da PO.</p>
            </div>
            {orcsPO.length > 0 && (
              <button className="pequeno" onClick={copiarDoOrcamento}>
                Copiar itens do orçamento
              </button>
            )}
          </div>
          <div className="tabela-wrap">
            <table className="tabela-edit">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Código</th>
                  <th>Descrição</th>
                  <th style={{ width: 60 }}>Un.</th>
                  <th className="num" style={{ width: 80 }}>Qtd</th>
                  <th style={{ width: 130 }}>Obs</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {(l.levantamento || []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input value={r.codigo} placeholder="—" onChange={(e) => setLev(r.id, 'codigo', e.target.value)} aria-label="Código" />
                    </td>
                    <td>
                      <input value={r.descricao} onChange={(e) => setLev(r.id, 'descricao', e.target.value)} aria-label="Descrição" />
                    </td>
                    <td>
                      <input value={r.un} onChange={(e) => setLev(r.id, 'un', e.target.value)} aria-label="Unidade" />
                    </td>
                    <td>
                      <NumInput valor={r.qtd} onChange={(v) => setLev(r.id, 'qtd', v)} aria-label="Quantidade" />
                    </td>
                    <td>
                      <input value={r.obs || ''} onChange={(e) => setLev(r.id, 'obs', e.target.value)} aria-label="Observação" />
                    </td>
                    <td>
                      <button className="fantasma" aria-label="Remover" onClick={() => setL((x) => ({ ...x, levantamento: x.levantamento.filter((y) => y.id !== r.id) }))}>
                        <Icone nome="lixo" tam={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="pequeno" style={{ marginTop: 8 }} onClick={() => setL((x) => ({ ...x, levantamento: [...(x.levantamento || []), { id: uid(), codigo: '', descricao: '', un: 'UN', qtd: 0, obs: '' }] }))}>
            <Icone nome="mais" tam={15} /> Adicionar material
          </button>
        </section>
      </fieldset>
      {!existe ? null : (
        <p className="muted pequeno-txt">
          Atualizado {l.atualizadoEm ? `em ${data(l.atualizadoEm)}` : ''} {l.atualizadoPor ? `por ${l.atualizadoPor}` : ''}. <Pill status={l.status} />
        </p>
      )}
    </Gaveta>
  );
}
