import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, navegar } from '../App.jsx';
import { Campo, Icone, ItensTabela } from '../components.jsx';
import { parseFile } from '../lib/parseProposta.js';
import { moeda, semAcento, uid, custoItem, STATUS_ORC } from '../lib/util.js';

const chaveItem = (i) => (i.codigo ? `c:${i.codigo}` : `d:${semAcento(i.descricao)}|${semAcento(i.modelo)}`);

export default function Importar() {
  const { dados, salvar, podeEditar, toast } = useApp();
  const [fila, setFila] = useState([]);
  const [atualId, setAtualId] = useState(null);
  const [sobre, setSobre] = useState(false);
  const inputRef = useRef();

  const receber = async (files) => {
    const novos = [...files].filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f.name));
    if (!novos.length) return toast('Envie arquivos .xlsx, .xlsm ou .xls', true);
    const entradas = novos.map((f) => ({ id: uid(), nome: f.name, status: 'lendo', file: f }));
    setFila((x) => [...x, ...entradas]);
    for (const e of entradas) {
      try {
        const r = await parseFile(e.file);
        if (!r.ok) throw new Error(r.error);
        const rascunho = montarRascunho(r, dados);
        setFila((x) => x.map((y) => (y.id === e.id ? { ...y, status: 'pronto', r, rascunho } : y)));
        setAtualId((a) => a || e.id);
      } catch (err) {
        setFila((x) => x.map((y) => (y.id === e.id ? { ...y, status: 'erro', erro: err.message } : y)));
      }
    }
  };

  const atual = fila.find((f) => f.id === atualId);
  const setRascunho = (fn) => setFila((x) => x.map((y) => (y.id === atualId ? { ...y, rascunho: fn(y.rascunho) } : y)));

  if (!podeEditar) return <div className="bloco vazio">Seu perfil é somente leitura e não pode importar propostas.</div>;

  return (
    <>
      <div className="topo">
        <div>
          <h1>Importar proposta</h1>
          <div className="sub">O sistema lê a planilha de orçamento, preenche tudo e você revisa antes de salvar.</div>
        </div>
      </div>

      <div
        className={`dropzone ${sobre ? 'sobre' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          receber(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current.click()}
      >
        <strong>Arraste as planilhas aqui ou clique para escolher</strong>
        <span className="muted">Aceita .xlsx e .xlsm (lê a aba "Plan. Custo" ou qualquer aba com lista de itens). Pode enviar vários de uma vez.</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xlsm,.xls"
          hidden
          onChange={(e) => {
            receber(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {fila.length > 0 && (
        <div className="fila" aria-label="Arquivos enviados">
          {fila.map((f) => (
            <button key={f.id} className={f.id === atualId ? 'ativo' : ''} onClick={() => f.status !== 'lendo' && setAtualId(f.id)} title={f.erro || f.nome}>
              <span className={f.status === 'salvo' ? 'feito' : f.status === 'erro' ? 'falhou' : ''}>
                {f.status === 'lendo' ? 'Lendo…' : f.status === 'salvo' ? 'Salvo' : f.status === 'erro' ? 'Erro' : 'Revisar'}
              </span>
              {f.nome.length > 42 ? f.nome.slice(0, 40) + '…' : f.nome}
            </button>
          ))}
        </div>
      )}

      {atual?.status === 'erro' && <div className="erro-box">Não consegui ler "{atual.nome}": {atual.erro}</div>}
      {atual?.status === 'salvo' && (
        <div className="ok-box">
          "{atual.nome}" foi salvo. <a href={`#/orcamentos/${atual.salvoId}`}>Abrir orçamento</a>
        </div>
      )}
      {atual?.status === 'pronto' && (
        <Revisao
          key={atual.id}
          entrada={atual}
          setRascunho={setRascunho}
          aoSalvar={async () => {
            const id = await gravar(atual.rascunho, dados, salvar);
            toast('Orçamento importado');
            const restantes = fila.filter((f) => f.status === 'pronto' && f.id !== atual.id);
            setFila((x) => x.map((y) => (y.id === atual.id ? { ...y, status: 'salvo', salvoId: id } : y)));
            if (restantes.length) setAtualId(restantes[0].id);
            else navegar(`orcamentos/${id}`);
          }}
          aoDescartar={() => {
            setFila((x) => x.filter((y) => y.id !== atual.id));
            setAtualId(fila.find((f) => f.id !== atual.id && f.status === 'pronto')?.id || null);
          }}
        />
      )}
    </>
  );
}

// Recalcula cliente, duplicidade e local com os dados atuais (ex.: cliente criado
// ao salvar o arquivo anterior da mesma fila).
function resolver(rs, dados) {
  let clienteRef = rs.clienteRef;
  if (clienteRef.startsWith('novo:')) {
    const c = dados.clientes.find((x) => semAcento(x.nome) === semAcento(clienteRef.slice(5)));
    if (c) clienteRef = c.id;
  }
  if (clienteRef === rs.clienteRef && !rs._pendente) return rs;
  // Duplicidade é por cliente + PO (o identificador que o resto do sistema já usa pra
  // agrupar tudo) — não exige que o nome do arquivo/projeto seja idêntico entre versões.
  const dup = dados.orcamentos.find((x) => x.clienteId === clienteRef && String(x.po) === String(rs.po) && rs.po);
  const loc = rs.local?.nome && dados.locais.find((l) => l.clienteId === clienteRef && String(l.po) === String(rs.po) && semAcento(l.nome) === semAcento(rs.local.nome));
  return { ...rs, clienteRef, _pendente: false, duplicadoId: dup?.id || null, modo: dup ? 'atualizar' : 'novo', localExistenteId: loc?.id || null };
}

function montarRascunho(r, dados) {
  const o = r.orcamento;
  const cli = dados.clientes.find((c) => semAcento(c.nome) === semAcento(o.clienteNome));
  const clienteRef = cli ? cli.id : o.clienteNome ? `novo:${o.clienteNome}` : dados.clientes[0]?.id || 'novo:';
  const dup = cli && dados.orcamentos.find((x) => x.clienteId === cli.id && String(x.po) === String(o.po) && o.po);
  const localExistente =
    cli && r.localSugerido && dados.locais.find((l) => l.clienteId === cli.id && String(l.po) === String(o.po) && semAcento(l.nome) === semAcento(r.localSugerido));
  return {
    ...o,
    status: 'Em análise',
    clienteRef,
    duplicadoId: dup?.id || null,
    modo: dup ? 'atualizar' : 'novo',
    criarLocal: !!r.localSugerido,
    localExistenteId: localExistente?.id || null,
    local: { nome: r.localSugerido, uf: o.ufDestino, regiao: '', endereco: '' },
  };
}

async function gravar(rsOriginal, dados, salvar) {
  const rs = resolver(rsOriginal, dados);
  // 1. cliente
  let clienteId = rs.clienteRef;
  if (clienteId.startsWith('novo:')) {
    const nome = clienteId.slice(5).trim() || 'Cliente sem nome';
    const [c] = await salvar('clientes', { id: uid(), nome });
    clienteId = c.id;
  }
  // 2. orçamento
  const { clienteRef, clienteNome, _pendente, duplicadoId, modo, criarLocal, localExistenteId, local, ...orc } = rs; // eslint-disable-line no-unused-vars
  let registro = { ...orc, clienteId, id: uid() };
  if (modo === 'atualizar' && duplicadoId) {
    const antigo = dados.orcamentos.find((x) => x.id === duplicadoId);
    const antigos = new Map((antigo?.itens || []).map((i) => [chaveItem(i), i]));
    const itens = orc.itens.map((i) => {
      const a = antigos.get(chaveItem(i));
      if (!a) return i;
      antigos.delete(chaveItem(i));
      return { ...i, qtdComprada: a.qtdComprada || 0, dataCompra: a.dataCompra || '', valorUnitPago: a.valorUnitPago || 0 };
    });
    // itens que saíram na revisão mas já tinham compras lançadas não são perdidos
    antigos.forEach((a) => {
      if (a.qtdComprada) itens.push({ ...a, qtd: 0, descricao: `${a.descricao} (removido na rev. ${orc.revisao || 'nova'})` });
    });
    registro = { ...antigo, ...orc, clienteId, itens, id: antigo.id, status: antigo.status || orc.status, obs: antigo.obs };
  }
  const [salvo] = await salvar('orcamentos', registro);
  // 3. local vinculado
  if (criarLocal && local.nome && !localExistenteId) {
    await salvar('locais', {
      id: uid(),
      clienteId,
      po: orc.po,
      orcamentoId: salvo.id,
      nome: local.nome,
      uf: local.uf,
      regiao: local.regiao,
      endereco: local.endereco,
      status: 'Não iniciada',
      equipe: '',
      inicioPrevisto: '',
      fimPrevisto: '',
      obs: '',
      moUnit: orc.itens.filter((i) => i.categoria === 'M.O').reduce((s, i) => s + custoItem(i), 0),
      miscUnit: orc.itens.filter((i) => i.categoria === 'Miscelâneas').reduce((s, i) => s + custoItem(i), 0),
      valorTerceiro: 0,
      valorTerceiroPago: 0,
      cameras: contarCameras(orc.itens),
      postes: { qtd: 0, dataEntrega: '', horaEntrega: '', rota: '', sequencia: '' },
      levantamento: [],
    });
  }
  return salvo.id;
}

function contarCameras(itens) {
  const c = { bullet: 0, dome: 0, ptz: 0, radar: 0, sonofletor: 0 };
  for (const i of itens) {
    const d = semAcento(i.descricao);
    if (!/camera|radar|sonofletor/.test(d) || /junction|pole mount|suporte/.test(d)) continue;
    if (/ptz|speed dome/.test(d)) c.ptz += i.qtd;
    else if (/bullet/.test(d)) c.bullet += i.qtd;
    else if (/dome|fisheye/.test(d)) c.dome += i.qtd;
    else if (/radar/.test(d)) c.radar += i.qtd;
    else if (/sonofletor/.test(d)) c.sonofletor += i.qtd;
  }
  return c;
}

function Revisao({ entrada, setRascunho, aoSalvar, aoDescartar }) {
  const { dados } = useApp();
  const rs = entrada.rascunho;
  const [salvando, setSalvando] = useState(false);
  const set = (campo, v) => setRascunho((x) => ({ ...x, [campo]: v }));
  useEffect(() => {
    const novo = resolver(rs, dados);
    if (novo !== rs) setRascunho(() => novo);
  }, [dados.clientes, dados.orcamentos]); // eslint-disable-line react-hooks/exhaustive-deps
  const setLocal = (campo, v) => setRascunho((x) => ({ ...x, local: { ...x.local, [campo]: v } }));
  const total = useMemo(() => rs.itens.reduce((s, i) => s + custoItem(i), 0), [rs.itens]);
  const regioes = [...new Set(dados.locais.map((l) => l.regiao).filter(Boolean))].sort();
  const clienteNovo = rs.clienteRef.startsWith('novo:');
  const dup = rs.duplicadoId && dados.orcamentos.find((o) => o.id === rs.duplicadoId);
  const localExistente = rs.localExistenteId && dados.locais.find((l) => l.id === rs.localExistenteId);

  const confirmar = async () => {
    if (!rs.po && !confirm('Este orçamento está sem PO. Salvar mesmo assim?')) return;
    setSalvando(true);
    try {
      await aoSalvar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <section className="bloco">
        <div className="bloco-cab">
          <div>
            <h2>Revisão: {rs.nome}</h2>
            <p>
              Lido da aba "{entrada.r.sheetName}", {rs.itens.length} itens, custo de {moeda(total)}
              {rs.robArquivo ? `, venda (ROB) de ${moeda(rs.robArquivo)}` : ''}.
            </p>
          </div>
        </div>
        {entrada.r.warnings.length > 0 && (
          <div className="aviso">
            <strong>Confira antes de salvar</strong>
            <ul>
              {entrada.r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {dup && (
          <div className="aviso" style={{ borderLeftColor: 'var(--aqua)', background: 'var(--aqua-claro)' }}>
            <strong>Já existe o orçamento "{dup.nome}" na PO {dup.po}{dup.revisao ? ` (rev. ${dup.revisao})` : ''}.</strong>
            <div style={{ display: 'flex', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
              <label className="check">
                <input type="radio" checked={rs.modo === 'atualizar'} onChange={() => set('modo', 'atualizar')} /> Atualizar o existente (mantém as compras já lançadas)
              </label>
              <label className="check">
                <input type="radio" checked={rs.modo === 'novo'} onChange={() => set('modo', 'novo')} /> Salvar como um novo orçamento
              </label>
            </div>
          </div>
        )}
        <div className="grade">
          <Campo rotulo="Cliente" dica={clienteNovo ? 'será criado' : undefined}>
            <select value={rs.clienteRef} onChange={(e) => set('clienteRef', e.target.value)}>
              {clienteNovo && <option value={rs.clienteRef}>Novo cliente: {rs.clienteRef.slice(5) || '(sem nome)'}</option>}
              {dados.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          {clienteNovo && (
            <Campo rotulo="Nome do novo cliente">
              <input value={rs.clienteRef.slice(5)} onChange={(e) => set('clienteRef', 'novo:' + e.target.value)} />
            </Campo>
          )}
          <Campo rotulo="PO / OP">
            <input value={rs.po} onChange={(e) => set('po', e.target.value.trim())} />
          </Campo>
          <Campo rotulo="Nome do orçamento" className="largo">
            <input value={rs.nome} onChange={(e) => set('nome', e.target.value)} />
          </Campo>
          <Campo rotulo="Revisão">
            <input value={rs.revisao} onChange={(e) => set('revisao', e.target.value)} />
          </Campo>
          <Campo rotulo="Status">
            <select value={rs.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_ORC.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Comercial">
            <input value={rs.comercial} onChange={(e) => set('comercial', e.target.value)} />
          </Campo>
          <Campo rotulo="Elaborado por">
            <input value={rs.elaboradoPor} onChange={(e) => set('elaboradoPor', e.target.value)} />
          </Campo>
          <Campo rotulo="Data da proposta">
            <input type="date" value={rs.data} onChange={(e) => set('data', e.target.value)} />
          </Campo>
          <Campo rotulo="Vencimento">
            <input type="date" value={rs.vencimento} onChange={(e) => set('vencimento', e.target.value)} />
          </Campo>
          <Campo rotulo="UF origem">
            <input value={rs.ufOrigem} maxLength={2} onChange={(e) => set('ufOrigem', e.target.value.toUpperCase())} />
          </Campo>
          <Campo rotulo="UF destino">
            <input value={rs.ufDestino} maxLength={2} onChange={(e) => set('ufDestino', e.target.value.toUpperCase())} />
          </Campo>
        </div>
      </section>

      <section className="bloco">
        <div className="bloco-cab">
          <div>
            <h2>Local da obra</h2>
            <p>Cria o local vinculado a esta PO para acompanhar status, equipe e materiais.</p>
          </div>
        </div>
        {localExistente ? (
          <p style={{ margin: 0 }}>
            O local <strong>{localExistente.nome}</strong> já existe nesta PO e será mantido como está.
          </p>
        ) : (
          <>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={rs.criarLocal} onChange={(e) => set('criarLocal', e.target.checked)} /> Criar local vinculado
            </label>
            {rs.criarLocal && (
              <div className="grade">
                <Campo rotulo="Nome do local">
                  <input value={rs.local.nome} onChange={(e) => setLocal('nome', e.target.value)} />
                </Campo>
                <Campo rotulo="UF">
                  <input value={rs.local.uf} maxLength={2} onChange={(e) => setLocal('uf', e.target.value.toUpperCase())} />
                </Campo>
                <Campo rotulo="Região">
                  <input list="regioes-imp" value={rs.local.regiao} onChange={(e) => setLocal('regiao', e.target.value)} />
                  <datalist id="regioes-imp">
                    {regioes.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </Campo>
                <Campo rotulo="Endereço" className="largo">
                  <input value={rs.local.endereco} onChange={(e) => setLocal('endereco', e.target.value)} />
                </Campo>
              </div>
            )}
          </>
        )}
      </section>

      <section className="bloco">
        <div className="bloco-cab">
          <div>
            <h2>Itens lidos</h2>
            <p>Corrija o que precisar. Códigos "A Cadastrar" ficam em branco para você preencher.</p>
          </div>
        </div>
        <ItensTabela itens={rs.itens} compras={false} onChange={(itens) => set('itens', itens)} />
      </section>

      <div className="salvar-barra">
        <span>
          {rs.itens.length} itens, {moeda(total)}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={aoDescartar}>Descartar arquivo</button>
          <button className="primario" onClick={confirmar} disabled={salvando}>
            <Icone nome="importar" /> {salvando ? 'Salvando…' : rs.modo === 'atualizar' && dup ? 'Atualizar orçamento' : 'Salvar orçamento'}
          </button>
        </div>
      </div>
    </>
  );
}
