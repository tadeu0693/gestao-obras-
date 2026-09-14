import { useEffect, useState } from 'react';
import { GRUPOS, CATEGORIAS, categoriaDoGrupo } from './lib/parseProposta.js';
import { moeda, moeda0, numero, parseNum, pct, data, uid, custoItem, pagoItem, COR_STATUS, STATUS_LOCAL } from './lib/util.js';

// ---------- ícones (traço simples, 18px) ----------
const P = {
  painel: 'M4 15a8 8 0 1 1 16 0M12 15l4-5M3 19h18',
  orcamentos: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6',
  importar: 'M12 15V4M8 8l4-4 4 4M5 14v5h14v-5',
  locais: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  materiais: 'M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8M12 13v8',
  estoque: 'M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10',
  clientes: 'M4 21V5l7-2v18M11 9h9v12M7 8h1M7 12h1M7 16h1M14 13h2M14 17h2',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  mais: 'M12 5v14M5 12h14',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  fechar: 'M6 6l12 12M18 6L6 18',
  baixar: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  voltar: 'M15 5l-7 7 7 7',
  consolidado: 'M12 3L3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  pendencias: 'M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0',
};
export function Icone({ nome, tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[nome]} />
    </svg>
  );
}

// Símbolo: três cabos saindo de um conector
export function Simbolo({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="9" width="10" height="14" rx="2" fill="#fff" />
      <path d="M12 12c8 0 8-6 18-6M12 16h18M12 20c8 0 8 6 18 6" fill="none" strokeWidth="2.6" strokeLinecap="round" stroke="#12a2ae" />
      <path d="M12 16h18" stroke="#e0a800" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

// ---------- entradas ----------
export function NumInput({ valor, onChange, className = 'num', ...resto }) {
  const [txt, setTxt] = useState(fmtEdit(valor));
  useEffect(() => setTxt(fmtEdit(valor)), [valor]);
  const commit = () => {
    const n = parseNum(txt);
    if (n !== (Number(valor) || 0)) onChange(n);
    else setTxt(fmtEdit(valor));
  };
  return (
    <input
      inputMode="decimal"
      className={className}
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      {...resto}
    />
  );
}
function fmtEdit(v) {
  const n = Number(v) || 0;
  if (!n) return '';
  return String(Math.round(n * 10000) / 10000).replace('.', ',');
}

export function Campo({ rotulo, dica, className, children }) {
  return (
    <label className={`campo ${className || ''}`}>
      <span>
        {rotulo} {dica && <small>({dica})</small>}
      </span>
      {children}
    </label>
  );
}

export function Pill({ status }) {
  return (
    <span className="pill" style={{ '--cor': COR_STATUS[status] || 'var(--cinza-status)' }}>
      {status || 'Sem status'}
    </span>
  );
}

export function StatusSelect({ valor, onChange, disabled }) {
  return (
    <select className="status-sel" value={valor || 'Não iniciada'} onChange={(e) => onChange(e.target.value)} disabled={disabled} onClick={(e) => e.stopPropagation()} style={{ borderColor: COR_STATUS[valor] }}>
      {STATUS_LOCAL.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

export function Gaveta({ titulo, sub, aoFechar, rodape, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <>
      <div className="gaveta-fundo" onClick={aoFechar} />
      <aside className="gaveta" role="dialog" aria-label={titulo}>
        <div className="gaveta-cab">
          <div>
            <h2>{titulo}</h2>
            {sub && <div className="muted pequeno-txt">{sub}</div>}
          </div>
          <button className="fantasma" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </div>
        <div className="gaveta-corpo">{children}</div>
        {rodape && <div className="gaveta-rodape">{rodape}</div>}
      </aside>
    </>
  );
}

// ---------- régua de consumo ----------
export function Regua({ orcado, gasto }) {
  const p = orcado ? gasto / orcado : 0;
  return (
    <div className="regua">
      <div className="regua-numeros">
        <div>
          <span>Orçado</span>
          <strong>{moeda0(orcado)}</strong>
        </div>
        <div className="gasto">
          <span>Gasto até agora</span>
          <strong>{moeda0(gasto)}</strong>
        </div>
        <div>
          <span>Saldo disponível</span>
          <strong style={{ color: orcado - gasto < 0 ? 'var(--vermelho)' : undefined }}>{moeda0(orcado - gasto)}</strong>
        </div>
      </div>
      <div className="regua-trilho" role="img" aria-label={`Consumido ${pct(p)} do orçado`}>
        <div className={`regua-cheio ${p > 1 ? 'estouro' : ''}`} style={{ width: `${Math.min(p, 1) * 100}%` }} />
      </div>
      <div className="regua-legenda">
        <span>{pct(p)} consumido</span>
        <span>100%</span>
      </div>
    </div>
  );
}
export function MiniRegua({ p }) {
  return (
    <div className="mini-regua" title={pct(p)}>
      <div className={p > 1 ? 'estouro' : ''} style={{ width: `${Math.min(p || 0, 1) * 100}%` }} />
    </div>
  );
}

// ---------- gráfico semanal ----------
export function GraficoSemanal({ serie, orcado }) {
  if (!serie.length) return <div className="vazio">Nenhuma compra com data lançada ainda. Informe a data e o valor pago nos itens de cada orçamento.</div>;
  const W = 720, H = 220, pad = { l: 64, r: 12, t: 14, b: 28 };
  const max = Math.max(orcado, serie.at(-1).acumulado) * 1.05 || 1;
  const x = (i) => pad.l + (i / Math.max(serie.length - 1, 1)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const linha = serie.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.acumulado)}`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const passo = Math.ceil(serie.length / 8);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gasto acumulado por semana">
        {ticks.map((t) => (
          <g key={t}>
            <line className="eixo" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{moeda0(t).replace('R$', '').trim()}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(orcado)} y2={y(orcado)} stroke="var(--amarelo)" strokeDasharray="5 4" strokeWidth="1.5" />
        <text x={W - pad.r} y={y(orcado) - 5} textAnchor="end" style={{ fill: '#7a5b00' }}>Orçado</text>
        {serie.map((s, i) => {
          const h = (s.gasto / max) * (H - pad.t - pad.b);
          return <rect key={s.semana} x={x(i) - 5} y={H - pad.b - h} width="10" height={h} fill="var(--aqua-claro)" />;
        })}
        <path d={linha} fill="none" stroke="var(--aqua)" strokeWidth="2.2" />
        {serie.map((s, i) =>
          i % passo === 0 ? (
            <text key={s.semana} x={x(i)} y={H - 8} textAnchor="middle">{data(s.semana).slice(0, 5)}</text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

// ---------- tabela editável de itens do orçamento ----------
export function ItensTabela({ itens, onChange, compras = true, podeEditar = true }) {
  const [selecionados, setSelecionados] = useState(() => new Set());
  const alternar = (id) =>
    setSelecionados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const set = (id, campo, v) =>
    onChange(
      itens.map((i) => {
        if (i.id !== id) return i;
        const n = { ...i, [campo]: v };
        if (campo === 'grupo') n.categoria = categoriaDoGrupo(v);
        if (campo === 'qtdComprada' && v && !i.valorUnitPago) n.valorUnitPago = i.custoUnit;
        if (campo === 'valorUnitPago' && v && !i.qtdComprada) n.qtdComprada = i.qtd;
        return n;
      }),
    );
  const remover = (id) => onChange(itens.filter((i) => i.id !== id));
  const adicionar = () =>
    onChange([...itens, { id: uid(), grupo: 'Equipamentos', categoria: 'Eletrônico', codigo: '', descricao: '', unidade: 'PÇ', qtd: 1, custoUnit: 0, rob: 0, qtdComprada: 0, dataCompra: '', valorUnitPago: 0 }]);

  const totCusto = itens.reduce((s, i) => s + custoItem(i), 0);
  const totRob = itens.reduce((s, i) => s + (Number(i.rob) || 0), 0);
  const totPago = itens.reduce((s, i) => s + pagoItem(i), 0);
  const grupos = [...new Set([...Object.values(GRUPOS), ...itens.map((i) => i.grupo).filter(Boolean)])];

  const marcados = itens.filter((i) => selecionados.has(i.id));
  const selCusto = marcados.reduce((s, i) => s + custoItem(i), 0);
  const selRob = marcados.reduce((s, i) => s + (Number(i.rob) || 0), 0);
  const selPago = marcados.reduce((s, i) => s + pagoItem(i), 0);

  return (
    <fieldset disabled={!podeEditar}>
      {marcados.length > 0 && (
        <div className="selecao-resumo">
          <span>
            <strong>{marcados.length}</strong> item{marcados.length !== 1 && 's'} selecionado{marcados.length !== 1 && 's'}
          </span>
          <span>
            Custo: <strong>{moeda(selCusto)}</strong>
          </span>
          <span>
            Pago: <strong>{moeda(selPago)}</strong>
          </span>
          <span>
            Venda (ROB): <strong>{selRob ? moeda(selRob) : '—'}</strong>
          </span>
          <button className="pequeno" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      <div className="tabela-wrap">
        <table className="tabela-edit" style={{ minWidth: compras ? 1660 : 1260 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th style={{ width: 84 }}>Código</th>
              <th>Descrição</th>
              <th style={{ width: 150 }}>Grupo</th>
              <th style={{ width: 138 }}>Categoria</th>
              <th style={{ width: 62 }}>Un.</th>
              <th className="num" style={{ width: 80 }}>Qtd</th>
              <th className="num" style={{ width: 110 }}>Custo unit.</th>
              <th className="num">Custo total</th>
              <th className="num" style={{ width: 120 }}>Venda (ROB)</th>
              {compras && (
                <>
                  <th className="num" style={{ width: 80 }}>Qtd comprada</th>
                  <th style={{ width: 138 }}>Data compra</th>
                  <th className="num" style={{ width: 110 }}>Unit. pago</th>
                  <th className="num">Pago</th>
                </>
              )}
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className={selecionados.has(i.id) ? 'linha-marcada' : ''}>
                <td>
                  <input type="checkbox" checked={selecionados.has(i.id)} onChange={() => alternar(i.id)} aria-label="Selecionar item" />
                </td>
                <td>
                  <input value={i.codigo || ''} placeholder="—" onChange={(e) => set(i.id, 'codigo', e.target.value)} aria-label="Código" />
                </td>
                <td className="celula-desc">
                  <input value={i.descricao} onChange={(e) => set(i.id, 'descricao', e.target.value)} title={i.descricao} aria-label="Descrição" />
                </td>
                <td>
                  <select value={i.grupo} onChange={(e) => set(i.id, 'grupo', e.target.value)} aria-label="Grupo">
                    {grupos.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={i.categoria} onChange={(e) => set(i.id, 'categoria', e.target.value)} aria-label="Categoria">
                    {CATEGORIAS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={i.unidade || ''} onChange={(e) => set(i.id, 'unidade', e.target.value)} aria-label="Unidade" />
                </td>
                <td>
                  <NumInput valor={i.qtd} onChange={(v) => set(i.id, 'qtd', v)} aria-label="Quantidade" />
                </td>
                <td>
                  <NumInput valor={i.custoUnit} onChange={(v) => set(i.id, 'custoUnit', v)} aria-label="Custo unitário" />
                </td>
                <td className="num">{moeda(custoItem(i))}</td>
                <td>
                  <NumInput valor={i.rob} onChange={(v) => set(i.id, 'rob', v)} aria-label="Venda (ROB)" />
                </td>
                {compras && (
                  <>
                    <td>
                      <NumInput valor={i.qtdComprada} onChange={(v) => set(i.id, 'qtdComprada', v)} aria-label="Quantidade comprada" />
                    </td>
                    <td>
                      <input type="date" value={i.dataCompra || ''} onChange={(e) => set(i.id, 'dataCompra', e.target.value)} aria-label="Data da compra" />
                    </td>
                    <td>
                      <NumInput valor={i.valorUnitPago} onChange={(v) => set(i.id, 'valorUnitPago', v)} aria-label="Valor unitário pago" />
                    </td>
                    <td className="num" style={{ color: pagoItem(i) > custoItem(i) ? 'var(--vermelho)' : undefined }}>{pagoItem(i) ? moeda(pagoItem(i)) : '—'}</td>
                  </>
                )}
                <td>
                  <button className="fantasma" onClick={() => remover(i.id)} aria-label="Remover item" title="Remover item">
                    <Icone nome="lixo" tam={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                {podeEditar && (
                  <button className="pequeno" onClick={adicionar}>
                    <Icone nome="mais" tam={15} /> Adicionar item
                  </button>
                )}
              </td>
              <td colSpan={5} className="num muted">
                {itens.length} itens
              </td>
              <td className="num">{moeda(totCusto)}</td>
              <td className="num">{totRob ? moeda(totRob) : '—'}</td>
              {compras && (
                <>
                  <td colSpan={3} />
                  <td className="num">{moeda(totPago)}</td>
                </>
              )}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </fieldset>
  );
}

export function Totais({ t }) {
  const cats = Object.entries(t.cat);
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th className="num">Orçado</th>
            <th className="num">Pago</th>
            <th className="num">Saldo</th>
            <th style={{ width: 140 }}>Consumo</th>
          </tr>
        </thead>
        <tbody>
          {cats.map(([c, v]) => (
            <tr key={c}>
              <td>{c}</td>
              <td className="num">{moeda(v.orcado)}</td>
              <td className="num">{moeda(v.pago)}</td>
              <td className="num">{moeda(v.orcado - v.pago)}</td>
              <td>
                <MiniRegua p={v.orcado ? v.pago / v.orcado : 0} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{moeda(t.orcado)}</td>
            <td className="num">{moeda(t.pago)}</td>
            <td className="num">{moeda(t.orcado - t.pago)}</td>
            <td>{numero(t.orcado ? (t.pago / t.orcado) * 100 : 0)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
