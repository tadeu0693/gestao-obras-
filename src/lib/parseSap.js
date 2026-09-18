// Lê o relatório "Integrados" do SAP (Solicitação -> Pedido -> Recebimento -> NF Entrada)
// e consolida, por Projeto + Código do item, a quantidade total comprada, o preço e a
// data mais recente — pronto para atualizar os itens dos orçamentos.
import * as XLSX from 'xlsx';

// Posições fixas do relatório (o cabeçalho repete nomes como "Data do Lançamento" e
// "Adicionado/Aprovado" em cada seção, então usamos posição em vez de nome).
const COL = {
  projeto: 0,
  nomeProjeto: 1,
  solicitacao: 4,
  codigoItem: 9,
  descricaoItem: 10,
  statusSolic: 13,
  pedido: 14,
  dataPedido: 15,
  codigoPedido: 19,
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
export function parseSapCompras(aoa, { ano = null, excluirSolicitacoes = [4059] } = {}) {
  const avisos = [];
  const header = aoa[0] || [];
  for (const [i, nomeEsperado] of Object.entries(CABECALHO_ESPERADO)) {
    if (norm(header[i]) !== norm(nomeEsperado)) {
      avisos.push(`Coluna ${Number(i) + 1}: esperava "${nomeEsperado}", veio "${header[i] ?? '(vazio)'}" — confira se o modelo do relatório mudou.`);
    }
  }

  let ultimoProjeto = '';
  let ultimoNome = '';
  const linhas = [];
  let descartadasCanceladas = 0;
  let descartadasSemPedido = 0;
  let descartadasExcluidas = 0;
  let descartadasAno = 0;

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row.length) continue;
    if (row[COL.projeto]) {
      ultimoProjeto = String(row[COL.projeto]).trim();
      ultimoNome = row[COL.nomeProjeto] || '';
    }
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
      projeto: ultimoProjeto,
      nomeProjeto: ultimoNome,
      solicitacao,
      codigo,
      descricao: row[COL.descricaoItem] || '',
      qtd: Number(row[COL.qtdPedido]) || 0,
      preco: Number(row[COL.precoPedido]) || 0,
      data: dataPedido,
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
