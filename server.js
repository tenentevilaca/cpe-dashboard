const express = require('express');
const cors = require('cors');
const axios = require('axios');
 
const app = express();
app.use(cors());
app.use(express.json());
 
const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
 
// Lê uma aba específica via gid
async function lerAba(sheetId, gid, nomeAba) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await axios.get(url, { timeout: 15000 });
    const lines = res.data.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Parse CSV considerando aspas
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      result.push(current.trim());
      return result;
    }
    
    const headers = parseCSVLine(lines[0]);
    const dados = [];
    
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      let temDado = false;
      for (let v of vals) {
        if (v && v !== '') { temDado = true; break; }
      }
      if (!temDado) continue;
      
      const obj = { __aba: nomeAba };
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = vals[j] || '';
      }
      dados.push(obj);
    }
    return dados;
  } catch (e) {
    console.error('Erro ao ler aba ' + nomeAba + ':', e.message);
    return [];
  }
}
 
// Lê todas as abas usando a primeira (gid=0) e depois descobre as outras
async function lerTodasAbas(sheetId) {
  try {
    // Primeiro busca a metadata da planilha
    const metaUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const res = await axios.get(metaUrl, { timeout: 15000 });
    
    // Lê todas as abas conhecidas em paralelo (vamos tentar GIDs comuns)
    const abasParaTentar = [
      { gid: '0', nome: 'aba1' }
    ];
    
    return abasParaTentar;
  } catch (e) {
    return [];
  }
}
 
// API que retorna dados de todas as abas conhecidas
app.get('/api/dados', async (req, res) => {
  try {
    // Lê a primeira aba (controle de descentralizações)
    const aba0 = await lerAba(SHEET_CPE, '0', 'controle de descentralizações');
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      data: {
        registros: aba0,
        total: aba0.length
      }
    });
  } catch (e) {
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});
 
app.get('/health', (req, res) => res.json({ status: 'ok' }));
 
// HTML do Dashboard COMPLETO
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard CPE 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root {
  --preto: #373435;
  --dourado: #A08F63;
  --dourado-claro: #C4B287;
  --bg: #FAF8F3;
  --bg-card: #FFFFFF;
  --bg-soft: #F2EFE6;
  --texto: #373435;
  --texto-soft: #5A5A5A;
  --texto-mute: #8A8A8A;
  --linha: #E0DCD0;
  --positivo: #6B5B3A;
  --aviso: #B47B2A;
  --perigo: #8B1A1A;
  --sombra: 0 1px 3px rgba(55,52,53,0.04), 0 4px 16px rgba(55,52,53,0.04);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--texto); line-height: 1.5; min-height: 100vh; }
.header { background: var(--preto); color: #FFF; padding: 20px 40px; border-bottom: 3px solid var(--dourado); }
.header-top { display: flex; justify-content: space-between; align-items: center; max-width: 1600px; margin: 0 auto; gap: 24px; }
.header-info h1 { font-family: 'Source Serif Pro', serif; font-size: 26px; color: #FFF; }
.header-info .subtitle { font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dourado-claro); }
.refresh-btn { background: var(--dourado); color: var(--preto); border: none; padding: 10px 18px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.refresh-btn:hover { background: var(--dourado-claro); }
.last-update { font-size: 10px; color: #FFF; opacity: 0.75; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
.status-line { background: rgba(255,255,255,0.08); padding: 8px 40px; text-align: center; font-size: 11px; color: #FFF; font-family: 'JetBrains Mono', monospace; }
.status-line.error { background: var(--perigo); }
.status-line.success { background: rgba(160, 143, 99, 0.4); }
.main { max-width: 1600px; margin: 0 auto; padding: 28px 40px; }
.filters { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 20px 24px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 20px; box-shadow: var(--sombra); }
.filter-group { display: flex; flex-direction: column; gap: 6px; }
.filter-group label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-mute); }
.filter-group select { background: var(--bg); border: 1px solid var(--linha); padding: 8px 12px; border-radius: 4px; font-size: 13px; color: var(--texto); cursor: pointer; font-family: inherit; }
.filter-group select:focus { outline: none; border-color: var(--preto); }
.view-toggle { display: flex; flex-direction: column; gap: 6px; }
.toggle-buttons { display: flex; background: var(--bg-soft); border-radius: 4px; padding: 2px; border: 1px solid var(--linha); }
.toggle-btn { background: transparent; border: none; padding: 7px 12px; border-radius: 3px; font-size: 11px; font-weight: 600; color: var(--texto-soft); cursor: pointer; text-transform: uppercase; font-family: inherit; }
.toggle-btn.active { background: var(--preto); color: #FFF; }
.section-title { font-family: 'Source Serif Pro', serif; font-size: 20px; font-weight: 700; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--dourado); display: flex; align-items: baseline; gap: 12px; color: var(--texto); }
.section-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--dourado); }
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
.kpi { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 18px 20px; box-shadow: var(--sombra); position: relative; overflow: hidden; }
.kpi::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--preto); }
.kpi.gold::before { background: var(--dourado); }
.kpi.positivo::before { background: var(--positivo); }
.kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-mute); margin-bottom: 6px; }
.kpi-value { font-family: 'JetBrains Mono', monospace; font-size: 19px; font-weight: 600; color: var(--texto); margin-bottom: 4px; }
.kpi-detail { font-size: 11px; color: var(--texto-soft); }
.charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
.chart-card { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 20px 24px; box-shadow: var(--sombra); }
.chart-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-soft); margin-bottom: 16px; }
.chart-container { position: relative; height: 320px; }
.table-card { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; overflow: hidden; box-shadow: var(--sombra); }
.table-header { padding: 18px 24px; border-bottom: 1px solid var(--linha); display: flex; justify-content: space-between; align-items: center; }
.table-header h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-soft); }
.table-meta { font-size: 11px; color: var(--texto-mute); font-family: 'JetBrains Mono', monospace; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: var(--bg-soft); }
th { padding: 12px 14px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--texto-soft); border-bottom: 1px solid var(--linha); white-space: nowrap; }
th.num { text-align: right; }
td { padding: 12px 14px; border-bottom: 1px solid var(--linha); color: var(--texto); }
td.num { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
td.code { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--texto-soft); }
tbody tr:hover { background: var(--bg-soft); }
.tag { display: inline-block; padding: 3px 9px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
.tag-dprf { background: #D0DCE6; color: #1F3D52; }
.tag-der { background: #E6D5C3; color: #5C3D1F; }
.tag-semad { background: #D4DACE; color: #1B5E20; }
.tag-contratual { background: #E8DCC0; color: #5C4519; }
.tag-essencial { background: #D9D6CD; color: var(--preto); }
.tag-vigente { background: #C8E6C9; color: #1B5E20; border: 1px solid #66BB6A; }
.tag-laranja { background: #FFCC80; color: #5D2E00; border: 1px solid #E67E22; font-weight: 700; }
.tag-vermelho { background: #FFAB91; color: #B71C1C; border: 1px solid #C62828; font-weight: 700; }
.bar-mini { width: 100%; height: 5px; background: var(--bg-soft); border-radius: 3px; overflow: hidden; margin-top: 4px; }
.bar-fill { height: 100%; transition: width 0.4s; }
.bar-low { background: var(--positivo); }
.bar-mid { background: var(--aviso); }
.bar-high { background: var(--perigo); }
.pct-mini { font-size: 10px; color: var(--texto-mute); font-family: 'JetBrains Mono', monospace; }
.footer { max-width: 1600px; margin: 40px auto 0; padding: 24px 40px 32px; border-top: 1px solid var(--linha); font-size: 11px; color: var(--texto-mute); text-align: center; }
@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } .charts-grid { grid-template-columns: 1fr; } .filters { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .header, .main, .status-line { padding-left: 20px; padding-right: 20px; } .kpi-grid { grid-template-columns: 1fr; } .filters { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header class="header">
  <div class="header-top">
    <div class="header-info">
      <div class="subtitle">Estado-Maior do CPE | Exercício 2026</div>
      <h1>Dashboard Orçamentário</h1>
    </div>
    <div>
      <button class="refresh-btn" onclick="carregarDados()">🔄 Atualizar Dados</button>
      <div class="last-update" id="last-update">—</div>
    </div>
  </div>
</header>
<div class="status-line" id="status">Carregando...</div>
<main class="main" id="main"><div style="text-align:center; padding: 60px;">Carregando dados...</div></main>
<script>
const CONFIG = { CONVENIOS: { DPRF: 13086500.92, DER: 9000000.00, SEMAD: 12500000.00 } };
let state = { registros: [], filtros: { fonte: 'TODAS', elemento: 'TODOS', tipo: 'TODOS', status: 'TODOS', visao: 'absoluto' } };
let chartElem = null, chartTipo = null;
 
async function carregarDados() {
  setStatus('Buscando dados...', 'loading');
  try {
    const res = await fetch('/api/dados');
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.msg);
    state.registros = json.data.registros || [];
    setStatus('✓ ' + state.registros.length + ' registros carregados', 'success');
    document.getElementById('last-update').textContent = 'Atualizado: ' + new Date().toLocaleString('pt-BR');
    renderizar();
  } catch (e) {
    setStatus('⚠ Erro: ' + e.message, 'error');
  }
}
 
function setStatus(msg, tipo) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status-line ' + (tipo || '');
}
 
const fmtBR = v => isNaN(v) || v == null ? 'R$ -' : 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtBRk = v => { if (isNaN(v) || v == null) return 'R$ -'; const a = Math.abs(v); if (a >= 1e6) return 'R$ ' + (v/1e6).toFixed(2).replace('.',',') + 'M'; if (a >= 1e3) return 'R$ ' + (v/1e3).toFixed(1).replace('.',',') + 'K'; return 'R$ ' + Number(v).toLocaleString('pt-BR'); };
const fmtPct = v => isNaN(v) || v == null ? '-' : (v*100).toFixed(1).replace('.',',') + '%';
const normFonte = s => { if (!s) return ''; const str = String(s).toUpperCase(); if (str.includes('DPRF') || str.includes('73')) return 'DPRF'; if (str.includes('DER') || str.includes('83')) return 'DER'; if (str.includes('SEMAD') || str.includes('52')) return 'SEMAD'; return str; };
const getField = (obj, ...keys) => { for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; return null; };
const num = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return v; const s = String(v).replace(/[R\\$\\s]/g, '').replace(/\\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
 
function renderizar() {
  document.getElementById('main').innerHTML = \`
    <div class="filters">
      <div class="filter-group"><label>Fonte de Recurso</label><select id="f-fonte"><option value="TODAS">Todas</option><option value="DPRF">DPRF (73.10)</option><option value="DER">DER (83.20)</option><option value="SEMAD">SEMAD (52.20)</option></select></div>
      <div class="filter-group"><label>Elemento</label><select id="f-elemento"><option value="TODOS">Todos</option></select></div>
      <div class="filter-group"><label>Tipo de Despesa</label><select id="f-tipo"><option value="TODOS">Todos</option><option value="CONTRATUAL">Contratual</option><option value="ESSENCIAL">Essencial</option></select></div>
      <div class="filter-group"><label>Status</label><select id="f-status"><option value="TODOS">Todos</option></select></div>
      <div class="view-toggle"><label>Visão</label><div class="toggle-buttons"><button class="toggle-btn" data-v="contabil">Contábil</button><button class="toggle-btn" data-v="financeira">Financeira</button><button class="toggle-btn active" data-v="absoluto">Absoluto</button></div></div>
    </div>
    <h2 class="section-title"><span class="section-num">01</span>Resumo Executivo</h2>
    <div class="kpi-grid" id="kpis"></div>
    <h2 class="section-title"><span class="section-num">02</span>Distribuição Orçamentária</h2>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">Execução por Elemento de Despesa</div><div class="chart-container"><canvas id="ch-elem"></canvas></div></div>
      <div class="chart-card"><div class="chart-title">Distribuição Contratual vs Essencial</div><div class="chart-container"><canvas id="ch-tipo"></canvas></div></div>
    </div>
    <h2 class="section-title"><span class="section-num">03</span>Detalhamento por Elemento</h2>
    <div class="table-card">
      <div class="table-header"><h3>Posição por Elemento</h3><span class="table-meta" id="t-meta">—</span></div>
      <div style="overflow-x: auto;"><table><thead><tr><th>Fonte</th><th>Elemento</th><th>Descrição</th><th>Tipo</th><th class="num">Plano</th><th class="num">Empenhado</th><th class="num">Liquidado</th><th class="num">Pago</th><th class="num">Saldo</th><th>Execução</th></tr></thead><tbody id="tb-elem"></tbody></table></div>
    </div>
    <h2 class="section-title"><span class="section-num">04</span>Dados Brutos</h2>
    <div class="table-card">
      <div class="table-header"><h3>Todos os Registros</h3><span class="table-meta" id="r-meta">—</span></div>
      <div style="overflow-x: auto; max-height: 500px;"><table id="t-raw"><thead id="th-raw"></thead><tbody id="tb-raw"></tbody></table></div>
    </div>
    <footer class="footer">Dashboard CPE 2026 — Conectado ao Google Sheets</footer>
  \`;
  
  ['f-fonte', 'f-elemento', 'f-tipo', 'f-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => { state.filtros[id.replace('f-', '')] = e.target.value; atualizar(); });
  });
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.filtros.visao = e.target.dataset.v;
      atualizar();
    });
  });
  
  popularElementos();
  atualizar();
}
 
function popularElementos() {
  const sel = document.getElementById('f-elemento');
  if (!sel) return;
  const elems = [...new Set(state.registros.map(r => getField(r, 'ELEMENTO') || ''))].filter(Boolean).sort();
  sel.innerHTML = '<option value="TODOS">Todos</option>' + elems.map(e => '<option value="' + e + '">' + e + '</option>').join('');
}
 
function filtrar() {
  const f = state.filtros;
  return state.registros.filter(r => {
    const fonte = normFonte(getField(r, 'FONTE'));
    const elem = getField(r, 'ELEMENTO') || '';
    const tipo = String(getField(r, 'TIPO DESPESA', 'TIPO') || '').toUpperCase();
    if (f.fonte !== 'TODAS' && fonte !== f.fonte) return false;
    if (f.elemento !== 'TODOS' && elem !== f.elemento) return false;
    if (f.tipo !== 'TODOS' && tipo && !tipo.includes(f.tipo)) return false;
    return true;
  });
}
 
function calcResumo() {
  const dados = filtrar();
  const plano = dados.reduce((s, r) => s + num(getField(r, 'VALOR ANUAL AUTORIZADO', 'VALOR TOTAL', 'VALOR')), 0);
  const emp = dados.reduce((s, r) => s + num(getField(r, 'EMPENHADO', 'VALOR EMPENHADO')), 0);
  const liq = dados.reduce((s, r) => s + num(getField(r, 'LIQUIDADO', 'VALOR LIQUIDADO')), 0);
  const pag = dados.reduce((s, r) => s + num(getField(r, 'PAGO', 'VALOR PAGO')), 0);
  const conv = state.filtros.fonte === 'TODAS' ? CONFIG.CONVENIOS.DPRF + CONFIG.CONVENIOS.DER + CONFIG.CONVENIOS.SEMAD : CONFIG.CONVENIOS[state.filtros.fonte] || 0;
  return { conv, plano, emp, liq, pag, sContabil: plano - emp, sFinanceira: plano - pag, sAbsoluto: (plano - emp) + (plano - pag), aLiq: emp - liq, aPag: liq - pag, execPct: plano > 0 ? emp / plano : 0 };
}
 
function renderKPIs() {
  const r = calcResumo();
  const v = state.filtros.visao;
  let sL, sV, sD;
  if (v === 'contabil') { sL = 'Saldo Contábil'; sV = r.sContabil; sD = 'Plano − Empenhado'; }
  else if (v === 'financeira') { sL = 'Saldo Financeiro'; sV = r.sFinanceira; sD = 'Plano − Pago'; }
  else { sL = 'Saldo Absoluto'; sV = r.sAbsoluto; sD = 'Contábil + Financeira'; }
  
  const kpis = [
    { l: 'Convênio Total', v: fmtBRk(r.conv), d: 'Plano: ' + fmtBRk(r.plano), c: 'gold' },
    { l: 'Empenhado', v: fmtBRk(r.emp), d: fmtPct(r.execPct) + ' do plano', c: '' },
    { l: 'Liquidado', v: fmtBRk(r.liq), d: 'A liquidar: ' + fmtBRk(r.aLiq), c: '' },
    { l: 'Pago', v: fmtBRk(r.pag), d: 'A pagar: ' + fmtBRk(r.aPag), c: 'positivo' },
    { l: sL, v: fmtBRk(sV), d: sD, c: sV < 0 ? '' : 'positivo' }
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k => '<div class="kpi ' + k.c + '"><div class="kpi-label">' + k.l + '</div><div class="kpi-value">' + k.v + '</div><div class="kpi-detail">' + k.d + '</div></div>').join('');
}
 
function renderTabelaElem() {
  const dados = filtrar();
  document.getElementById('t-meta').textContent = dados.length + ' registros';
  const tbody = document.getElementById('tb-elem');
  if (dados.length === 0) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--texto-mute);">Sem registros</td></tr>'; return; }
  
  const v = state.filtros.visao;
  tbody.innerHTML = dados.map(d => {
    const fonte = normFonte(getField(d, 'FONTE'));
    const elem = getField(d, 'ELEMENTO') || '';
    const desc = getField(d, 'DESCRIÇÃO ELEMENTO', 'DESCRICAO ELEMENTO', 'DESCRIÇÃO') || '';
    const tipo = String(getField(d, 'TIPO DESPESA', 'TIPO') || 'ESSENCIAL').toUpperCase();
    const plano = num(getField(d, 'VALOR ANUAL AUTORIZADO', 'VALOR TOTAL', 'VALOR'));
    const emp = num(getField(d, 'EMPENHADO', 'VALOR EMPENHADO'));
    const liq = num(getField(d, 'LIQUIDADO', 'VALOR LIQUIDADO'));
    const pag = num(getField(d, 'PAGO', 'VALOR PAGO'));
    const sCont = plano - emp, sFin = plano - pag, sAbs = sCont + sFin;
    const saldo = v === 'contabil' ? sCont : v === 'financeira' ? sFin : sAbs;
    const pct = plano > 0 ? emp / plano : 0;
    const barC = pct < 0.5 ? 'bar-low' : pct < 0.85 ? 'bar-mid' : 'bar-high';
    return '<tr><td><span class="tag tag-' + fonte.toLowerCase() + '">' + fonte + '</span></td><td class="code">' + elem + '</td><td>' + desc + '</td><td><span class="tag tag-' + tipo.toLowerCase() + '">' + tipo + '</span></td><td class="num">' + fmtBR(plano) + '</td><td class="num">' + fmtBR(emp) + '</td><td class="num">' + fmtBR(liq) + '</td><td class="num">' + fmtBR(pag) + '</td><td class="num" style="font-weight:600; color:' + (saldo < 0 ? '#8B1A1A' : '#6B5B3A') + ';">' + fmtBR(saldo) + '</td><td><span class="pct-mini">' + fmtPct(pct) + '</span><div class="bar-mini"><div class="bar-fill ' + barC + '" style="width:' + Math.min(pct*100, 100) + '%"></div></div></td></tr>';
  }).join('');
}
 
function renderTabelaRaw() {
  const dados = filtrar();
  document.getElementById('r-meta').textContent = dados.length + ' registros';
  if (dados.length === 0) { document.getElementById('tb-raw').innerHTML = '<tr><td>Sem dados</td></tr>'; return; }
  const headers = Object.keys(dados[0]).filter(k => k !== '__aba');
  document.getElementById('th-raw').innerHTML = '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>';
  document.getElementById('tb-raw').innerHTML = dados.slice(0, 100).map(r => '<tr>' + headers.map(h => '<td>' + (r[h] || '') + '</td>').join('') + '</tr>').join('');
}
 
function renderCharts() {
  const dados = filtrar();
  const porE = {};
  dados.forEach(d => {
    const e = getField(d, 'ELEMENTO') || 'N/D';
    if (!porE[e]) porE[e] = { desc: (getField(d, 'DESCRIÇÃO ELEMENTO', 'DESCRICAO ELEMENTO') || e), plano: 0, emp: 0, pag: 0 };
    porE[e].plano += num(getField(d, 'VALOR ANUAL AUTORIZADO', 'VALOR TOTAL', 'VALOR'));
    porE[e].emp += num(getField(d, 'EMPENHADO', 'VALOR EMPENHADO'));
    porE[e].pag += num(getField(d, 'PAGO', 'VALOR PAGO'));
  });
  const items = Object.values(porE).sort((a,b) => b.plano - a.plano).slice(0, 10);
  
  if (chartElem) chartElem.destroy();
  if (items.length > 0) {
    chartElem = new Chart(document.getElementById('ch-elem'), {
      type: 'bar',
      data: { labels: items.map(i => String(i.desc).substring(0, 30)), datasets: [
        { label: 'Plano', data: items.map(i => i.plano), backgroundColor: '#C4B287' },
        { label: 'Empenhado', data: items.map(i => i.emp), backgroundColor: '#A08F63' },
        { label: 'Pago', data: items.map(i => i.pag), backgroundColor: '#373435' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { callback: v => fmtBRk(v) } } } }
    });
  }
  
  const porT = { CONTRATUAL: 0, ESSENCIAL: 0 };
  dados.forEach(d => {
    const t = String(getField(d, 'TIPO DESPESA', 'TIPO') || 'ESSENCIAL').toUpperCase();
    const val = num(getField(d, 'VALOR ANUAL AUTORIZADO', 'VALOR TOTAL', 'VALOR'));
    if (porT[t] !== undefined) porT[t] += val; else porT.ESSENCIAL += val;
  });
  
  if (chartTipo) chartTipo.destroy();
  chartTipo = new Chart(document.getElementById('ch-tipo'), {
    type: 'doughnut',
    data: { labels: ['Contratual', 'Essencial'], datasets: [{ data: [porT.CONTRATUAL, porT.ESSENCIAL], backgroundColor: ['#A08F63', '#373435'], borderWidth: 2, borderColor: '#FFF' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '60%' }
  });
}
 
function atualizar() {
  renderKPIs();
  renderTabelaElem();
  renderTabelaRaw();
  renderCharts();
}
 
window.addEventListener('load', carregarDados);
</script>
</body>
</html>`;
 
app.get('/', (req, res) => res.send(DASHBOARD_HTML));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Rodando na porta ' + PORT));
