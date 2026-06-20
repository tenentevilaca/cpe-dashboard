const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';

// ====== LEITURA DE ABAS (linhas brutas, sem assumir cabeçalho) ======
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
    return [];
  }
}

function num(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/R\$/g, '').replace(/\s/g, '').replace(/\u00a0/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return (isNaN(n) || Math.abs(n) < 0.001) ? 0 : n;
}

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

// ====== PARSERS ESPECÍFICOS POR ABA ======

// PROGRAMAÇÃO (83.20 linha cab=8 idx7; 52.20 linha cab=4 idx3)
function parsePrograma(linhas, fonte, headerIdx) {
  const hdr = linhas[headerIdx] || [];
  // Localiza colunas dos meses e descrição/elemento
  const colMes = {};
  let colDesc = -1, colElem = -1, colSoma = -1, colTotalPT = -1;
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H === m) colMes[m] = i; });
    if (H.includes('DESCRI')) colDesc = i;
    if (H.includes('ELEM')) colElem = i;
    if (H.includes('SOMA')) colSoma = i;
    if (H.includes('TOTAL PT') || H === 'TOTAL PT') colTotalPT = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {}; MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
    const elem = colElem >= 0 ? String(r[colElem] || '').trim() : '';
    if (!desc || !elem) continue;
    // Ignora linhas de total
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
    totalPlanejado += somaItem;

    const elemNum = elem.split('.')[0].split('-')[0].trim();
    itens.push({ elemento: elemNum, descricao: desc, fonte, meses, soma: somaItem });
  }

  return { fonte, itens, totalPlanejado, planejMensal };
}

// SUPERAVIT 73.10 (cab linha 4 idx3): ELEMENTO|ITEM|DESCRIÇÃO|meses...
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
    if (H.includes('SOMA')) colSoma = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {}; MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
    const elem = colElem >= 0 ? String(r[colElem] || '').trim() : '';
    if (!desc || !elem) continue;
    if (desc.toUpperCase().includes('TOTAL MENSAL') || elem.toUpperCase().includes('TOTAL')) continue;

    const meses = {};
    let somaItem = 0;
    MESES.forEach(m => {
      const val = colMes[m] !== undefined ? num(r[colMes[m]]) : 0;
      meses[m] = val; somaItem += val; planejMensal[m] += val;
    });
    if (somaItem === 0 && colSoma >= 0) somaItem = num(r[colSoma]);
    totalPlanejado += somaItem;

    const elemNum = elem.split('.')[0].split('-')[0].trim();
    itens.push({ elemento: elemNum, descricao: desc, fonte: 'DPRF', meses, soma: somaItem });
  }
  return { fonte: 'DPRF', itens, totalPlanejado, planejMensal };
}

// CONTRATOS (cab linha 2 idx1)
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
    if (!r) continue;
    const empresa = col.empresa !== undefined ? String(r[col.empresa] || '').trim() : '';
    if (!empresa) continue;
    const valorTotal = num(r[col.valorTotal]);
    if (valorTotal === 0 && !empresa) continue;

    let dias = null;
    if (col.dias !== undefined) {
      const d = r[col.dias];
      if (d !== '' && d !== null && d !== undefined) { const dn = parseInt(num(d)); if (!isNaN(dn)) dias = dn; }
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

// controle de descentralizações (recebimentos)
function parseControle(linhas) {
  // L6 (idx5) tem os valores; estrutura: B=DPRF prev, C=DPRF receb, D=dif, E=DER prev, F=DER receb, G=dif, H=SEMAD prev, I=SEMAD receb, J=dif
  const r = linhas[5] || [];
  return {
    DPRF: { previsto: num(r[1]), recebido: num(r[2]), diferenca: num(r[3]) },
    DER: { previsto: num(r[4]), recebido: num(r[5]), diferenca: num(r[6]) },
    SEMAD: { previsto: num(r[7]), recebido: num(r[8]), diferenca: num(r[9]) }
  };
}

// RESUMO da Repasses: saldo atual L10 (idx9), cols E,J,O = idx 4,9,14
function parseResumoRepasses(linhas) {
  const r = linhas[9] || [];
  const saldos = { DPRF: num(r[4]), DER: num(r[9]), SEMAD: num(r[14]) };
  // Saldo por elemento: L18 (idx17)
  const re = linhas[17] || [];
  const porElemento = {
    DPRF: { '30': num(re[4]), '37': num(re[5]), '39': num(re[6]), '40': num(re[7]) },
    DER: { '30': num(re[9]), '37': num(re[10]), '39': num(re[11]), '40': num(re[12]) },
    SEMAD: { '30': num(re[14]), '37': num(re[15]), '39': num(re[16]) }
  };
  return { saldos, porElemento };
}

// CONDENSADO: TOTAL DESCENTRALIZADO e REPASSADO em L8 (idx7), cols O,P (idx 14,15)
function parseCondensado(linhas) {
  const r = linhas[7] || [];
  return { descentralizado: num(r[14]), repassado: num(r[15]) };
}

// ====== API ======
app.get('/api/dados', async (req, res) => {
  try {
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

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      programacao: { DER: prog8320, SEMAD: prog5220, DPRF: superavit },
      contratos,
      controle,
      repasses: { resumo: resumoRep, condensados }
    });
  } catch (e) {
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));


const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Dashboard CPE rodando na porta ' + PORT));
