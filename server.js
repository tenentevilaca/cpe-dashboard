const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

async function lerAbaBruta(sheetId, nomeAba) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nomeAba)}`;
    const res = await axios.get(url, { timeout: 20000 });
    const linhas = res.data.split(/\r?\n/).map(l => parseCSVLine(l));
    console.log(`✓ ${nomeAba}: ${linhas.length} linhas`);
    return linhas;
  } catch (e) {
    console.error(`✗ ${nomeAba}:`, e.message);
    return [];
  }
}

function num(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/R\$/g, '').replace(/\s/g, '').replace(/\u00a0/g, '');
  if (s === '' || s === '-') return 0;
  const tv = s.includes(','), tp = s.includes('.');
  if (tv && tp) s = s.replace(/\./g, '').replace(',', '.');
  else if (tv) s = s.replace(',', '.');
  const n = parseFloat(s);
  return (isNaN(n) || Math.abs(n) < 0.001) ? 0 : n;
}

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function calcularDias(dataFim) {
  if (!dataFim) return null;
  const dataStr = String(dataFim).trim().split(' ')[0].split('T')[0];
  if (!dataStr || dataStr === '-') return null;
  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
}

// PROGRAMAÇÃO: header em idx 0, dados em idx 1+, meses em cols 8-19 (JANEIRO-DEZEMBRO)
function parsePrograma(linhas, fonte) {
  const hdr = linhas[0] || [];
  const colMes = {}, col = {};
  
  // Encontrar colunas
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H.includes(m)) colMes[m] = i; });
    if (H.includes('DESCRI')) col.desc = i;
    if (H.includes('ELEM')) col.elem = i;
    if (H === 'TOTAL PT') col.soma = i;
  });

  // Se não encontrou os meses pelo nome, usa índices fixos (8-19 é JANEIRO-DEZEMBRO)
  if (Object.keys(colMes).length === 0) {
    MESES.forEach((m, idx) => { colMes[m] = 8 + idx; });
  }

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {};
  MESES.forEach(m => planejMensal[m] = 0);

  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length < 8) continue;
    const desc = col.desc !== undefined ? String(r[col.desc] || '').trim() : '';
    const elem = col.elem !== undefined ? String(r[col.elem] || '').trim() : '';
    if (!desc || !elem || desc.toUpperCase().includes('TOTAL') || desc.includes('R$')) continue;

    const meses = {};
    let somaItem = 0;
    MESES.forEach(m => {
      const val = colMes[m] !== undefined ? num(r[colMes[m]]) : 0;
      meses[m] = val;
      somaItem += val;
      planejMensal[m] += val;
    });
    if (somaItem === 0 && col.soma !== undefined) somaItem = num(r[col.soma]);
    if (somaItem > 0) {
      totalPlanejado += somaItem;
      const elemNum = String(elem).split('.')[0].split('-')[0].trim();
      itens.push({ elemento: elemNum, descricao: desc, fonte, meses, soma: somaItem });
    }
  }
  console.log(`  ${fonte}: ${itens.length} itens, total R$${totalPlanejado}`);
  return { fonte, itens, totalPlanejado, planejMensal };
}

// SUPERAVIT: usa mesma lógica (header em 0)
function parseSuperavit(linhas) {
  return parsePrograma(linhas, 'DPRF');
}

// CONTRATOS: header em idx 0, dados em idx 1+
function parseContratos(linhas) {
  const hdr = linhas[0] || [];
  const col = {};
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    if (H === 'ELEMENTO') col.elem = i;
    if (H === 'PROCESSO') col.proc = i;
    if (H.includes('EMPRESA')) col.emp = i;
    if (H === 'OBJETO') col.obj = i;
    if (H.includes('FIM DA VIG')) col.fim = i;
    if (H.includes('FIM (DIAS)')) col.dias = i;
    if (H.includes('VALOR TOTAL')) col.vtotal = i;
    if (H.includes('EMPENHADO') && !H.includes('A EMPENHAR')) col.vemp = i;
    if (H.includes('SALDO DE EMPENHO')) col.saldo = i;
    if (H.includes('A EMPENHAR')) col.aemp = i;
  });

  const contratos = [];
  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length < 10) continue;
    const emp = col.emp !== undefined ? String(r[col.emp] || '').trim() : '';
    if (!emp) continue;
    const vt = num(r[col.vtotal]);
    if (vt === 0) continue;

    let dias = null;
    if (col.fim !== undefined) dias = calcularDias(r[col.fim]);
    if (dias === null && col.dias !== undefined) {
      const d = num(r[col.dias]);
      if (d !== 0) dias = Math.ceil(d);
    }

    contratos.push({
      elemento: String(r[col.elem] || '').split('.')[0].trim(),
      processo: String(r[col.proc] || '').trim(),
      empresa: emp,
      objeto: String(r[col.obj] || '').trim(),
      fimVigencia: String(r[col.fim] || '').trim(),
      dias,
      valorTotal: vt,
      empenhado: num(r[col.vemp]),
      saldoEmpenho: num(r[col.saldo]),
      aEmpenhar: num(r[col.aemp])
    });
  }
  console.log(`  Contratos: ${contratos.length}`);
  return contratos;
}

// CONTROLE: valores em idx 1, colunas B-J (idx 1-9)
function parseControle(linhas) {
  const r = linhas[1] || [];
  return {
    DPRF: { previsto: num(r[1]), recebido: num(r[2]), diferenca: num(r[3]) },
    DER: { previsto: num(r[4]), recebido: num(r[5]), diferenca: num(r[6]) },
    SEMAD: { previsto: num(r[7]), recebido: num(r[8]), diferenca: num(r[9]) }
  };
}

// RESUMO: saldos em idx 1, colunas E,J,O (idx 4,9,14)
function parseResumoRepasses(linhas) {
  const r = linhas[1] || [];
  return {
    saldos: {
      DPRF: num(r[4]),
      DER: num(r[9]),
      SEMAD: num(r[14])
    },
    porElemento: {
      DPRF: { '30': 0, '37': 0, '39': 0, '40': 0 },
      DER: { '30': 0, '37': 0, '39': 0, '40': 0 },
      SEMAD: { '30': 0, '37': 0, '39': 0 }
    }
  };
}

// CONDENSADO: totais em linha com "TOTAL DESCENTRALIZADO", colunas O,P (idx 14,15)
function parseCondensado(linhas) {
  let desc = 0, rep = 0;
  for (let i = 0; i < linhas.length; i++) {
    const r = linhas[i] || [];
    const totalDesc = num(r[14]);
    const totalRep = num(r[15]);
    if (totalDesc > 0 || totalRep > 0) {
      desc = totalDesc;
      rep = totalRep;
      break;
    }
  }
  return { descentralizado: desc, repassado: rep };
}

// API
app.get('/api/dados', async (req, res) => {
  console.log('\n=== Carregando dados ===');
  try {
    const [
      lProg83, lProg52, lSuper, lContratos, lControle,
      lResumo, lDprfCond, lDerCond, lSemadCond
    ] = await Promise.all([
      lerAbaBruta(SHEET_CPE, 'PROGRAMAÇÃO 83.20'),
      lerAbaBruta(SHEET_CPE, 'PROGRAMAÇÃO 52.20'),
      lerAbaBruta(SHEET_CPE, 'SUPERAVIT 73.10'),
      lerAbaBruta(SHEET_CPE, 'CONTRATOS SERVIÇOS ESSENCIAIS'),
      lerAbaBruta(SHEET_CPE, 'controle de descentralizações'),
      lerAbaBruta(SHEET_REPASSES, 'RESUMO'),
      lerAbaBruta(SHEET_REPASSES, 'DPRF- CONDENSADO'),
      lerAbaBruta(SHEET_REPASSES, ' DER- CONDENSADO'),
      lerAbaBruta(SHEET_REPASSES, 'SEMAD- CONDENSADO')
    ]);

    const prog83 = parsePrograma(lProg83, 'DER');
    const prog52 = parsePrograma(lProg52, 'SEMAD');
    const super73 = parseSuperavit(lSuper);
    const contratos = parseContratos(lContratos);
    const controle = parseControle(lControle);
    const repasses = parseResumoRepasses(lResumo);
    const cond = {
      DPRF: parseCondensado(lDprfCond),
      DER: parseCondensado(lDerCond),
      SEMAD: parseCondensado(lSemadCond)
    };

    console.log('=== OK ===\n');
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      programacao: { DER: prog83, SEMAD: prog52, DPRF: super73 },
      contratos,
      controle,
      repasses: { resumo: repasses, condensados: cond }
    });
  } catch (e) {
    console.error('ERRO:', e);
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🚀 Dashboard na porta ${PORT}\n`));
