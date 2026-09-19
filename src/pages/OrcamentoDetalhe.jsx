import { useEffect, useMemo, useState } from 'react';
import { useApp, navegar } from '../App.jsx';
import { Campo, Icone, ItensTabela, Totais, Pill, NumInput } from '../components.jsx';
import { totaisOrc, moeda, moeda0, pct, STATUS_ORC, exportarExcel, custoItem, pagoItem, api } from '../lib/util.js';

export default function OrcamentoDetalhe({ id }) {
  const { dados, salvar, excluir, podeEditar, nomeCliente, toast } = useApp();
  const original = dados.orcamentos.find((o) => o.id === id);
  const [o, setO] = useState(original);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!sujo) setO(original);
  }, [original]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const aviso = (e) => {
      if (sujo) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sujo]);

  const t = useMemo(() => (o ? totaisOrc(o) : null), [o]);
  if (!original || !o) return <div className="bloco vazio">Orçamento não encontrado. <a href="#/orcamentos">Voltar para a lista</a></div>;

  const set = (campo, v) => {
    setO((x) => ({ ...x, [campo]: v }));
    setSujo(true);
  };
  const locais = dados.locais.filter((l) => l.clienteId === o.clienteId && String(l.po) === String(o.po) && o.po);

  const gravar = async () => {
    setSalvando(true);
    try {
      await salvar('orcamentos', o);
      setSujo(false);
      toast('Orçamento salvo');
    } finally {
      setSalvando(false);
    }
  };
  const apagar = async () => {
    if (!confirm(`Excluir o orçamento "${o.nome}"? Os locais vinculados continuam cadastrados.`)) return;
    await excluir('orcamentos', o.id);
    toast('Orçamento excluído');
    navegar('orcamentos');
  };
  const exportar = () =>
    exportarExcel(`Orcamento_${o.po || 'semPO'}_${o.nome.replace(/[^\w]+/g, '_')}.xlsx`, {
      Itens: o.itens.map((i) => ({
        Grupo: i.grupo,
        Categoria: i.categoria,
        'Cód.': i.codigo,
        'Descrição do Item': i.descricao,
        Un: i.unidade,
        'Qtd Orçada': i.qtd,
        'Custo Unit. (R$)': i.custoUnit,
        'Custo Total (R$)': custoItem(i),
        'Venda (ROB) (R$)': i.rob || 0,
        'Qtd Comprada': i.qtdComprada || 0,
        'Qtd Faltante': Math.max((i.qtd || 0) - (i.qtdComprada || 0), 0),
        'Data da Compra': i.dataCompra || '',
        'Valor Unit Pago': i.valorUnitPago || 0,
        'Valor Pago (R$)': pagoItem(i),
      })),
    });

  return (
    <>
      <div className="topo">
        <div>
          <a href="#/orcamentos" className="pequeno-txt" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icone nome="voltar" tam={14} /> Orçamentos
          </a>
          <h1 style={{ marginTop: 6 }}>{o.nome}</h1>
          <div className="sub">
            {o.po ? `PO ${o.po}` : 'Sem PO'}, {nomeCliente(o.clienteId)}
            {o.arquivoOrigem && <div className="pequeno-txt">Importado de {o.arquivoOrigem}</div>}
          </div>
        </div>
        <div className="topo-acoes">
          <button onClick={exportar}>
            <Icone nome="baixar" /> Exportar Excel
          </button>
          {podeEditar && (
            <button className="perigo" onClick={apagar}>
              <Icone nome="lixo" /> Excluir
            </button>
          )}
        </div>
      </div>

      <section className="bloco">
        <div className="bloco-cab">
          <h2>Dados da proposta</h2>
        </div>
        <fieldset disabled={!podeEditar}>
          <div className="grade">
            <Campo rotulo="Cliente">
              <select value={o.clienteId} onChange={(e) => set('clienteId', e.target.value)}>
                {dados.clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="PO / OP">
              <input value={o.po || ''} onChange={(e) => set('po', e.target.value.trim())} />
            </Campo>
            <Campo rotulo="Nome" className="largo">
              <input value={o.nome || ''} onChange={(e) => set('nome', e.target.value)} />
            </Campo>
            <Campo rotulo="Status">
              <select value={o.status || 'Em análise'} onChange={(e) => set('status', e.target.value)}>
                {STATUS_ORC.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Revisão">
              <input value={o.revisao || ''} onChange={(e) => set('revisao', e.target.value)} />
            </Campo>
            <Campo rotulo="Comercial">
              <input value={o.comercial || ''} onChange={(e) => set('comercial', e.target.value)} />
            </Campo>
            <Campo rotulo="Venda ao cliente" dica="ROB, R$">
              <NumInput moeda valor={o.robArquivo} onChange={(v) => set('robArquivo', v)} />
            </Campo>
            <Campo rotulo="Elaborado por">
              <input value={o.elaboradoPor || ''} onChange={(e) => set('elaboradoPor', e.target.value)} />
            </Campo>
            <Campo rotulo="Data da proposta">
              <input type="date" value={o.data || ''} onChange={(e) => set('data', e.target.value)} />
            </Campo>
            <Campo rotulo="Vencimento">
              <input type="date" value={o.vencimento || ''} onChange={(e) => set('vencimento', e.target.value)} />
            </Campo>
            <Campo rotulo="UF origem">
              <input value={o.ufOrigem || ''} maxLength={2} onChange={(e) => set('ufOrigem', e.target.value.toUpperCase())} />
            </Campo>
            <Campo rotulo="UF destino">
              <input value={o.ufDestino || ''} maxLength={2} onChange={(e) => set('ufDestino', e.target.value.toUpperCase())} />
            </Campo>
            <Campo rotulo="Observações" className="inteiro">
              <textarea value={o.obs || ''} onChange={(e) => set('obs', e.target.value)} />
            </Campo>
          </div>
        </fieldset>
      </section>

      <BlocoMO po={o.po} />

      <div className="duas-col" style={{ marginBottom: 20 }}>
        <section className="bloco">
          <div className="bloco-cab">
            <h2>Resumo financeiro</h2>
          </div>
          <Totais t={t} />
          {t.rob > 0 && (
            <p className="muted pequeno-txt" style={{ marginBottom: 0 }}>
              Venda (ROB): {moeda(t.rob)}. Margem bruta sobre o custo: {pct((t.rob - t.orcado) / t.rob)}.
            </p>
          )}
        </section>
        <section className="bloco">
          <div className="bloco-cab">
            <h2>Locais desta PO</h2>
            <a href="#/locais" className="pequeno-txt">Gerenciar locais</a>
          </div>
          {locais.length ? (
            <table>
              <tbody>
                {locais.map((l) => (
                  <tr key={l.id} className="clicavel" onClick={() => navegar(`locais/${l.id}`)}>
                    <td>{l.nome}</td>
                    <td className="muted">{l.regiao}</td>
                    <td>
                      <Pill status={l.status} />
                    </td>
                    <td className="num" title="M.O do local">{l.moUnit ? `M.O ${moeda0(l.moUnit)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="vazio">Nenhum local com a PO {o.po || '(sem PO)'} deste cliente.</div>
          )}
        </section>
      </div>

      <section className="bloco">
        <div className="bloco-cab">
          <div>
            <h2>Itens</h2>
            <p>Lance as compras nas colunas da direita: quantidade, data e valor unitário pago.</p>
          </div>
        </div>
        <ItensTabela
          itens={o.itens || []}
          podeEditar={podeEditar}
          onChange={(itens) => {
            setO((x) => ({ ...x, itens }));
            setSujo(true);
          }}
        />
      </section>

      {sujo && podeEditar && (
        <div className="salvar-barra">
          <span>Há alterações não salvas.</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                setO(original);
                setSujo(false);
              }}
            >
              Descartar
            </button>
            <button className="primario" onClick={gravar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Mostra de onde vem o custo de M.O desta PO (Central de Alocação + serviços de terceiros
// comprados via SC no SAP) e permite forçar a sincronização com os itens de M.O.
function BlocoMO({ po }) {
  const { podeEditar, toast, recarregar } = useApp();
  const [r, setR] = useState(undefined); // undefined = carregando
  const [erro, setErro] = useState('');
  const [sinc, setSinc] = useState(false);

  const buscar = async (sincronizar = false) => {
    setErro('');
    try {
      const res = await api(`mo-integracao${sincronizar ? '?sincronizar=1' : ''}`);
      setR((res.porPo || []).find((x) => String(x.po) === String(po)) || null);
      return res;
    } catch (e) {
      setErro(e.message || 'Falha ao consultar a integração de M.O.');
      setR(null);
    }
  };

  useEffect(() => {
    if (po) buscar(false);
    else setR(null);
  }, [po]); // eslint-disable-line react-hooks/exhaustive-deps

  const sincronizar = async () => {
    setSinc(true);
    try {
      const res = await buscar(true);
      if (res) {
        await recarregar();
        toast(res.sincronizados ? `${res.sincronizados} orçamento(s) atualizado(s).` : 'Nada mudou — os itens de M.O já estavam com o valor apurado.');
      }
    } finally {
      setSinc(false);
    }
  };

  if (!po) return null;
  if (r === undefined) return null;

  return (
    <section className="bloco" style={{ marginBottom: 20 }}>
      <div className="bloco-cab">
        <div>
          <h2>M.O apurada da PO {po}</h2>
          <p>Horas da Central de Alocação + serviços de terceiros comprados via SC no SAP.</p>
        </div>
        {podeEditar && (
          <button className="pequeno" onClick={sincronizar} disabled={sinc}>
            {sinc ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        )}
      </div>
      {erro && <p className="pequeno-txt" style={{ color: 'var(--vermelho)' }}>{erro}</p>}
      {!erro && !r && <p className="muted pequeno-txt">Nada apurado para esta PO ainda — sem alocação na Central e sem serviço de terceiro nas SCs importadas.</p>}
      {r && (
        <>
          <div className="tabela-wrap">
            <table>
              <tbody>
                <tr>
                  <td>Horas ({(r.horasNormais || 0) + (r.horasExtras || 0)}h, sendo {r.horasExtras || 0}h extras)</td>
                  <td className="num">{moeda(r.custo - (r.hotel || 0) - (r.refeicao || 0) - (r.outros || 0) - (r.terceiros || 0))}</td>
                </tr>
                {(r.hotel > 0 || r.refeicao > 0 || r.outros > 0) && (
                  <tr>
                    <td>Hotel / refeição / outros</td>
                    <td className="num">{moeda((r.hotel || 0) + (r.refeicao || 0) + (r.outros || 0))}</td>
                  </tr>
                )}
                <tr>
                  <td>Serviços de terceiros (SC){r.terceirosLinhas ? ` — ${r.terceirosLinhas} linha(s)` : ''}</td>
                  <td className="num">{moeda(r.terceiros || 0)}</td>
                </tr>
                <tr>
                  <td><strong>Total apurado</strong></td>
                  <td className="num"><strong>{moeda(r.custo)}</strong></td>
                </tr>
                <tr>
                  <td>M.O orçada (todas as OPs desta PO)</td>
                  <td className="num" style={{ color: r.pctConsumido > 100 ? 'var(--vermelho)' : undefined }}>
                    {moeda(r.moOrcado)} {r.pctConsumido != null && `(${r.pctConsumido}% consumido)`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {r.semLinhaMO && (
            <p className="pequeno-txt" style={{ color: 'var(--amarelo)' }}>
              ⚠ Esta PO não tem nenhum item com categoria <strong>M.O</strong> no orçamento — o valor apurado não tem onde ser lançado.
            </p>
          )}
          {r.composicoesSemRegra?.length > 0 && (
            <p className="pequeno-txt" style={{ color: 'var(--amarelo)' }}>
              ⚠ Equipes sem valor de hora cadastrado (não entram na conta): {r.composicoesSemRegra.join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
