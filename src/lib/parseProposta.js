// Lê uma planilha de orçamento/proposta (ex.: "Plan. Custo" da GITEL) e devolve
// um rascunho de orçamento para revisão. Recebe um workbook do SheetJS.
import * as XLSX from 'xlsx';

export const GRUPOS = {
  1: 'Equipamentos',
  2: 'Infra_rede',
  3: 'Infra_seca',
  4: 'Kit_QDV',
  5: 'Software',
  6: 'Projeto',
  7: 'M.O',
  8: 'Despesa_operacional',
};

export const CATEGORIAS = ['Eletrônico', 'M.O', 'Miscelâneas'];

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const num = (v) => {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const toISODate = (v) => {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const iso = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : '';
};

const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/(^|\s|-|\/)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

function sheetToGrid(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

function findHeaderRow(grid) {
  for (let r = 0; r < Math.min(grid.length, 80); r++) {
    const cells = (grid[r] || []).map(norm);
    const hasDesc = cells.some((c) => c.startsWith('descri'));
    const hasQtd = cells.some((c) => c.startsWith('quant') || c.startsWith('qtd') || c === 'qtde');
    if (hasDesc && hasQtd) return r;
  }
  return -1;
}

function pickSheet(wb) {
  const byName = wb.SheetNames.find((n) => /plan\.?\s*custo/i.test(n));
  if (byName) return byName;
  // Formato da planilha de controle (abas "OP xxxx - ...")
  const op = wb.SheetNames.find((n) => /^OP\s*\d+/i.test(n));
  if (op) return op;
  // Qualquer aba com cabeçalho de itens
  let best = null;
  let bestCount = 0;
  for (const n of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[n]);
    const h = findHeaderRow(grid);
    if (h >= 0 && grid.length - h > bestCount) {
      best = n;
      bestCount = grid.length - h;
    }
  }
  return best;
}

// Rótulos de cabeçalho → chave. O valor fica na próxima célula preenchida à direita.
const LABELS = [
  ['tipo de projeto', 'tipo'],
  ['nome projeto', 'nome'],
  ['nome do projeto', 'nome'],
  ['cliente', 'cliente'],
  ['comercial', 'comercial'],
  ['elaborado por', 'elaboradoPor'],
  ['data', 'data'],
  ['validade', 'validade'],
  ['vencimento', 'vencimento'],
  ['uf de origem', 'ufOrigem'],
  ['uf de destino', 'ufDestino'],
  ['atualizada', 'atualizadaEm'],
];

function readHeaderInfo(grid, headerRow) {
  const info = {};
  const limit = headerRow > 0 ? headerRow : Math.min(grid.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      const label = norm(row[c]).replace(/:$/, '').trim();
      if (!label) continue;
      const hit = LABELS.find(([l]) => label === l);
      if (hit && info[hit[1]] === undefined) {
        for (let k = c + 1; k < Math.min(row.length, c + 6); k++) {
          const v = row[k];
          if (v !== null && v !== '' && !(typeof v === 'string' && v.trim().endsWith(':'))) {
            info[hit[1]] = v;
            break;
          }
        }
      }
      if (label === 'custo bruto total' && grid[r + 1]) info.custoBrutoArquivo = num(grid[r + 1][c]);
      if (label === 'rob total' && grid[r + 1]) info.robArquivo = num(grid[r + 1][c]);
    }
  }
  return info;
}

function mapColumns(headerCells) {
  const cols = {};
  headerCells.forEach((raw, i) => {
    const h = norm(raw);
    if (!h) return;
    const set = (k) => {
      if (cols[k] === undefined) cols[k] = i;
    };
    if (h === 'grupo') set('grupo');
    else if (h.startsWith('classifica')) set('classificacao');
    else if (h === 'categoria') set('categoria');
    else if (h.startsWith('cod')) set('codigo');
    else if (h.startsWith('compra')) set('compra');
    else if (h.startsWith('descri')) set('descricao');
    else if (h.startsWith('unid') || h === 'un' || h === 'un.') set('unidade');
    else if (h === 'marca') set('marca');
    else if (h === 'modelo') set('modelo');
    else if (h.startsWith('quant') || h === 'qtd orcada' || h === 'qtd' || h === 'qtde') set('qtd');
    else if (h.startsWith('custo unit')) set('custoUnit');
    else if (h === 'uf/compra') set('ufCompra');
    else if (h === 'custo total bruto' || h.startsWith('custo total (r$)') || h === 'custo total') set('custoTotal');
    else if (h === 'rob') set('rob');
    else if (h === 'qtd comprada') set('qtdComprada');
    else if (h === 'data da compra') set('dataCompra');
    else if (h.startsWith('valor unit pago')) set('valorUnitPago');
  });
  return cols;
}

export function categoriaDoGrupo(grupo) {
  if (grupo === 'M.O') return 'M.O';
  if (grupo === 'Despesa_operacional' || grupo === 'Infra_rede' || grupo === 'Infra_seca') return 'Miscelâneas';
  return 'Eletrônico';
}

function detectGrupo(rawGrupo, classificacao, descricao) {
  const d = norm(descricao);
  if (/^m\.?\s?o\b|mao de obra|mão de obra/.test(d) || d.startsWith('m.o')) return 'M.O';
  if (d.startsWith('miscel') || d.includes('materiais de fixacao')) return 'Despesa_operacional';
  const n = parseInt(rawGrupo, 10);
  if (GRUPOS[n]) return GRUPOS[n];
  const c = String(classificacao || rawGrupo || '').trim();
  const found = Object.values(GRUPOS).find((g) => norm(g) === norm(c));
  if (found) return found;
  if (norm(c).startsWith('equipamento')) return 'Equipamentos';
  return c || 'Equipamentos';
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function parseWorkbook(wb, fileName = '') {
  const warnings = [];
  const sheetName = pickSheet(wb);
  if (!sheetName) {
    return { ok: false, error: 'Não encontrei nenhuma aba com lista de itens (colunas de descrição e quantidade).' };
  }
  const grid = sheetToGrid(wb.Sheets[sheetName]);
  const headerRow = findHeaderRow(grid);
  if (headerRow < 0) {
    return { ok: false, error: `A aba "${sheetName}" não tem cabeçalho com descrição e quantidade.` };
  }
  const info = readHeaderInfo(grid, headerRow);
  const cols = mapColumns(grid[headerRow]);

  const itens = [];
  let blankStreak = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const desc = cols.descricao !== undefined ? row[cols.descricao] : null;
    const descStr = desc === null || desc === undefined ? '' : String(desc).trim();
    const joined = norm(row.slice(0, 8).join(' '));
    if (/total geral|total da obra/.test(joined) || norm(row[cols.grupo]) === 'total') break;
    if (!descStr || descStr === '-') {
      blankStreak++;
      if (blankStreak > 40) break;
      continue;
    }
    blankStreak = 0;
    const qtd = num(row[cols.qtd]);
    const custoUnit = num(row[cols.custoUnit]);
    let custoTotal = cols.custoTotal !== undefined ? num(row[cols.custoTotal]) : 0;
    if (!custoTotal) custoTotal = qtd * custoUnit;
    if (!qtd && !custoTotal) continue;
    const grupo = detectGrupo(
      cols.grupo !== undefined ? row[cols.grupo] : null,
      cols.classificacao !== undefined ? row[cols.classificacao] : null,
      descStr,
    );
    const codigoRaw = cols.codigo !== undefined ? row[cols.codigo] : '';
    const codigo = codigoRaw === null ? '' : String(codigoRaw).trim();
    const categoriaArq = cols.categoria !== undefined ? String(row[cols.categoria] || '').trim() : '';
    const qtdComprada = cols.qtdComprada !== undefined ? num(row[cols.qtdComprada]) : 0;
    const valorUnitPago = cols.valorUnitPago !== undefined ? num(row[cols.valorUnitPago]) : 0;
    itens.push({
      id: uid(),
      grupo,
      categoria: CATEGORIAS.includes(categoriaArq) ? categoriaArq : categoriaDoGrupo(grupo),
      codigo: /^a cadastrar$/i.test(codigo) ? '' : codigo,
      descricao: descStr.replace(/\s+/g, ' '),
      unidade: cols.unidade !== undefined ? String(row[cols.unidade] ?? '').replace(/^0$/, '').trim() : '',
      marca: cols.marca !== undefined ? String(row[cols.marca] ?? '').replace(/^\*$/, '').trim() : '',
      modelo: cols.modelo !== undefined ? String(row[cols.modelo] ?? '').replace(/^\*$/, '').trim() : '',
      qtd,
      custoUnit: custoUnit || (qtd ? custoTotal / qtd : 0),
      rob: cols.rob !== undefined ? num(row[cols.rob]) : 0,
      qtdComprada,
      dataCompra: cols.dataCompra !== undefined ? toISODate(row[cols.dataCompra]) : '',
      valorUnitPago,
    });
  }

  if (!itens.length) warnings.push('Nenhum item com quantidade foi encontrado. Confira se é o arquivo certo.');

  const custoItens = itens.reduce((s, i) => s + i.qtd * i.custoUnit, 0);
  const robItens = itens.reduce((s, i) => s + (i.rob || 0), 0);
  if (info.custoBrutoArquivo && Math.abs(custoItens - info.custoBrutoArquivo) > Math.max(1, info.custoBrutoArquivo * 0.005)) {
    warnings.push(
      `A soma dos itens (${custoItens.toFixed(2)}) difere do "Custo Bruto Total" do arquivo (${info.custoBrutoArquivo.toFixed(2)}). Pode haver frete ou itens ocultos.`,
    );
  }
  const semCodigo = itens.filter((i) => !i.codigo && i.categoria === 'Eletrônico').length;
  if (semCodigo) warnings.push(`${semCodigo} item(ns) sem código cadastrado ("A Cadastrar"). Preencha o código para cruzar com levantamento e estoque.`);
  const semCusto = itens.filter((i) => !i.custoUnit).length;
  if (semCusto) warnings.push(`${semCusto} item(ns) sem custo unitário.`);

  // Metadados vindos do nome do arquivo
  const base = fileName.replace(/\.[^.]+$/, '');
  const po = (base.match(/OP[\s_-]*(\d{3,})/i) || [])[1] || (String(info.nome || '').match(/OP[\s_-]*(\d{3,})/i) || [])[1] || '';
  const revisao = (base.match(/Rev[\s_-]*(\d+)/i) || [])[1] || '';
  const nome = String(info.nome || '').trim() || base.replace(/_/g, ' ');
  if (!po) warnings.push('Número da OP/PO não encontrado no nome do arquivo. Preencha manualmente.');

  // Sugestão de local: texto após "ADITIVO" ou após o último " - "
  let localSug = '';
  const m = nome.match(/aditivo\s+(.+)$/i);
  if (m) localSug = m[1];
  else if (nome.includes(' - ')) localSug = nome.split(' - ').pop();
  localSug = titleCase(localSug.trim());

  return {
    ok: true,
    sheetName,
    warnings,
    orcamento: {
      nome,
      po,
      revisao,
      clienteNome: String(info.cliente || '').trim(),
      tipo: String(info.tipo || '').trim(),
      comercial: String(info.comercial || '').trim(),
      elaboradoPor: String(info.elaboradoPor || '').trim(),
      data: toISODate(info.data),
      validade: String(info.validade || '').trim(),
      vencimento: toISODate(info.vencimento),
      ufOrigem: String(info.ufOrigem || '').trim(),
      ufDestino: String(info.ufDestino || '').trim(),
      custoBrutoArquivo: info.custoBrutoArquivo || 0,
      robArquivo: info.robArquivo || robItens || 0,
      arquivoOrigem: fileName,
      itens,
    },
    localSugerido: localSug,
  };
}

export async function parseFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, bookVBA: false });
  return parseWorkbook(wb, file.name);
}
