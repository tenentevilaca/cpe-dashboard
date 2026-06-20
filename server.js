const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';

// ====== PARSER CSV ======
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
    console.log(`OK "${nomeAba}": ${linhas.length} linhas`);
    return linhas;
  } catch (e) {
    console.error(`ERRO "${nomeAba}":`, e.message);
    return [];
  }
}

// ====== FUNÇÃO NUM CORRIGIDA (detecta formato BR e US) ======
function num(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/R\$/g, '').replace(/\s/g, '').replace(/\u00a0/g, '');
  if (s === '' || s === '-') return 0;

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');

  if (temVirgula && temPonto) {
    // Formato BR: 6.251.313,00 -> ponto=milhar, virgula=decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    // Só vírgula: 6251313,00 -> decimal
    s = s.replace(',', '.');
  }
  // Se só tem ponto (formato US 6251313.0), mantém

  const n = parseFloat(s);
  return (isNaN(n) || Math.abs(n) < 0.001) ? 0 : n;
}

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function calcularDiasVigencia(dataFim) {
  if (!dataFim) return null;
  let dataStr = String(dataFim).trim();
  if (dataStr === '' || dataStr === '-') return null;
  // Remove hora se houver
  dataStr = dataStr.split(' ')[0].split('T')[0];
  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
}

// ====== PARSERS ======

// PROGRAMAÇÃO 83.20 (header idx7) e 52.20 (header idx3)
function parsePrograma(linhas, fonte, headerIdx) {
  const hdr = linhas[headerIdx] || [];
  const colMes = {}, col = {};
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H === m || H.startsWith(m)) colMes[m] = i; });
    if (H.includes('DESCRI')) col.desc = i;
    if (H.includes('ELEM')) col.elem = i;
    if (H.includes('SOMA') || H.includes('TOTAL PT')) col.soma = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {};
  MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r || r.length === 0) continue;
    const desc = col.desc !== undefined ? String(r[col.desc] || '').trim() : '';
    const elem = col.elem !== undefined ? String(r[col.elem] || '').trim() : '';
    if (!desc || !elem) continue;
    const dU = desc.toUpperCase();
    if (dU.includes('VALOR MENSAL') || dU.includes('VALOR TRIMESTRAL') || dU.includes('TOTAL')) continue;

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
  return { fonte, itens, totalPlanejado, planejMensal };
}

// SUPERAVIT 73.10 (header idx3)
function parseSuperavit(linhas) {
  const headerIdx = 3;
  const hdr = linhas[headerIdx] || [];
  const colMes = {}, col = {};
  hdr.forEach((h, i) => {
    const H = String(h).trim().toUpperCase();
    MESES.forEach(m => { if (H === m || H.startsWith(m)) colMes[m] = i; });
    if (H.includes('DESCRI')) col.desc = i;
    if (H === 'ELEMENTO') col.elem = i;
    if (H.includes('SOMA') || H.includes('TOTAL')) col.soma = i;
  });

  const itens = [];
  let totalPlanejado = 0;
  const planejMensal = {};
  MESES.forEach(m => planejMensal[m] = 0);

  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (!r) continue;
    const desc = col.desc !== undefined ? String(r[col.desc] || '').trim() : '';
    const elem = col.elem !== undefined ? String(r[col.elem] || '').trim() : '';
    if (!desc || !elem) continue;
    if (desc.toUpperCase().includes('TOTAL') || elem.toUpperCase().includes('TOTAL')) continue;

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
      itens.push({ elemento: elemNum, descricao: desc, fonte: 'DPRF', meses, soma: somaItem });
    }
  }
  return { fonte: 'DPRF', itens, totalPlanejado, planejMensal };
}

// CONTRATOS (header L2 = idx1)
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
    if (H === 'VALOR EMPENHADO' || (H.includes('EMPENHADO') && !H.includes('A EMPENHAR'))) col.empenhado = i;
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
    if (valorTotal === 0) continue;

    // Dias: SEMPRE calcular da data de vigência (a coluna FIM(DIAS) tem fórmula =G-TODAY())
    let dias = null;
    if (col.fimVig !== undefined) {
      dias = calcularDiasVigencia(r[col.fimVig]);
    }
    // Fallback: se não conseguiu pela data, tenta a coluna de dias
    if (dias === null && col.dias !== undefined) {
      const d = r[col.dias];
      if (d && String(d).trim() !== '' && !String(d).includes('=')) {
        const dn = num(d);
        if (dn !== 0) dias = Math.ceil(dn);
      }
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
  console.log(`OK Contratos: ${contratos.length}`);
  return contratos;
}

// CONTROLE DESCENTRALIZAÇÕES (valores em L6 = idx5)
// B=prev DPRF, C=receb DPRF, E=prev DER, F=receb DER, H=prev SEMAD, I=receb SEMAD
function parseControle(linhas) {
  const r = linhas[5] || [];
  const ctrl = {
    DPRF: { previsto: num(r[1]), recebido: num(r[2]), diferenca: num(r[3]) },
    DER: { previsto: num(r[4]), recebido: num(r[5]), diferenca: num(r[6]) },
    SEMAD: { previsto: num(r[7]), recebido: num(r[8]), diferenca: num(r[9]) }
  };
  console.log(`OK Controle - Recebidos: DPRF=${ctrl.DPRF.recebido} DER=${ctrl.DER.recebido} SEMAD=${ctrl.SEMAD.recebido}`);
  return ctrl;
}

// RESUMO REPASSES: saldos em L10 (idx9), cols E(4) J(9) O(14)
// Saldo por elemento em L18 (idx17)
function parseResumoRepasses(linhas) {
  const r10 = linhas[9] || [];
  const saldos = {
    DPRF: num(r10[4]),
    DER: num(r10[9]),
    SEMAD: num(r10[14])
  };

  const r18 = linhas[17] || [];
  const porElemento = {
    DPRF: { '30': num(r18[4]), '37': num(r18[5]), '39': num(r18[6]), '40': num(r18[7]) },
    DER: { '30': num(r18[9]), '37': num(r18[10]), '39': num(r18[11]), '40': num(r18[12]) },
    SEMAD: { '30': num(r18[14]), '37': num(r18[15]), '39': num(r18[16]) }
  };

  console.log(`OK Saldos - DPRF=${saldos.DPRF} DER=${saldos.DER} SEMAD=${saldos.SEMAD}`);
  return { saldos, porElemento };
}

// CONDENSADO: TOTAL DESCENTRALIZADO=O8(idx14), TOTAL REPASSADO=P8(idx15)
function parseCondensado(linhas) {
  // Procura a linha onde estão os totais (geralmente L8 = idx7)
  let descentralizado = 0, repassado = 0;
  for (let i = 7; i <= 9; i++) {
    const r = linhas[i] || [];
    const d = num(r[14]);
    const rep = num(r[15]);
    if (d > 0 || rep > 0) {
      descentralizado = d;
      repassado = rep;
      break;
    }
  }
  return { descentralizado, repassado };
}

// ====== API PRINCIPAL ======
app.get('/api/dados', async (req, res) => {
  console.log('\n=== Buscando dados ===');
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

    console.log('=== Dados OK ===\n');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      programacao: { DER: prog8320, SEMAD: prog5220, DPRF: superavit },
      contratos,
      controle,
      repasses: { resumo: resumoRep, condensados }
    });
  } catch (e) {
    console.error('ERRO:', e);
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ====== DEBUG - ESTRUTURA COMPLETA ======
app.get('/debug', async (req, res) => {
  try {
    const [lProg8320, lProg5220, lControle, lResumo, lContratos] = await Promise.all([
      lerAbaBruta(SHEET_CPE, 'PROGRAMAÇÃO 83.20'),
      lerAbaBruta(SHEET_CPE, 'PROGRAMAÇÃO 52.20'),
      lerAbaBruta(SHEET_CPE, 'controle de descentralizações'),
      lerAbaBruta(SHEET_REPASSES, 'RESUMO'),
      lerAbaBruta(SHEET_CPE, 'CONTRATOS SERVIÇOS ESSENCIAIS')
    ]);

    // Mostrar primeiras 30 linhas de cada aba
    res.json({
      prog83_primeiras30: lProg8320.slice(0, 30),
      prog52_primeiras30: lProg5220.slice(0, 30),
      controle_primeiras15: lControle.slice(0, 15),
      resumo_primeiras25: lResumo.slice(0, 25),
      contratos_primeiras10: lContratos.slice(0, 10)
    });
  } catch (e) {
    res.status(500).json({ erro: e.message, stack: e.stack });
  }
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\nDashboard CPE rodando na porta ${PORT}\n`));
