import { useEffect, useState } from 'react';
import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { Pill } from '../components.jsx';
import { filtrarPorCliente, pendencias, data, moeda0, api } from '../lib/util.js';

const LIMITE_ALERTA = 70; // % do M.O orçado a partir do qual já vale alertar

export default function Pendencias() {
  const { dados, clienteId, nomeCliente, recarregar, podeEditar } = useApp();
  const d = filtrarPorCliente(dados, clienteId);
  const p = pendencias(d);

  const [mo, setMo] = useState(null); // null = ainda carregando/indisponível
  const buscarMo = () =>
    api(`mo-integracao${podeEditar ? '?sincronizar=1' : ''}`)
      .then((r) => setMo(r.porPo || []))
      .catch(() => setMo([]));
  useEffect(() => {
    buscarMo();
    const t = setInterval(async () => {
      await buscarMo();
      recarregar();
    }, 60_000);
    return () => clearInterval(t);
  }, [recarregar, podeEditar]);

  const moAlerta = (mo || [])
    .filter((r) => r.pctConsumido != null && r.pctConsumido >= LIMITE_ALERTA)
    .filter((r) => !clienteId || d.orcamentos.some((o) => o.po === r.po))
    .sort((a, b) => b.pctConsumido - a.pctConsumido);
  const semRegra = [...new Set((mo || []).flatMap((r) => (r.composicoesSemRegra || []).map((c) => `PO ${r.po}: ${c}`)))];

  const total = p.locaisParados.length + p.orcamentosVencendo.length + p.terceirosPendentes.length + moAlerta.length;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Pendências</h1>
          <div className="sub">O que precisa da sua atenção agora, reunido em um só lugar.</div>
        </div>
        <div className="topo-acoes">
          <FiltroCliente />
        </div>
      </div>

      {semRegra.length > 0 && (
        <div className="bloco" style={{ borderColor: 'var(--amarelo)' }}>
          <p className="pequeno-txt">
            ⚠ Equipes alocadas sem valor de hora cadastrado — não entram na conta de M.O até você cadastrar em Configurações: {semRegra.join(' · ')}
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="vazio">Nenhuma pendência encontrada — tudo em dia por aqui.</div>
      ) : (
        <div className="duas-col">
          <Bloco titulo="M.O aproximando ou acima do limite" vazio="Nenhuma PO com M.O perto do orçado." qtd={moAlerta.length}>
            {moAlerta.map((r) => (
              <Linha key={r.po} onClick={() => navegar('orcamentos')}>
                <div>
                  <strong>PO {r.po}</strong>
                  <div className="pequeno-txt muted">
                    {r.horasNormais + r.horasExtras}h apontadas na Central de Alocação
                  </div>
                </div>
                <span className={`tag ${r.pctConsumido > 100 ? 'falta' : 'sobra'}`}>{r.pctConsumido > 100 ? 'Estourado' : 'Perto do limite'}</span>
                <strong className="num" style={{ color: r.pctConsumido > 100 ? 'var(--vermelho)' : undefined }}>
                  {moeda0(r.custo)} de {moeda0(r.moOrcado)} ({r.pctConsumido}%)
                </strong>
              </Linha>
            ))}
          </Bloco>

          <Bloco titulo="Orçamentos vencendo ou vencidos" vazio="Nenhum orçamento vencendo nos próximos 30 dias." qtd={p.orcamentosVencendo.length}>
            {p.orcamentosVencendo.map((o) => (
              <Linha key={o.id} onClick={() => navegar(`orcamentos/${o.id}`)}>
                <div>
                  <strong>{o.po ? `PO ${o.po}` : o.nome}</strong> — {o.nome}
                  <div className="pequeno-txt muted">{nomeCliente(o.clienteId)}</div>
                </div>
                <span className={`tag ${o.vencido ? 'falta' : 'sobra'}`}>{o.vencido ? 'Vencido' : 'Vence em breve'}</span>
                <span className="pequeno-txt" style={{ color: o.vencido ? 'var(--vermelho)' : undefined }}>
                  {o.vencido ? 'Venceu em' : 'Vence em'} {data(o.vencimento)}
                </span>
              </Linha>
            ))}
          </Bloco>

          <Bloco titulo="Terceiro fechado, ainda não pago" vazio="Nenhum saldo pendente com terceiros." qtd={p.terceirosPendentes.length}>
            {p.terceirosPendentes.map((l) => (
              <Linha key={l.id} onClick={() => navegar(`locais/${l.id}`)}>
                <div>
                  <strong>{l.nome}</strong>
                  <div className="pequeno-txt muted">
                    {l.po ? `PO ${l.po}` : 'Sem PO'}, {nomeCliente(l.clienteId)}
                  </div>
                </div>
                <span className="pequeno-txt muted">
                  Fechado {moeda0(l.valorTerceiro)}, pago {moeda0(l.valorTerceiroPago || 0)}
                </span>
                <strong className="num">{moeda0(l.saldoTerceiro)}</strong>
              </Linha>
            ))}
          </Bloco>

          <Bloco titulo="Locais parados" vazio="Nenhum local parado ou não iniciado." qtd={p.locaisParados.length}>
            {p.locaisParados.map((l) => (
              <Linha key={l.id} onClick={() => navegar(`locais/${l.id}`)}>
                <div>
                  <strong>{l.nome}</strong>
                  <div className="pequeno-txt muted">
                    {l.po ? `PO ${l.po}` : 'Sem PO'}, {l.regiao || nomeCliente(l.clienteId)}
                  </div>
                </div>
                <Pill status={l.status} />
              </Linha>
            ))}
          </Bloco>
        </div>
      )}
    </>
  );
}

function Bloco({ titulo, vazio, qtd, children }) {
  return (
    <section className="bloco">
      <div className="bloco-cab">
        <h2>
          {titulo} {qtd > 0 && <span className="tag">{qtd}</span>}
        </h2>
      </div>
      {qtd > 0 ? <div className="lista-pendencias">{children}</div> : <p className="muted pequeno-txt">{vazio}</p>}
    </section>
  );
}

function Linha({ children, onClick }) {
  return (
    <div className="linha-pendencia clicavel" onClick={onClick}>
      {children}
    </div>
  );
}
