import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, navegar } from '../App.jsx';
import { moeda0, numero, pct, semAcento, api, uid } from '../lib/util.js';
import { bookmarkletPmo } from '../lib/pmoBookmarklet.js';

const PMO = 'https://pmo.gitel.com.br';
const normPo = (po) => {
  const m = String(po || '').match(/\d{3,}/);
  return m ? m[0].replace(/^0+/, '') : null;
};
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const FASES = { orcamento: 'Orçamento', execucao: 'Execução', operacao: 'Operação', finalizado: 'Finalizado', cancelado: 'Cancelado' };
// "Em execução" no PMO = fases execução + operação
const FILTRO_FASE = {
  ativos: ['execucao', 'operacao'],
  execucao: ['execucao'],
  operacao: ['operacao'],
  orcamento: ['orcamento'],
  finalizado: ['finalizado'],
  cancelado: ['cancelado'],
};
// BUs do PMO (/api/bus) — usado quando o projeto não veio com o nome da BU
const BUS = { 1: 'BU Projetos', 2: 'BU Serviços' };
const nomeBu = (p) => (typeof p.bu === 'string' && p.bu) || BUS[p.buId ?? p.bu] || 'Sem BU';
const STATUS_DA_FASE = { orcamento: 'Em análise', execucao: 'Em execução', operacao: 'Em execução', finalizado: 'Encerrado', cancelado: 'Cancelado' };
const pendentes = (det) => [...(det?.itens || []), ...(det?.servicos || [])].filter((i) => i.status === 'pendente_compra');

// ---------- janela que recebe os dados do favorito ----------
export function PmoReceber() {
  const [estado, setEstado] = useState({ texto: 'Aguardando o PMO…' });
  const enviado = useRef(false);

  useEffect(() => {
    if (!window.opener) {
      setEstado({ erro: 'Esta janela deve ser aberta pelo favorito "Sincronizar PMO", clicado dentro do PMO.' });
      return;
    }
    const aoReceber = async (ev) => {
      if (ev.origin !== PMO || !ev.data?.tipo) return;
      const d = ev.data;
      if (d.tipo === 'pmo-status') setEstado({ texto: d.texto });
      if (d.tipo === 'pmo-erro') setEstado({ erro: d.texto });
      if (d.tipo === 'pmo-dados') {
        setEstado({ texto: 'Salvando no Controle de Obras…' });
        try {
          const r = await api('pmo', { metodo: 'POST', corpo: { projetos: d.projetos, portfolio: d.portfolio, detalhes: d.detalhes } });
          setEstado({
            ok: `${r.total} projetos sincronizados (${r.comDetalhe} com itens e compras).` + (r.novos.length ? ` Novos: ${r.novos.join(', ')}.` : ''),
          });
        } catch (e) {
          setEstado({ erro: e.message });
        }
      }
    };
    window.addEventListener('message', aoReceber);
    api('dados')
      .then((dados) => {
        if (enviado.current) return;
        enviado.current = true;
        const pos = [...new Set((dados.orcamentos || []).map((o) => normPo(o.po)).filter(Boolean))];
        window.opener.postMessage({ tipo: 'pmo-pronto', pos }, PMO);
      })
      .catch((e) => setEstado({ erro: e.message }));
    return () => window.removeEventListener('message', aoReceber);
  }, []);

  return (
    <div style={{ padding: 28, maxWidth: 520 }}>
      <h1>Sincronizar PMO</h1>
      {estado.texto && <p>{estado.texto}</p>}
      {estado.erro && <div className="erro-box">{estado.erro}</div>}
      {estado.ok && (
        <>
          <div className="ok-box">{estado.ok}</div>
          <button className="primario" onClick={() => window.close()}>
            Fechar
          </button>{' '}
          <button onClick={() => navegar('pmo')}>Ver projetos</button>
        </>
      )}
    </div>
  );
}

// ---------- tela de projetos do PMO ----------
export default function Pmo() {
  const { dados, podeEditar, salvar, toast } = useApp();
  const [fase, setFase] = useState('ativos');
  const [bu, setBuEstado] = useState(() => localStorage.getItem('pmo_bu') ?? 'BU Projetos');
  const setBu = (v) => {
    localStorage.setItem('pmo_bu', v);
    setBuEstado(v);
  };
  const [trazendo, setTrazendo] = useState(false);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [aberto, setAberto] = useState(null);
  const linkRef = useRef(null);

  const carregar = () =>
    api('pmo')
      .then(setR)
      .catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
  }, []);
  useEffect(() => {
    if (linkRef.current) linkRef.current.setAttribute('href', bookmarkletPmo(window.location.origin));
  });

  const orcPorPo = useMemo(() => {
    const m = {};
    for (const o of dados.orcamentos) {
      const po = normPo(o.po);
      if (po) (m[po] = m[po] || []).push(o);
    }
    return m;
  }, [dados.orcamentos]);

  const snap = r?.snapshot;
  const vistos = r?.vistos || {};
  const primeiroVisto = useMemo(() => Object.values(vistos).sort()[0], [vistos]);
  const ehNovo = (c) => vistos[c] && vistos[c] !== primeiroVisto && Date.now() - new Date(vistos[c]) < 30 * 86400_000;

  const linhas = useMemo(() => {
    const q = semAcento(busca);
    return (snap?.projetos || [])
      .filter((p) => !bu || nomeBu(p) === bu)
      .filter((p) => fase === 'todas' || (FILTRO_FASE[fase] || []).includes(p.fase))
      .filter((p) => (filtro === 'controle' ? orcPorPo[p.po] : filtro === 'fora' ? !orcPorPo[p.po] : filtro === 'novos' ? ehNovo(p.codigo) : true))
      .filter((p) => !q || semAcento(`${p.codigo} ${p.nome} ${p.cliente} ${p.comercial || ''}`).includes(q))
      .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  }, [snap, busca, filtro, fase, bu, orcPorPo, vistos]);

  // Cria no controle os projetos do PMO que ainda não existem aqui. Cliente é casado pelo
  // nome; se não existir, é criado como "a validar".
  const trazer = async (lista) => {
    const alvo = lista.filter((p) => p.po && !orcPorPo[p.po]);
    if (!alvo.length) return toast('Todos já estão no controle.');
    if (!confirm(`Criar ${alvo.length} orçamento(s) no controle a partir do PMO?`)) return;
    setTrazendo(true);
    try {
      const clientes = [...dados.clientes];
      const novosClientes = [];
      const clienteDe = (nome, po) => {
        const n = String(nome || '').trim() || `A validar - PO ${po}`;
        let c = clientes.find((x) => semAcento(x.nome) === semAcento(n));
        if (!c) {
          c = { id: uid(), nome: n, aValidar: true };
          clientes.push(c);
          novosClientes.push(c);
        }
        return c.id;
      };
      const orcs = alvo.map((p) => ({
        id: uid(),
        clienteId: clienteDe(p.cliente && p.cliente !== p.po && !/^\d+$/.test(p.cliente) ? p.cliente : null, p.po),
        po: p.po,
        nome: p.nome || p.codigo,
        status: STATUS_DA_FASE[p.fase] || 'Em execução',
        comercial: p.comercial || '',
        vencimento: p.dataValidade || '',
        robArquivo: p.robOrcada || 0,
        origem: 'PMO',
        pmoCodigo: p.codigo,
        itens: p.custoOrcado
          ? [{ id: uid(), grupo: 'PMO', categoria: 'Eletrônico', codigo: '', descricao: 'Custo orçado (PMO) — importe a proposta para detalhar', unidade: 'vb', qtd: 1, custoUnit: p.custoOrcado, rob: p.robOrcada || 0, qtdComprada: 0, valorUnitPago: 0, dataCompra: '' }]
          : [],
      }));
      if (novosClientes.length) await salvar('clientes', novosClientes);
      for (let i = 0; i < orcs.length; i += 20) await salvar('orcamentos', orcs.slice(i, i + 20));
      toast(`${orcs.length} orçamento(s) criados${novosClientes.length ? `, ${novosClientes.length} cliente(s) novo(s) a validar` : ''}.`);
    } catch {
      /* salvar já mostra o erro */
    } finally {
      setTrazendo(false);
    }
  };
  const foraDoControle = linhas.filter((p) => p.po && !orcPorPo[p.po]).length;

  const soma = linhas.reduce((s, p) => ({ orc: s.orc + (p.robOrcada || 0), real: s.real + (p.robReal || 0) }), { orc: 0, real: 0 });
  const qtdNovos = (snap?.projetos || []).filter((p) => ehNovo(p.codigo)).length;

  return (
    <>
      <div className="topo">
        <div>
          <h1>PMO Gitel</h1>
          <div className="sub">Projetos, valores e compras vindos do PMO.</div>
        </div>
        <div className="topo-acoes">
          <button onClick={carregar}>Recarregar</button>
          <a className="btn" href={PMO} target="_blank" rel="noreferrer">
            Abrir PMO
          </a>
        </div>
      </div>

      <div className="bloco">
        <div className="bloco-cab">
          <div>
            <h2>Última sincronização</h2>
            <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--texto)' }}>{snap ? dataHora(snap.recebidoEm) : 'Nunca sincronizado'}</p>
            {snap && (
              <p className="pequeno-txt">
                por {snap.enviadoPor} · {snap.total} projetos · {Object.keys(snap.detalhes || {}).length} com itens e compras
              </p>
            )}
          </div>
          {podeEditar && (
            <a ref={linkRef} className="btn primario" onClick={(e) => e.preventDefault()} title="Arraste para a barra de favoritos e clique nele dentro do PMO">
              ⇅ Sincronizar PMO
            </a>
          )}
        </div>
        {podeEditar && (
          <details>
            <summary className="pequeno-txt">Como sincronizar</summary>
            <p className="pequeno-txt">
              1. Arraste o botão "Sincronizar PMO" para a barra de favoritos (uma vez só). 2. Abra o PMO logado. 3. Clique no favorito — uma janela do Controle
              de Obras abre, recebe os dados e salva. Nada é alterado no PMO.
            </p>
          </details>
        )}
      </div>

      {erro && <div className="erro-box">{erro}</div>}

      {snap && (
        <div className="bloco">
          <div className="filtros">
            <input type="search" placeholder="Buscar OP, projeto, cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select value={bu} onChange={(e) => setBu(e.target.value)} aria-label="BU">
              <option value="">Todas as BUs</option>
              {[...new Set((snap.projetos || []).map(nomeBu))].sort().map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select value={fase} onChange={(e) => setFase(e.target.value)}>
              <option value="ativos">Em execução (execução + operação)</option>
              <option value="execucao">Só execução</option>
              <option value="operacao">Só operação</option>
              <option value="orcamento">Orçamento</option>
              <option value="finalizado">Finalizados</option>
              <option value="cancelado">Cancelados</option>
              <option value="todas">Todas as fases</option>
            </select>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="controle">Só POs que estão no controle</option>
              <option value="fora">Só os que não estão no controle</option>
              <option value="novos">Novos no PMO (30 dias){qtdNovos ? ` — ${qtdNovos}` : ''}</option>
              <option value="todos">Todos</option>
            </select>
            <span className="pequeno-txt">
              {linhas.length} projetos · ROB orçada {moeda0(soma.orc)} · ROB real {moeda0(soma.real)}
            </span>
            {podeEditar && foraDoControle > 0 && (
              <button className="primario" disabled={trazendo} onClick={() => trazer(linhas)}>
                {trazendo ? 'Criando…' : `Trazer ${foraDoControle} para o controle`}
              </button>
            )}
          </div>
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>OP</th>
                  <th>Projeto / cliente</th>
                  <th>Fase</th>
                  <th className="num">ROB orçada</th>
                  <th className="num">MCL orç.</th>
                  <th className="num">ROB real</th>
                  <th className="num">MCL real</th>
                  <th>Compras</th>
                  <th>No controle</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => {
                  const det = snap.detalhes?.[p.codigo];
                  const pend = pendentes(det);
                  const orcs = orcPorPo[p.po] || [];
                  return (
                    <Fragment key={p.codigo}>
                      <tr className={det ? 'clicavel' : ''} onClick={() => det && setAberto(aberto === p.codigo ? null : p.codigo)}>
                        <td>
                          <strong>{p.codigo}</strong> {ehNovo(p.codigo) && <span className="tag sobra">novo</span>}
                        </td>
                        <td>
                          {p.nome}
                          {p.cliente && p.cliente !== p.nome && <div className="pequeno-txt">{p.cliente}</div>}
                        </td>
                        <td>{FASES[p.fase] || p.fase || '—'}</td>
                        <td className="num">{p.robOrcada != null ? moeda0(p.robOrcada) : '—'}</td>
                        <td className="num">{p.mclOrcada != null ? pct(p.mclOrcada) : '—'}</td>
                        <td className="num">{p.robReal != null ? moeda0(p.robReal) : '—'}</td>
                        <td className="num">{p.mclReal != null ? pct(p.mclReal) : '—'}</td>
                        <td>
                          {!det ? '—' : pend.length ? <span className="tag falta">{pend.length} a comprar</span> : <span className="tag ok">comprado</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {orcs.length
                            ? orcs.map((o) => (
                                <a key={o.id} href={`#/orcamentos/${o.id}`} className="pequeno-txt" style={{ display: 'block' }}>
                                  {o.nome}
                                </a>
                              ))
                            : podeEditar && p.po ? (
                              <button className="pequeno" disabled={trazendo} onClick={() => trazer([p])}>
                                Trazer
                              </button>
                            ) : (
                              '—'
                            )}
                        </td>
                      </tr>
                      {aberto === p.codigo && det && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--nevoa)' }}>
                            {det.receber && (
                              <p className="pequeno-txt">
                                Contratado {moeda0(det.receber.contratado)} · Faturado {moeda0(det.receber.faturado)} · A faturar {moeda0(det.receber.aFaturar)} ·
                                Recebido {moeda0(det.receber.recebido)}
                                {det.forecast?.risco && ` · Risco ${det.forecast.risco}`}
                              </p>
                            )}
                            <table>
                              <thead>
                                <tr>
                                  <th>Código</th>
                                  <th>Descrição</th>
                                  <th className="num">Orçado</th>
                                  <th className="num">Comprado</th>
                                  <th className="num">Entrada</th>
                                  <th className="num">Saída</th>
                                  <th className="num">Estoque</th>
                                  <th>Situação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...det.itens, ...det.servicos].map((i, k) => (
                                  <tr key={k}>
                                    <td>{i.cod}</td>
                                    <td>{i.descricao}</td>
                                    <td className="num">{numero(i.qtdOrcada)}</td>
                                    <td className="num">{numero(i.qtdComprada)}</td>
                                    <td className="num">{numero(i.qtdEntrada)}</td>
                                    <td className="num">{numero(i.qtdSaida)}</td>
                                    <td className="num">{numero(i.estoque)}</td>
                                    <td>{i.alertas?.length ? i.alertas.join('; ') : i.status || '—'}</td>
                                  </tr>
                                ))}
                                {!det.itens.length && !det.servicos.length && (
                                  <tr>
                                    <td colSpan={8}>Sem itens vinculados no PMO{det.foraBom ? ` (${det.foraBom} itens fora do orçamento)` : ''}.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
