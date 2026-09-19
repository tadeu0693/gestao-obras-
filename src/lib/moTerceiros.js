// Identifica, no histórico de compras do SAP (Rastreamento SC), as linhas que são
// serviço de terceiro / mão de obra contratada, para somar no custo de M.O da PO.
//
// Regra: bate por padrão embutido na descrição, por código cadastrado em Configurações,
// ou por termo cadastrado. Códigos marcados como exceção nunca entram.

const PADROES = [/TERCEIR/, /MAO\s*DE\s*OBRA/, /MAO-DE-OBRA/, /EMPREITEIR/, /SUBCONTRAT/];

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

export const extrairPo = (texto) => {
  const m = String(texto || '').match(/PO\s*0*([0-9]{3,})/i);
  return m ? m[1] : null;
};

export function linhaEhTerceiro(linha, regras) {
  const codigo = String(linha.codigo ?? '').trim();
  const desc = norm(linha.descricao);
  for (const r of regras || []) {
    const v = String(r.valor ?? '').trim();
    if (!v) continue;
    if (r.tipo === 'excecao' && codigo && codigo === v) return false;
  }
  for (const r of regras || []) {
    const v = String(r.valor ?? '').trim();
    if (!v) continue;
    if (r.tipo === 'codigo' && codigo && codigo === v) return true;
    if (r.tipo === 'termo' && desc.includes(norm(v))) return true;
  }
  return PADROES.some((p) => p.test(desc));
}

export const valorLinha = (l) => Number(l.total) || (Number(l.qtd) || 0) * (Number(l.preco) || 0);

// Soma por PO. `codigosMateriais` = { [po]: Set de códigos que já existem como item
// não-M.O do orçamento daquela PO — esses já foram baixados pela Importação SAP e
// não podem ser contados de novo aqui.
export function terceirosPorPo(rastreamento, regras, codigosMateriais = {}) {
  const out = {};
  for (const l of rastreamento || []) {
    const po = extrairPo(l.projeto);
    if (!po) continue;
    if (!linhaEhTerceiro(l, regras)) continue;
    const codigo = String(l.codigo ?? '').trim();
    if (codigo && codigosMateriais[po]?.has(codigo)) continue;
    const valor = valorLinha(l);
    if (!valor) continue;
    if (!out[po]) out[po] = { total: 0, linhas: [] };
    out[po].total += valor;
    out[po].linhas.push({ sc: l.solicitacao, pedido: l.pedido, codigo, descricao: l.descricao, data: l.data, valor });
  }
  return out;
}
