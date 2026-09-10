import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseWorkbook } from '../src/lib/parseProposta.js';
const dir = (process.argv[2] || './propostas').replace(/\/?$/, '/');
for (const f of fs.readdirSync(dir).filter(f=>/\.(xlsx|xlsm)$/i.test(f))) {
  const wb = XLSX.read(fs.readFileSync(dir+f), {type:'buffer', cellDates:true});
  const r = parseWorkbook(wb, f);
  const o=r.orcamento;
  const sum=o.itens.reduce((s,i)=>s+i.qtd*i.custoUnit,0);
  console.log(f, '\n', JSON.stringify({...o, itens:o.itens.length}), '\n local:', r.localSugerido, '\n soma', sum.toFixed(2), 'rob', o.itens.reduce((s,i)=>s+i.rob,0).toFixed(2), '\n warns', r.warnings);
  console.log(o.itens.map(i=>`${i.grupo}|${i.categoria}|${i.codigo}|${i.descricao.slice(0,30)}|${i.unidade}|${i.qtd}|${i.custoUnit.toFixed(2)}`).join('\n'));
}
