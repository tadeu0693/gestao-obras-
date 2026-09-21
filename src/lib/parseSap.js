// Lê o relatório "Integrados" do SAP (Solicitação -> Pedido -> Recebimento -> NF Entrada)
// e consolida, por Projeto + Código do item, a quantidade total comprada, o preço e a
// data mais recente — pronto para atualizar os itens dos orçamentos.
import * as XLSX from 'xlsx';

// Posições fixas da nova estrutura do relatório
const COL = {
  projeto: 0,
  nomeProjeto: 1,
  solicitacao: 4,
  solicitante: 7, // "Usuário Solicitação"
  codigoItem: 9,
  descricaoItem: 10,
  qtdSolic: 11,
  precoSolic: 12,
  statusSolic: 13,
  pedido: 14,
  dataPedido: 15,
  usuarioPedido: 18,
  codigoPedido: 19,
  descricaoPedido: 20,
  qtdPedido: 21,
  precoPedido: 22,
  statusPedido: 23,
  statusReceb: 29,
  statusNf: 36,
};

const CABECALHO_ESPERADO = {
  0: 'Projeto',
  4: 'Solicitação',
  14: 'Pedido',
  19: 'Codigo Item Pedido',
  21: 'Quantidade Pedido',
  22: 'Preço Unitário Pedido',
};

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const toISO = (v) => {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return '';
};

// aoa = array-de-arrays (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }))
//
// O relatório do SAP só preenche a coluna "Projeto" na primeira linha de cada grupo
// (célula mesclada visualmente), deixando as linhas seguintes em branco. A mesclagem
// do Excel, porém, não é confiável — em alguns relatórios ela "gruda" linhas de
// Solicitações (SC) diferentes num mesmo bloco visual sem relação real de projeto.
// Por isso a associação usa a própria SC: cada Solicitação pertence a exatamente um
// projeto, então mapeamos SC -> Projeto (usando a primeira linha daquela SC que traga
// o Projeto preenchido, em qualquer ponto da planilha) e aplicamos isso a todas as
// linhas da mesma SC. Se a SC nunca tiver o Projeto preenchido, fica vazia — nunca
// herda o projeto de outra SC.
export function parseSapCompras(aoa, { ano = null, excluirSolicitacoes = [4059] } = {}) {
  const avisos = [];
  const header = aoa[0] || [];
  for (const [i, nomeEsperado] of Object.entries(CABECALHO_ESPERADO)) {
    if (norm(header[i]) !== norm(nomeEsperado)) {
      avisos.push(`Coluna ${Number(i) + 1}: esperava "${nomeEsperado}", veio "${header[i] ?? '(vazio)'}" — confira se o modelo do relatório mudou.`);
    }
  }

  // 1ª passada: mapeia SC -> Projeto usando qualquer linha daquela SC com Projeto preenchido.
  const projetoPorSc = new Map();
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row.length) continue;
    const sc = row[COL.solicitacao];
    if (sc == null || sc === '' || !row[COL.projeto]) continue;
    const scKey = String(sc).trim();
    if (!projetoPorSc.has(scKey)) {
      projetoPorSc.set(scKey, { projeto: String(row[COL.projeto]).trim(), nomeProjeto: row[COL.nomeProjeto] || '' });
    }
  }

  const linhas = [];
  let descartadasCanceladas = 0;
  let descartadasSemPedido = 0;
  let descartadasExcluidas = 0;
  let descartadasAno = 0;

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row.length) continue;
    const scKey = row[COL.solicitacao] != null ? String(row[COL.solicitacao]).trim() : '';
    const infoProjeto = scKey ? projetoPorSc.get(scKey) : null;
    const projetoAtual = row[COL.projeto] ? String(row[COL.projeto]).trim() : infoProjeto?.projeto || '';
    const nomeAtual = row[COL.projeto] ? row[COL.nomeProjeto] || '' : infoProjeto?.nomeProjeto || '';
    const pedido = row[COL.pedido];
    const solicitacao = row[COL.solicitacao];
    if (!pedido) {
      descartadasSemPedido++;
      continue;
    }
    if (excluirSolicitacoes.map(Number).includes(Number(solicitacao))) {
      descartadasExcluidas++;
      continue;
    }
    const statusCancelado = [row[COL.statusSolic], row[COL.statusPedido], row[COL.statusReceb], row[COL.statusNf]].some((s) => norm(s) === 'CANCELADO');
    if (statusCancelado) {
      descartadasCanceladas++;
      continue;
    }
    const dataPedido = toISO(row[COL.dataPedido]);
    if (ano && dataPedido && dataPedido.slice(0, 4) !== String(ano)) {
      descartadasAno++;
      continue;
    }
    const codigo = row[COL.codigoPedido] != null ? String(row[COL.codigoPedido]).trim() : '';
    linhas.push({
      projeto: projetoAtual,
      nomeProjeto: nomeAtual,
      solicitacao,
      solicitante: row[COL.solicitante] || '',
      codigo,
      descricao: row[COL.descricaoItem] || '',
      qtd: Number(row[COL.qtdPedido]) || 0,
      preco: Number(row[COL.precoPedido]) || 0,
      data: dataPedido,
      pedido: row[COL.pedido],
    });
  }

  // Consolida por Projeto + Código: soma toda a quantidade comprada até agora
  // (isso já cobre compras parceladas — várias linhas da mesma solicitação/código).
  // Rastreia também SC e Pedido para auditoria de origem das compras.
  const grupos = new Map();
  for (const l of linhas) {
    if (!l.codigo) continue; // sem código de item (ex.: frete/serviço genérico) -> não casa com nenhum item
    const k = `${l.projeto}\u0000${l.codigo}`;
    if (!grupos.has(k)) grupos.set(k, { projeto: l.projeto, nomeProjeto: l.nomeProjeto, codigo: l.codigo, descricao: l.descricao, qtd: 0, valorQtd: 0, data: '', scNumeros: new Set(), pedidosNumeros: new Set() });
    const g = grupos.get(k);
    g.qtd += l.qtd;
    g.valorQtd += l.qtd * l.preco;
    if (l.data && l.data > g.data) g.data = l.data;
    if (l.solicitacao) g.scNumeros.add(String(l.solicitacao).trim());
    if (l.pedido) g.pedidosNumeros.add(String(l.pedido).trim());
  }

  const consolidado = [...grupos.values()].map((g) => ({
    ...g,
    preco: g.qtd ? g.valorQtd / g.qtd : 0,
    scNumeros: [...g.scNumeros].sort().join(', '),
    pedidosNumeros: [...g.pedidosNumeros].sort().join(', '),
  }));

  // Linhas sem código (frete, serviços de terceiros etc.) — não dá pra casar automaticamente
  const semCodigo = linhas.filter((l) => !l.codigo);

  return {
    consolidado,
    semCodigo,
    avisos,
    historico: linhas, // Cada linha individual com SC, pedido, solicitante, data, qtd, preco
    resumo: {
      linhasLidas: aoa.length - 1,
      linhasValidas: linhas.length,
      descartadasCanceladas,
      descartadasSemPedido,
      descartadasExcluidas,
      descartadasAno,
    },
  };
}

// Extrai só o número da PO de um texto de projeto, ignorando qualquer coisa
// antes ou depois (ex: "PO7634 - Gerdau Pinda" -> "7634").
const extrairPo = (texto) => {
  const m = String(texto || '').match(/PO\s*0*([0-9]{3,})/i);
  return m ? m[1] : String(texto || '').trim();
};

// Casa o consolidado do SAP com os orçamentos já existentes no sistema.
// Retorna { atualizacoes: [{orcamentoId, po, itemId, descricao, qtdAntes, qtdNova, ...}], naoCasados: [...] }
export function casarComOrcamentos(consolidado, orcamentos) {
  const atualizacoes = [];
  const naoCasados = [];

  for (const g of consolidado) {
    const poAlvo = extrairPo(g.projeto);
    const orcs = orcamentos.filter((o) => String(o.po || '').trim() === poAlvo);
    let achou = false;
    for (const o of orcs) {
      const item = (o.itens || []).find((i) => String(i.codigo || '').trim() === g.codigo);
      if (item) {
        atualizacoes.push({
          orcamentoId: o.id,
          orcamentoNome: o.nome,
          po: o.po,
          itemId: item.id,
          codigo: g.codigo,
          descricao: item.descricao || g.descricao,
          qtdAntes: Number(item.qtdComprada) || 0,
          qtdNova: g.qtd,
          precoAntes: Number(item.valorUnitPago) || 0,
          precoNovo: g.preco,
          dataNova: g.data,
          scNumeros: g.scNumeros,
          pedidosNumeros: g.pedidosNumeros,
        });
        achou = true;
        break;
      }
    }
    if (!achou) naoCasados.push(g);
  }

  return { atualizacoes, naoCasados };
}
