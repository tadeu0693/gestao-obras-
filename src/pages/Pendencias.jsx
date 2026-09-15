import { useApp, FiltroCliente, navegar } from '../App.jsx';
import { Icone, Pill } from '../components.jsx';
import { filtrarPorCliente, pendencias, data, moeda0, numero, hojeISO } from '../lib/util.js';

export default function Pendencias() {
  const { dados, clienteId, nomeCliente } = useApp();
  const d = filtrarPorCliente(dados, clienteId);
  const p = pendencias(d);
  const hoje = hojeISO();
  const total = p.locaisParados.length + p.locaisProntos.length + p.orcamentosVencendo.length + p.terceirosPendentes.length + p.materiaisNaoRecebidos.length;

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

      {total === 0 ? (
        <div className="vazio">Nenhuma pendência encontrada — tudo em dia por aqui.</div>
      ) : (
        <div className="duas-col">
          <Bloco titulo="Prontos para iniciar" vazio="Nenhum local com material completo esperando início." qtd={p.locaisProntos.length}>
            {p.locaisProntos.map((l) => (
              <Linha key={l.id} onClick={() => navegar(`locais/${l.id}`)}>
                <div>
                  <strong>{l.nome}</strong>
                  <div className="pequeno-txt muted">
                    {l.po ? `PO ${l.po}` : 'Sem PO'}, {l.regiao || nomeCliente(l.clienteId)}
                  </div>
                </div>
                <span className="tag ok">Material completo</span>
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

          <Bloco titulo="Comprado, ainda não recebido no estoque" vazio="Tudo que foi comprado já chegou no estoque." qtd={p.materiaisNaoRecebidos.length}>
            {p.materiaisNaoRecebidos.map((r) => (
              <Linha key={(r.codigo || '') + r.descricao} onClick={() => navegar('materiais')}>
                <div>
                  <strong>{r.codigo || '—'}</strong> — {r.descricao}
                </div>
                <span className="pequeno-txt muted">
                  comprado {numero(r.comprada)}, recebido {numero(r.recebido)}
                </span>
                <strong className="num">{numero(r.saldo)} un.</strong>
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
