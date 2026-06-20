const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';

// ====== PARSERS CSV ======
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
    return linhas;
  } catch (e) {
    console.error(`Erro ao ler aba "${nomeAba}":`, e.message);
    return [];
  }
}

// ====== FUNÇÕES AUXILIARES ======
function num(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$/g, '').replace(/\s/g, '').replace(/\u00a0/g, '').trim();
  if (s === '' || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return (isNaN(n) || Math.abs(n) < 0.001) ? 0 : n;
}

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function encontrarColuna(hdr, palavras) {
  for (let i = 0; i < hdr.length; i++) {
    const h = String(hdr[i] || '').trim().toUpperCase();
    if (palavras.some(p => h.includes(p))) return i;
  }
  return -1;
}

function calcularDiasVigencia(dataFim) {
  if (!dataFim) return null;
  const dataStr = String(dataFim).trim();
  if (dataStr === '' || dataStr === '-') return null;
  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return null;
  const hoje = new Date();
  const diff = Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
  return diff;
}

// ====== PARSERS ESPECÍFICOS ======

// PROGRAMAÇÃO 83.20 e 52.20
function parsePrograma(linhas, fonte, headerIdx) {
  const hdr = linhas[headerIdx] || [];
  const colMes = {};
  let colDesc = -1, colElem = -1, colSoma = -1;
  
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H === m) colMes[m] = i; });
    if (H.includes('DESCRI')) colDesc = i;
    if (H.includes('ELEM')) colElem = i;
    if (H.includes('SOMA') || H.includes('TOTAL')) colSoma = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {}; MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length === 0) continue;
    const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
    const elem = colElem >= 0 ? String(r[colElem] || '').trim() : '';
    if (!desc || !elem) continue;
    if (desc.toUpperCase().includes('VALOR MENSAL') || desc.toUpperCase().includes('VALOR TRIMESTRAL')) continue;

    const meses = {};
    let somaItem = 0;
    MESES.forEach(m => {
      const val = colMes[m] !== undefined ? num(r[colMes[m]]) : 0;
      meses[m] = val;
      somaItem += val;
      planejMensal[m] += val;
    });

    if (somaItem === 0 && colSoma >= 0) somaItem = num(r[colSoma]);
    if (somaItem > 0) {
      totalPlanejado += somaItem;
      const elemNum = elem.split('.')[0].split('-')[0].trim();
      itens.push({ elemento: elemNum, descricao: desc, fonte, meses, soma: somaItem });
    }
  }

  return { fonte, itens, totalPlanejado, planejMensal };
}

// SUPERÁVIT 73.10
function parseSuperavit(linhas) {
  const headerIdx = 3;
  const hdr = linhas[headerIdx] || [];
  const colMes = {};
  let colDesc = -1, colElem = -1, colSoma = -1;
  
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H === m) colMes[m] = i; });
    if (H.includes('DESCRI')) colDesc = i;
    if (H === 'ELEMENTO') colElem = i;
    if (H.includes('SOMA') || H.includes('TOTAL')) colSoma = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {}; MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length === 0) continue;
    const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
    const elem = colElem >= 0 ? String(r[colElem] || '').trim() : '';
    if (!desc || !elem) continue;
    if (desc.toUpperCase().includes('TOTAL MENSAL') || elem.toUpperCase().includes('TOTAL')) continue;

    const meses = {};
    let somaItem = 0;
    MESES.forEach(m => {
      const val = colMes[m] !== undefined ? num(r[colMes[m]]) : 0;
      meses[m] = val;
      somaItem += val;
      planejMensal[m] += val;
    });
    if (somaItem === 0 && colSoma >= 0) somaItem = num(r[colSoma]);
    if (somaItem > 0) {
      totalPlanejado += somaItem;
      const elemNum = elem.split('.')[0].split('-')[0].trim();
      itens.push({ elemento: elemNum, descricao: desc, fonte: 'DPRF', meses, soma: somaItem });
    }
  }
  return { fonte: 'DPRF', itens, totalPlanejado, planejMensal };
}

// CONTRATOS (header em L2 = índice 1)
function parseContratos(linhas) {
  const headerIdx = 1;
  const hdr = linhas[headerIdx] || [];
  const col = {};
  
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    if (H === 'ELEMENTO') col.elemento = i;
    if (H === 'PROCESSO') col.processo = i;
    if (H.includes('EMPRESA')) col.empresa = i;
    if (H === 'OBJETO') col.objeto = i;
    if (H.includes('FIM DA VIG')) col.fimVig = i;
    if (H.includes('FIM (DIAS)') || H.includes('FIM(DIAS)')) col.dias = i;
    if (H.includes('VALOR TOTAL')) col.valorTotal = i;
    if (H.includes('VALOR EMPENHADO')) col.empenhado = i;
    if (H.includes('SALDO DE EMPENHO')) col.saldoEmp = i;
    if (H.includes('VALOR A EMPENHAR')) col.aEmpenhar = i;
    if (H.includes('MODALIDADE')) col.modalidade = i;
  });

  const contratos = [];
  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length === 0) continue;
    const empresa = col.empresa !== undefined ? String(r[col.empresa] || '').trim() : '';
    if (!empresa) continue;
    
    const valorTotal = num(r[col.valorTotal]);
    if (valorTotal === 0) continue;

    let dias = null;
    if (col.dias !== undefined) {
      const d = r[col.dias];
      if (d && d !== '' && d !== '-') {
        const dn = num(d);
        if (!isNaN(dn)) dias = Math.ceil(dn);
      }
    }
    
    // Se não encontrou dias na coluna, calcula da vigência
    if (dias === null && col.fimVig !== undefined) {
      dias = calcularDiasVigencia(r[col.fimVig]);
    }

    contratos.push({
      elemento: String(r[col.elemento] || '').split('.')[0].trim(),
      processo: String(r[col.processo] || '').trim(),
      empresa,
      objeto: String(r[col.objeto] || '').trim(),
      modalidade: String(r[col.modalidade] || '').trim(),
      fimVigencia: String(r[col.fimVig] || '').trim(),
      dias,
      valorTotal,
      empenhado: num(r[col.empenhado]),
      saldoEmpenho: num(r[col.saldoEmp]),
      aEmpenhar: num(r[col.aEmpenhar])
    });
  }
  return contratos;
}

// CONTROLE DE DESCENTRALIZAÇÕES (L6 = índice 5)
function parseControle(linhas) {
  const r = linhas[5] || [];
  return {
    DPRF: { previsto: num(r[1]), recebido: num(r[2]), diferenca: num(r[3]) },
    DER: { previsto: num(r[4]), recebido: num(r[5]), diferenca: num(r[6]) },
    SEMAD: { previsto: num(r[7]), recebido: num(r[8]), diferenca: num(r[9]) }
  };
}

// RESUMO DE REPASSES (busca valores em linhas 10-11, colunas E, J, O)
function parseResumoRepasses(linhas) {
  // Tenta L10 e L11 para saldo atual
  let saldos = { DPRF: 0, DER: 0, SEMAD: 0 };
  
  for (let i = 9; i <= 10; i++) {
    const r = linhas[i] || [];
    const d = num(r[4]) || num(r[5]);
    const er = num(r[9]) || num(r[10]);
    const s = num(r[14]) || num(r[15]);
    if (d > 0 || er > 0 || s > 0) {
      saldos = { DPRF: d, DER: er, SEMAD: s };
      break;
    }
  }

  // Tenta encontrar saldo por elemento (geralmente na linha com "SALDO")
  const porElemento = {
    DPRF: { '30': 0, '37': 0, '39': 0, '40': 0 },
    DER: { '30': 0, '37': 0, '39': 0, '40': 0 },
    SEMAD: { '30': 0, '37': 0, '39': 0, '40': 0 }
  };

  return { saldos, porElemento };
}

// CONDENSADO: pega valores de REPASSADO (L8, coluna O=14 ou similar)
function parseCondensado(linhas) {
  let descentralizado = 0, repassado = 0;
  
  for (let i = 6; i <= 8; i++) {
    const r = linhas[i] || [];
    const desc = num(r[14]);
    const rep = num(r[15]);
    if (desc > 0 || rep > 0) {
      descentralizado = desc;
      repassado = rep;
      break;
    }
  }
  
  return { descentralizado, repassado };
}

// ====== API ======
app.get('/api/dados', async (req, res) => {
  try {
    console.log('Buscando dados das planilhas...');
    
    const [
      lProg8320, lProg5220, lSuper, lContratos, lControle,
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

    const prog8320 = parsePrograma(lProg8320, 'DER', 7);
    const prog5220 = parsePrograma(lProg5220, 'SEMAD', 3);
    const superavit = parseSuperavit(lSuper);
    const contratos = parseContratos(lContratos);
    const controle = parseControle(lControle);
    const resumoRep = parseResumoRepasses(lResumo);
    const condensados = {
      DPRF: parseCondensado(lDprfCond),
      DER: parseCondensado(lDerCond),
      SEMAD: parseCondensado(lSemadCond)
    };

    console.log('Dados carregados com sucesso');
    console.log('Saldos:', resumoRep.saldos);
    console.log('Recebidos:', controle);
    console.log('Total contratos:', contratos.length);

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      programacao: { DER: prog8320, SEMAD: prog5220, DPRF: superavit },
      contratos,
      controle,
      repasses: { resumo: resumoRep, condensados }
    });
  } catch (e) {
    console.error('Erro ao processar dados:', e);
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ====== STATIC FILES ======
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Dashboard CPE rodando na porta ' + PORT));
