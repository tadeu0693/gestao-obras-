// Classifica as linhas do histórico de compras do SAP (Rastreamento SC) em:
//   'terceiro' — serviço de terceiro / mão de obra contratada (soma no custo de M.O da PO)
//   'frete'    — frete e transporte (só informativo, NÃO entra no total de M.O)
//
// A classificação usa padrões embutidos na descrição e as regras cadastradas em
// Configurações: { grupo: 'terceiro' | 'frete', tipo: 'codigo' | 'termo' | 'excecao', valor }.
// Regras antigas sem `grupo` valem como 'terceiro'.

const PADROES = {
  terceiro: [/TERCEIR/, /MAO\s*DE\s*OBRA/, /MAO-DE-OBRA/, /EMPREITEIR/, /SUBCONTRAT/],
  frete: [/FRETE/, /TRANSPORTADOR/],
};

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

const grupoDaRegra = (r) => (r.grupo === 'frete' ? 'frete' : 'terceiro');

// Retorna 'frete', 'terceiro' ou null. Frete tem precedência sobre terceiro.
export function classificarLinha(linha, regras) {
  const codigo = String(linha.codigo ?? '').trim();
  const desc = norm(linha.descricao);
  const lista = regras || [];

  const bate = (grupo) => {
    for (const r of lista) {
      const v = String(r.valor ?? '').trim();
      if (!v || grupoDaRegra(r) !== grupo) continue;
      if (r.tipo === 'excecao' && codigo && codigo === v) return false;
    }
    for (const r of lista) {
      const v = String(r.valor ?? '').trim();
      if (!v || grupoDaRegra(r) !== grupo) continue;
      if (r.tipo === 'codigo' && codigo && codigo === v) return true;
      if (r.tipo === 'termo' && desc.includes(norm(v))) return true;
    }
    return PADROES[grupo].some((p) => p.test(desc));
  };

  if (bate('frete')) return 'frete';
  if (bate('terceiro')) return 'terceiro';
  return null;
}

export const linhaEhTerceiro = (linha, regras) => classificarLinha(linha, regras) === 'terceiro';
export const linhaEhFrete = (linha, regras) => classificarLinha(linha, regras) === 'frete';

export const valorLinha = (l) => Number(l.total) || (Number(l.qtd) || 0) * (Number(l.preco) || 0);

// Soma por PO. `codigosMateriais` = { [po]: Set de códigos que já existem como item
// não-M.O do orçamento daquela PO — esses já foram baixados pela Importação SAP e
// não podem ser contados de novo aqui.
// Retorna { [po]: { terceiros: {total, linhas}, fretes: {total, linhas} } }
export function comprasPorPo(rastreamento, regras, codigosMateriais = {}) {
  const out = {};
  for (const l of rastreamento || []) {
    const po = extrairPo(l.projeto);
    if (!po) continue;
    const classe = classificarLinha(l, regras);
    if (!classe) continue;
    const codigo = String(l.codigo ?? '').trim();
    if (codigo && codigosMateriais[po]?.has(codigo)) continue;
    const valor = valorLinha(l);
    if (!valor) continue;
    if (!out[po]) out[po] = { terceiros: { total: 0, linhas: [] }, fretes: { total: 0, linhas: [] } };
    const alvo = classe === 'frete' ? out[po].fretes : out[po].terceiros;
    alvo.total += valor;
    alvo.linhas.push({ sc: l.solicitacao, pedido: l.pedido, codigo, descricao: l.descricao, data: l.data, valor });
  }
  return out;
}
