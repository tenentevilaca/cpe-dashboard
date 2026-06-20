const express = require('express');
const cors = require('cors');
const axios = require('axios');
 
const app = express();
app.use(cors());
app.use(express.json());
 
const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';
 
const ABAS_CPE = [
  'controle de descentralizações',
  'PROGRAMAÇÃO 83.20',
  'PROGRAMAÇÃO 52.20',
  'SUPERAVIT 73.10',
  'CONTRATOS SERVIÇOS ESSENCIAIS'
];
 
const ABAS_REPASSES = [
  'RESUMO',
  'DPRF- CONDENSADO',
  'DER- CONDENSADO',
  'SEMAD- CONDENSADO'
];
 
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
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
 
function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 1) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    let temDado = false;
    for (let v of vals) { if (v && v !== '') { temDado = true; break; } }
    if (!temDado) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j] || '';
    rows.push(obj);
  }
  return { headers, rows };
}
 
async function lerAbaPorNome(sheetId, nomeAba) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nomeAba)}`;
    const res = await axios.get(url, { timeout: 15000 });
    const parsed = parseCSV(res.data);
    return { headers: parsed.headers, rows: parsed.rows, erro: null };
  } catch (e) {
    return { headers: [], rows: [], erro: e.message };
  }
}
 
app.get('/api/dados', async (req, res) => {
  try {
    const cpeResultados = {};
    const repassesResultados = {};
    
    const promisesCPE = ABAS_CPE.map(async (nomeAba) => {
      const dados = await lerAbaPorNome(SHEET_CPE, nomeAba);
      if (dados.rows.length > 0) cpeResultados[nomeAba] = dados;
    });
    
    const promisesRep = ABAS_REPASSES.map(async (nomeAba) => {
      const dados = await lerAbaPorNome(SHEET_REPASSES, nomeAba);
      if (dados.rows.length > 0) repassesResultados[nomeAba] = dados;
    });
    
    await Promise.all([...promisesCPE, ...promisesRep]);
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      data: { cpe: cpeResultados, repasses: repassesResultados }
    });
  } catch (e) {
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});
 
app.get('/api/debug', async (req, res) => {
  const debug = { cpe: {}, repasses: {} };
  for (const aba of ABAS_CPE) {
    const dados = await lerAbaPorNome(SHEET_CPE, aba);
    debug.cpe[aba] = { total: dados.rows.length, headers: dados.headers, amostra: dados.rows.slice(0, 3), erro: dados.erro };
  }
  for (const aba of ABAS_REPASSES) {
    const dados = await lerAbaPorNome(SHEET_REPASSES, aba);
    debug.repasses[aba] = { total: dados.rows.length, headers: dados.headers, amostra: dados.rows.slice(0, 3), erro: dados.erro };
  }
  res.json(debug);
});
 
app.get('/health', (req, res) => res.json({ status: 'ok' }));
 
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard CPE 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root { --preto: #373435; --dourado: #A08F63; --dourado-claro: #C4B287; --bg: #FAF8F3; --bg-card: #FFFFFF; --bg-soft: #F2EFE6; --texto: #373435; --texto-soft: #5A5A5A; --texto-mute: #8A8A8A; --linha: #E0DCD0; --positivo: #6B5B3A; --aviso: #B47B2A; --perigo: #8B1A1A; --sombra: 0 1px 3px rgba(55,52,53,0.04), 0 4px 16px rgba(55,52,53,0.04); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--texto); line-height: 1.5; min-height: 100vh; }
.header { background: var(--preto); color: #FFF; padding: 20px 40px; border-bottom: 3px solid var(--dourado); }
.header-top { display: flex; justify-content: space-between; align-items: center; max-width: 1600px; margin: 0 auto; gap: 24px; }
.header-info h1 { font-family: 'Source Serif Pro', serif; font-size: 26px; color: #FFF; }
.header-info .subtitle { font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dourado-claro); }
.refresh-btn { background: var(--dourado); color: var(--preto); border: none; padding: 10px 18px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.refresh-btn:hover { background: var(--dourado-claro); }
.last-update { font-size: 10px; color: #FFF; opacity: 0.75; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
.status-line { background: rgba(255,255,255,0.08); padding: 8px 40px; text-align: center; font-size: 11px; color: #FFF; font-family: 'JetBrains Mono', monospace; }
.status-line.error { background: var(--perigo); }
.status-line.success { background: rgba(160, 143, 99, 0.4); }
.main { max-width: 1600px; margin: 0 auto; padding: 28px 40px; }
.tabs-nav { display: flex; gap: 4px; border-bottom: 2px solid var(--linha); margin-bottom: 24px; flex-wrap: wrap; }
.tab-btn { background: transparent; border: none; padding: 12px 20px; font-size: 13px; font-weight: 600; color: var(--texto-soft); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; font-family: inherit; }
.tab-btn.active { color: var(--preto); border-bottom-color: var(--dourado); }
.tab-content { display: none; }
.tab-content.active { display: block; }
.filters { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 20px 24px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 20px; box-shadow: var(--sombra); }
.filter-group { display: flex; flex-direction: column; gap: 6px; }
.filter-group label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-mute); }
.filter-group select { background: var(--bg); border: 1px solid var(--linha); padding: 8px 12px; border-radius: 4px; font-size: 13px; color: var(--texto); cursor: pointer; font-family: inherit; }
.view-toggle { display: flex; flex-direction: column; gap: 6px; }
.toggle-buttons { display: flex; background: var(--bg-soft); border-radius: 4px; padding: 2px; border: 1px solid var(--linha); }
.toggle-btn { background: transparent; border: none; padding: 7px 12px; border-radius: 3px; font-size: 11px; font-weight: 600; color: var(--texto-soft); cursor: pointer; text-transform: uppercase; font-family: inherit; }
.toggle-btn.active { background: var(--preto); color: #FFF; }
.section-title { font-family: 'Source Serif Pro', serif; font-size: 20px; font-weight: 700; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--dourado); display: flex; align-items: baseline; gap: 12px; color: var(--texto); }
.section-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--dourado); }
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
.kpi-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.kpi { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 18px 20px; box-shadow: var(--sombra); position: relative; overflow: hidden; }
.kpi::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--preto); }
.kpi.gold::before { background: var(--dourado); }
.kpi.positivo::before { background: var(--positivo); }
.kpi.aviso::before { background: var(--aviso); }
.kpi.perigo::before { background: var(--perigo); }
.kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-mute); margin-bottom: 6px; }
.kpi-value { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 600; color: var(--texto); margin-bottom: 4px; word-break: break-word; }
.kpi-value.alerta { color: var(--perigo); }
.kpi-value.aviso { color: var(--aviso); }
.kpi-detail { font-size: 11px; color: var(--texto-soft); }
.charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
.chart-card { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; padding: 20px 24px; box-shadow: var(--sombra); }
.chart-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-soft); margin-bottom: 16px; }
.chart-container { position: relative; height: 320px; }
.table-card { background: var(--bg-card); border: 1px solid var(--linha); border-radius: 6px; overflow: hidden; box-shadow: var(--sombra); margin-top: 16px; }
.table-header { padding: 18px 24px; border-bottom: 1px solid var(--linha); display: flex; justify-content: space-between; align-items: center; }
.table-header h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--texto-soft); }
.table-meta { font-size: 11px; color: var(--texto-mute); font-family: 'JetBrains Mono', monospace; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: var(--bg-soft); }
th { padding: 12px 14px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--texto-soft); border-bottom: 1px solid var(--linha); white-space: nowrap; }
th.num { text-align: right; }
td { padding: 10px 14px; border-bottom: 1px solid var(--linha); color: var(--texto); }
td.num { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
tbody tr:hover { background: var(--bg-soft); }
tr.vencido { background: #FFEBEE; }
tr.proximo30 { background: #FFE0B2; }
tr.proximo60 { background: #FFF9C4; }
.tag { display: inline-block; padding: 3px 9px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
.tag-verde { background: #C8E6C9; color: #1B5E20; border: 1px solid #66BB6A; }
.tag-amarelo { background: #FFF9C4; color: #5D4E00; border: 1px solid #FBC02D; font-weight: 700; }
.tag-laranja { background: #FFCC80; color: #5D2E00; border: 1px solid #E67E22; font-weight: 700; }
.tag-vermelho { background: #FFAB91; color: #B71C1C; border: 1px solid #C62828; font-weight: 700; }
.tag-contratual { background: #E8DCC0; color: #5C4519; }
.tag-essencial { background: #D9D6CD; color: var(--preto); }
.footer { max-width: 1600px; margin: 40px auto 0; padding: 24px 40px 32px; border-top: 1px solid var(--linha); font-size: 11px; color: var(--texto-mute); text-align: center; }
.debug { background: #FFF8DC; border: 1px solid #FFD700; padding: 16px; margin: 16px 0; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.8; }
.aba-section { margin-bottom: 16px; padding: 12px; background: var(--bg-soft); border-radius: 4px; border-left: 3px solid var(--dourado); }
@media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } .charts-grid { grid-template-columns: 1fr; } .filters { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .header, .main, .status-line { padding-left: 20px; padding-right: 20px; } .kpi-grid, .kpi-grid-3 { grid-template-columns: 1fr; } .filters { grid-template-columns: 1fr; } }
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
let state = { cpe: {}, repasses: {}, registrosCPE: [], registrosContratos: [], filtros: { fonte: 'TODAS', elemento: 'TODOS', tipo: 'TODOS', aba: 'TODAS', visao: 'absoluto' } };
let chartElem = null, chartTipo = null, chartRepasses = null, chartContratos = null;
 
async function carregarDados() {
  setStatus('Buscando dados das 2 planilhas...', 'loading');
  try {
    const res = await fetch('/api/dados');
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.msg);
    
    state.cpe = json.data.cpe || {};
    state.repasses = json.data.repasses || {};
    
    state.registrosCPE = [];
    state.registrosContratos = [];
    for (const [nomeAba, dadosAba] of Object.entries(state.cpe)) {
      (dadosAba.rows || []).forEach(r => {
        const reg = { ...r, __aba: nomeAba };
        state.registrosCPE.push(reg);
        // Identifica contratos pela aba
        if (nomeAba.toUpperCase().includes('CONTRATO')) {
          state.registrosContratos.push(reg);
        }
      });
    }
    
    setStatus('✓ CPE: ' + state.registrosCPE.length + ' registros (' + state.registrosContratos.length + ' contratos) | Repasses: ' + Object.keys(state.repasses).length + ' abas', 'success');
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
 
// VALORES REAIS - sem abreviação K/M
const fmtBR = v => isNaN(v) || v == null ? 'R$ 0,00' : 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtPct = v => isNaN(v) || v == null ? '-' : (v*100).toFixed(1).replace('.',',') + '%';
 
const normFonte = (s, aba) => {
  if (aba && aba.includes('83.20')) return 'DER';
  if (aba && aba.includes('52.20')) return 'SEMAD';
  if (aba && aba.includes('73.10')) return 'DPRF';
  if (aba && aba.toUpperCase().includes('DER')) return 'DER';
  if (aba && aba.toUpperCase().includes('SEMAD')) return 'SEMAD';
  if (aba && aba.toUpperCase().includes('DPRF')) return 'DPRF';
  if (!s) return '';
  const str = String(s).toUpperCase();
  if (str.includes('DPRF') || str.includes('73')) return 'DPRF';
  if (str.includes('DER') || str.includes('83')) return 'DER';
  if (str.includes('SEMAD') || str.includes('52')) return 'SEMAD';
  return str;
};
 
// Identifica tipo Contratual ou Essencial baseado na aba ou nos dados
function identificarTipo(r) {
  if (r.__aba && r.__aba.toUpperCase().includes('ESSENCIAL')) return 'ESSENCIAL';
  // Procura coluna "TIPO" ou similar
  for (const k of Object.keys(r)) {
    const ku = k.toUpperCase();
    if (ku.includes('TIPO')) {
      const val = String(r[k] || '').toUpperCase();
      if (val.includes('CONTRATUAL') || val.includes('CONTRATO')) return 'CONTRATUAL';
      if (val.includes('ESSENCIAL')) return 'ESSENCIAL';
    }
  }
  // Default: contratual (PROGRAMAÇÃO e SUPERAVIT)
  if (r.__aba && (r.__aba.toUpperCase().includes('PROGRAMA') || r.__aba.toUpperCase().includes('SUPERAVIT'))) return 'CONTRATUAL';
  return 'OUTRO';
}
 
function getFieldFlexivel(obj, ...termos) {
  for (const k of Object.keys(obj)) {
    const ku = k.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    for (const t of termos) {
      const tu = t.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
      if (ku.includes(tu)) {
        const val = obj[k];
        if (val !== undefined && val !== null && val !== '') return val;
      }
    }
  }
  return null;
}
 
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  s = s.replace(/R\\$/g, '').replace(/\\s/g, '').replace(/\\u00a0/g, '').trim();
  if (s.includes(',')) s = s.replace(/\\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
 
function parseData(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  // Tenta DD/MM/YYYY
  let m = s.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
  // Tenta YYYY-MM-DD
  m = s.match(/(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
 
function renderizar() {
  document.getElementById('main').innerHTML = \`
    <div class="tabs-nav">
      <button class="tab-btn active" data-tab="cpe">📊 CPE — Execução</button>
      <button class="tab-btn" data-tab="contratos">📋 Contratos</button>
      <button class="tab-btn" data-tab="repasses">💰 Repasses</button>
      <button class="tab-btn" data-tab="debug">🔍 Debug</button>
    </div>
    
    <div class="tab-content active" id="tab-cpe">
      <div class="filters">
        <div class="filter-group"><label>Fonte</label><select id="f-fonte"><option value="TODAS">Todas</option><option value="DPRF">DPRF (73.10)</option><option value="DER">DER (83.20)</option><option value="SEMAD">SEMAD (52.20)</option></select></div>
        <div class="filter-group"><label>Elemento</label><select id="f-elemento"><option value="TODOS">Todos</option></select></div>
        <div class="filter-group"><label>Tipo</label><select id="f-tipo"><option value="TODOS">Todos</option><option value="CONTRATUAL">Contratual</option><option value="ESSENCIAL">Essencial</option></select></div>
        <div class="filter-group"><label>Aba</label><select id="f-aba"><option value="TODAS">Todas</option></select></div>
        <div class="view-toggle"><label>Visão</label><div class="toggle-buttons"><button class="toggle-btn" data-v="contabil">Contábil</button><button class="toggle-btn" data-v="financeira">Financeira</button><button class="toggle-btn active" data-v="absoluto">Absoluto</button></div></div>
      </div>
      <h2 class="section-title"><span class="section-num">01</span>Resumo Executivo</h2>
      <div class="kpi-grid" id="kpis"></div>
      <h2 class="section-title"><span class="section-num">02</span>Distribuição Orçamentária</h2>
      <div class="charts-grid">
        <div class="chart-card"><div class="chart-title">Execução por Elemento</div><div class="chart-container"><canvas id="ch-elem"></canvas></div></div>
        <div class="chart-card"><div class="chart-title">Contratual vs Essencial</div><div class="chart-container"><canvas id="ch-tipo"></canvas></div></div>
      </div>
      <h2 class="section-title"><span class="section-num">03</span>Detalhamento por Aba</h2>
      <div id="container-abas-cpe"></div>
    </div>
    
    <div class="tab-content" id="tab-contratos">
      <h2 class="section-title"><span class="section-num">C1</span>Alerta de Vigência</h2>
      <div class="kpi-grid-3" id="kpis-contratos"></div>
      <h2 class="section-title"><span class="section-num">C2</span>Distribuição de Contratos por Status</h2>
      <div class="chart-card"><div class="chart-title">Status de Vigência dos Contratos</div><div class="chart-container"><canvas id="ch-contratos"></canvas></div></div>
      <h2 class="section-title"><span class="section-num">C3</span>Contratos com Etiquetas de Vigência</h2>
      <div id="tabela-contratos"></div>
    </div>
    
    <div class="tab-content" id="tab-repasses">
      <h2 class="section-title"><span class="section-num">R1</span>Saldos Atuais por Fonte</h2>
      <div class="kpi-grid" id="kpis-repasses"></div>
      <h2 class="section-title"><span class="section-num">R2</span>Saldo Disponível por Fonte</h2>
      <div class="chart-card"><div class="chart-title">Distribuição dos Saldos</div><div class="chart-container"><canvas id="ch-repasses"></canvas></div></div>
      <h2 class="section-title"><span class="section-num">R3</span>Detalhamento por Aba</h2>
      <div id="container-abas-repasses"></div>
    </div>
    
    <div class="tab-content" id="tab-debug">
      <h2 class="section-title"><span class="section-num">D1</span>Estrutura das Planilhas</h2>
      <div class="debug" id="debug-info"></div>
    </div>
    
    <footer class="footer">Dashboard CPE 2026 — Conectado às planilhas CPE + Repasses</footer>
  \`;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('tab-' + e.target.dataset.tab).classList.add('active');
    });
  });
  
  ['f-fonte', 'f-elemento', 'f-tipo', 'f-aba'].forEach(id => {
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
  
  popularFiltros();
  atualizar();
  renderDebug();
}
 
function popularFiltros() {
  const elemSel = document.getElementById('f-elemento');
  if (elemSel) {
    const elems = [...new Set(state.registrosCPE.map(r => getFieldFlexivel(r, 'ELEMENTO') || ''))].filter(Boolean).sort();
    elemSel.innerHTML = '<option value="TODOS">Todos</option>' + elems.map(e => '<option value="' + e + '">' + e + '</option>').join('');
  }
  const abaSel = document.getElementById('f-aba');
  if (abaSel) {
    abaSel.innerHTML = '<option value="TODAS">Todas</option>' + Object.keys(state.cpe).map(a => '<option value="' + a + '">' + a + '</option>').join('');
  }
}
 
function filtrarCPE() {
  const f = state.filtros;
  return state.registrosCPE.filter(r => {
    const fonte = normFonte(getFieldFlexivel(r, 'FONTE'), r.__aba);
    const elem = getFieldFlexivel(r, 'ELEMENTO') || '';
    const tipo = identificarTipo(r);
    if (f.fonte !== 'TODAS' && fonte !== f.fonte) return false;
    if (f.elemento !== 'TODOS' && elem !== f.elemento) return false;
    if (f.tipo !== 'TODOS' && tipo !== f.tipo) return false;
    if (f.aba !== 'TODAS' && r.__aba !== f.aba) return false;
    return true;
  });
}
 
// Busca valor com MUITAS variações de campo
const valorPlano = r => num(getFieldFlexivel(r, 'VALOR ANUAL AUTORIZADO', 'VALOR ANUAL', 'VALOR AUTORIZADO', 'AUTORIZADO', 'VALOR TOTAL', 'PLANO', 'TOTAL ANUAL', 'PT', 'PLANO TRABALHO', 'VALOR PT'));
const valorEmp = r => num(getFieldFlexivel(r, 'EMPENHADO', 'VALOR EMPENHADO', 'EMPENHO', 'TOTAL EMPENHADO', 'EMPENHADO ANO'));
const valorLiq = r => num(getFieldFlexivel(r, 'LIQUIDADO', 'VALOR LIQUIDADO', 'LIQUIDACAO', 'TOTAL LIQUIDADO'));
const valorPag = r => num(getFieldFlexivel(r, 'PAGO', 'VALOR PAGO', 'PAGAMENTO', 'TOTAL PAGO'));
 
function calcResumo() {
  const dados = filtrarCPE();
  const plano = dados.reduce((s, r) => s + valorPlano(r), 0);
  const emp = dados.reduce((s, r) => s + valorEmp(r), 0);
  const liq = dados.reduce((s, r) => s + valorLiq(r), 0);
  const pag = dados.reduce((s, r) => s + valorPag(r), 0);
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
    { l: 'Convênio Total', v: fmtBR(r.conv), d: 'Plano: ' + fmtBR(r.plano), c: 'gold' },
    { l: 'Empenhado', v: fmtBR(r.emp), d: fmtPct(r.execPct) + ' do plano', c: '' },
    { l: 'Liquidado', v: fmtBR(r.liq), d: 'A liquidar: ' + fmtBR(r.aLiq), c: '' },
    { l: 'Pago', v: fmtBR(r.pag), d: 'A pagar: ' + fmtBR(r.aPag), c: 'positivo' },
    { l: sL, v: fmtBR(sV), d: sD, c: sV < 0 ? 'perigo' : 'positivo' }
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k => '<div class="kpi ' + k.c + '"><div class="kpi-label">' + k.l + '</div><div class="kpi-value">' + k.v + '</div><div class="kpi-detail">' + k.d + '</div></div>').join('');
}
 
// Extrai dias até vencer do contrato
function diasAteFim(r) {
  const dataFim = parseData(getFieldFlexivel(r, 'FIM VIGENCIA', 'FIM DA VIGENCIA', 'DATA FIM VIGENCIA', 'FIM DE VIGENCIA', 'VENCIMENTO', 'FIM CONTRATO', 'DATA FIM', 'TERMINO'));
  if (!dataFim) return null;
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  return Math.floor((dataFim - hoje) / (1000 * 60 * 60 * 24));
}
 
function categorizarContrato(dias) {
  if (dias === null) return 'sem_data';
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'critico'; // ≤30 dias - VERMELHO
  if (dias <= 60) return 'alerta'; // ≤60 dias - AMARELO
  return 'vigente'; // > 60 dias - VERDE
}
 
function renderKPIsContratos() {
  const contratos = state.registrosContratos;
  const stats = { vencido: 0, critico: 0, alerta: 0, vigente: 0, sem_data: 0 };
  
  contratos.forEach(c => {
    const dias = diasAteFim(c);
    const cat = categorizarContrato(dias);
    stats[cat]++;
  });
  
  const kpis = [
    { l: '🔴 Vencidos / ≤30 dias (CRÍTICO)', v: (stats.vencido + stats.critico), d: stats.vencido + ' vencidos, ' + stats.critico + ' críticos', c: 'perigo', alerta: (stats.vencido + stats.critico) > 0 ? 'alerta' : '' },
    { l: '🟡 Vencendo em até 60 dias', v: stats.alerta, d: 'Atenção necessária', c: 'aviso', alerta: stats.alerta > 0 ? 'aviso' : '' },
    { l: '🟢 Vigentes (>60 dias)', v: stats.vigente, d: 'Contratos em dia', c: 'positivo', alerta: '' }
  ];
  
  const el = document.getElementById('kpis-contratos');
  if (el) el.innerHTML = kpis.map(k => '<div class="kpi ' + k.c + '"><div class="kpi-label">' + k.l + '</div><div class="kpi-value ' + k.alerta + '">' + k.v + '</div><div class="kpi-detail">' + k.d + '</div></div>').join('');
  
  // Gráfico de status
  if (chartContratos) chartContratos.destroy();
  const ctx = document.getElementById('ch-contratos');
  if (ctx) {
    chartContratos = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Vencidos', 'Críticos (≤30 dias)', 'Alerta (≤60 dias)', 'Vigentes (>60 dias)', 'Sem data'],
        datasets: [{
          data: [stats.vencido, stats.critico, stats.alerta, stats.vigente, stats.sem_data],
          backgroundColor: ['#B71C1C', '#E67E22', '#FBC02D', '#6B5B3A', '#9E9E9E'],
          borderWidth: 2,
          borderColor: '#FFF'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, cutout: '50%' }
    });
  }
}
 
function renderTabelaContratos() {
  const container = document.getElementById('tabela-contratos');
  if (!container) return;
  
  const contratos = [...state.registrosContratos].sort((a,b) => {
    const da = diasAteFim(a);
    const db = diasAteFim(b);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  
  if (contratos.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 40px; color: var(--texto-mute);">Nenhum contrato encontrado</p>';
    return;
  }
  
  // Pega headers do primeiro contrato
  const primeiraAba = contratos[0].__aba;
  const headers = state.cpe[primeiraAba]?.headers || Object.keys(contratos[0]).filter(k => k !== '__aba');
  
  let html = '<div class="table-card"><div class="table-header"><h3>Contratos com Vigência</h3><span class="table-meta">' + contratos.length + ' contratos</span></div>';
  html += '<div style="overflow-x: auto; max-height: 600px;"><table><thead><tr>';
  html += '<th>Status</th><th>Dias</th>';
  headers.forEach(h => { html += '<th>' + (h || '') + '</th>'; });
  html += '</tr></thead><tbody>';
  
  contratos.forEach(c => {
    const dias = diasAteFim(c);
    const cat = categorizarContrato(dias);
    let rowClass = '', tagClass = 'tag-verde', tagLabel = '🟢 VIGENTE';
    
    if (cat === 'vencido') { rowClass = 'vencido'; tagClass = 'tag-vermelho'; tagLabel = '🔴 VENCIDO'; }
    else if (cat === 'critico') { rowClass = 'proximo30'; tagClass = 'tag-vermelho'; tagLabel = '🔴 ≤30 DIAS'; }
    else if (cat === 'alerta') { rowClass = 'proximo60'; tagClass = 'tag-amarelo'; tagLabel = '🟡 ≤60 DIAS'; }
    else if (cat === 'sem_data') { tagClass = ''; tagLabel = 'Sem data'; }
    
    html += '<tr class="' + rowClass + '">';
    html += '<td><span class="tag ' + tagClass + '">' + tagLabel + '</span></td>';
    html += '<td class="num"><strong>' + (dias !== null ? dias : '-') + '</strong></td>';
    headers.forEach(h => {
      const val = c[h] || '';
      const isNum = !isNaN(num(val)) && num(val) !== 0 && String(val).match(/[0-9]/);
      html += '<td class="' + (isNum ? 'num' : '') + '">' + val + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  container.innerHTML = html;
}
 
function calcSaldoFonte(nomeFonte) {
  const abaNome = nomeFonte + '- CONDENSADO';
  const aba = state.repasses[abaNome];
  if (!aba || !aba.rows) return 0;
  let saldo = 0;
  aba.rows.forEach(r => {
    for (const k of Object.keys(r)) {
      const ku = k.toUpperCase();
      if (ku.includes('SALDO') || ku.includes('DISPONIVEL') || ku.includes('DISPONÍVEL')) {
        const v = num(r[k]);
        if (v > 0) saldo += v;
      }
    }
  });
  return saldo;
}
 
function renderKPIsRepasses() {
  let saldoDPRF = 0, saldoDER = 0, saldoSEMAD = 0;
  
  const resumo = state.repasses['RESUMO'];
  if (resumo && resumo.rows) {
    resumo.rows.forEach(r => {
      Object.entries(r).forEach(([k, v]) => {
        const ku = String(k).toUpperCase();
        const val = num(v);
        if (val > 0 && val < 100000000) {
          if (ku.includes('DPRF') || ku.includes('73')) saldoDPRF = Math.max(saldoDPRF, val);
          else if (ku.includes('DER') || ku.includes('83')) saldoDER = Math.max(saldoDER, val);
          else if (ku.includes('SEMAD') || ku.includes('52')) saldoSEMAD = Math.max(saldoSEMAD, val);
        }
      });
    });
  }
  
  if (saldoDPRF === 0) saldoDPRF = calcSaldoFonte('DPRF');
  if (saldoDER === 0) saldoDER = calcSaldoFonte('DER');
  if (saldoSEMAD === 0) saldoSEMAD = calcSaldoFonte('SEMAD');
  
  const totalSaldo = saldoDPRF + saldoDER + saldoSEMAD;
  const totalConv = CONFIG.CONVENIOS.DPRF + CONFIG.CONVENIOS.DER + CONFIG.CONVENIOS.SEMAD;
  
  const kpis = [
    { l: 'Saldo Total Disponível', v: fmtBR(totalSaldo), d: 'De ' + fmtBR(totalConv) + ' (convênios)', c: 'gold' },
    { l: 'DPRF (73.10)', v: fmtBR(saldoDPRF), d: 'Convênio: ' + fmtBR(CONFIG.CONVENIOS.DPRF), c: 'positivo' },
    { l: 'DER (83.20)', v: fmtBR(saldoDER), d: 'Convênio: ' + fmtBR(CONFIG.CONVENIOS.DER), c: 'positivo' },
    { l: 'SEMAD (52.20)', v: fmtBR(saldoSEMAD), d: 'Convênio: ' + fmtBR(CONFIG.CONVENIOS.SEMAD), c: 'positivo' },
    { l: 'Abas Carregadas', v: Object.keys(state.repasses).length, d: 'da planilha Repasses', c: '' }
  ];
  
  const el = document.getElementById('kpis-repasses');
  if (el) el.innerHTML = kpis.map(k => '<div class="kpi ' + k.c + '"><div class="kpi-label">' + k.l + '</div><div class="kpi-value">' + k.v + '</div><div class="kpi-detail">' + k.d + '</div></div>').join('');
  
  if (chartRepasses) chartRepasses.destroy();
  const ctx = document.getElementById('ch-repasses');
  if (ctx) {
    chartRepasses = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['DPRF (73.10)', 'DER (83.20)', 'SEMAD (52.20)'],
        datasets: [
          { label: 'Convênio Total', data: [CONFIG.CONVENIOS.DPRF, CONFIG.CONVENIOS.DER, CONFIG.CONVENIOS.SEMAD], backgroundColor: '#C4B287' },
          { label: 'Saldo Disponível', data: [saldoDPRF, saldoDER, saldoSEMAD], backgroundColor: '#373435' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtBR(ctx.parsed.y) } } }, scales: { y: { ticks: { callback: v => 'R$ ' + (v/1000).toLocaleString('pt-BR') + 'k' } } } }
    });
  }
}
 
function renderTabelas(container_id, abas_data, filtro_aba) {
  const container = document.getElementById(container_id);
  if (!container) return;
  let html = '';
  for (const [nomeAba, dadosAba] of Object.entries(abas_data)) {
    const rows = dadosAba.rows || [];
    const headers = dadosAba.headers || [];
    if (rows.length === 0) continue;
    if (filtro_aba && filtro_aba !== 'TODAS' && filtro_aba !== nomeAba) continue;
    
    html += '<div class="table-card"><div class="table-header"><h3>' + nomeAba + '</h3><span class="table-meta">' + rows.length + ' registros</span></div>';
    html += '<div style="overflow-x: auto; max-height: 500px;"><table><thead><tr>';
    headers.forEach(h => { html += '<th>' + (h || '') + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr>';
      headers.forEach(h => {
        const val = r[h] || '';
        const isNum = !isNaN(num(val)) && num(val) !== 0 && String(val).match(/[0-9]/);
        html += '<td class="' + (isNum ? 'num' : '') + '">' + val + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }
  container.innerHTML = html || '<p style="text-align:center; padding: 40px; color: var(--texto-mute);">Nenhuma aba carregada.</p>';
}
 
function renderDebug() {
  const debug = document.getElementById('debug-info');
  if (!debug) return;
  let html = '<strong style="font-size: 14px;">📊 PLANILHA CPE:</strong><br><br>';
  for (const [nomeAba, dadosAba] of Object.entries(state.cpe)) {
    html += '<div class="aba-section"><strong>✓ ' + nomeAba + '</strong> (' + (dadosAba.rows?.length || 0) + ' linhas)<br>';
    html += '<span style="color: var(--texto-soft);">Colunas:</span> ' + (dadosAba.headers || []).join(' | ') + '</div>';
  }
  html += '<br><strong style="font-size: 14px;">💰 PLANILHA REPASSES:</strong><br><br>';
  for (const [nomeAba, dadosAba] of Object.entries(state.repasses)) {
    html += '<div class="aba-section"><strong>✓ ' + nomeAba + '</strong> (' + (dadosAba.rows?.length || 0) + ' linhas)<br>';
    html += '<span style="color: var(--texto-soft);">Colunas:</span> ' + (dadosAba.headers || []).join(' | ') + '</div>';
  }
  debug.innerHTML = html;
}
 
function renderCharts() {
  const dados = filtrarCPE();
  const porE = {};
  dados.forEach(d => {
    const e = getFieldFlexivel(d, 'ELEMENTO') || 'N/D';
    if (!porE[e]) porE[e] = { desc: (getFieldFlexivel(d, 'DESCRICAO ELEMENTO', 'DESCRIÇÃO ELEMENTO', 'DESCRIÇÃO', 'DESCRICAO') || e), plano: 0, emp: 0, pag: 0 };
    porE[e].plano += valorPlano(d);
    porE[e].emp += valorEmp(d);
    porE[e].pag += valorPag(d);
  });
  const items = Object.values(porE).filter(i => i.plano > 0 || i.emp > 0).sort((a,b) => b.plano - a.plano).slice(0, 10);
  
  if (chartElem) chartElem.destroy();
  if (items.length > 0 && document.getElementById('ch-elem')) {
    chartElem = new Chart(document.getElementById('ch-elem'), {
      type: 'bar',
      data: { labels: items.map(i => String(i.desc).substring(0, 30)), datasets: [
        { label: 'Plano', data: items.map(i => i.plano), backgroundColor: '#C4B287' },
        { label: 'Empenhado', data: items.map(i => i.emp), backgroundColor: '#A08F63' },
        { label: 'Pago', data: items.map(i => i.pag), backgroundColor: '#373435' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtBR(ctx.parsed.x) } } }, scales: { x: { ticks: { callback: v => 'R$ ' + (v/1000).toLocaleString('pt-BR') + 'k' } } } }
    });
  } else if (document.getElementById('ch-elem')) {
    // Mostra mensagem se não há dados
    const ctx = document.getElementById('ch-elem').getContext('2d');
    ctx.font = '14px Inter';
    ctx.fillStyle = '#8A8A8A';
    ctx.textAlign = 'center';
    ctx.fillText('Sem dados para exibir', document.getElementById('ch-elem').width / 2, 100);
  }
  
  const porT = { CONTRATUAL: 0, ESSENCIAL: 0, OUTRO: 0 };
  dados.forEach(d => {
    const t = identificarTipo(d);
    const val = valorPlano(d);
    if (porT[t] !== undefined) porT[t] += val;
  });
  
  if (chartTipo) chartTipo.destroy();
  if (document.getElementById('ch-tipo')) {
    const total = porT.CONTRATUAL + porT.ESSENCIAL + porT.OUTRO;
    if (total > 0) {
      chartTipo = new Chart(document.getElementById('ch-tipo'), {
        type: 'doughnut',
        data: { 
          labels: ['Contratual', 'Essencial', 'Outro'].filter((_, i) => [porT.CONTRATUAL, porT.ESSENCIAL, porT.OUTRO][i] > 0), 
          datasets: [{ 
            data: [porT.CONTRATUAL, porT.ESSENCIAL, porT.OUTRO].filter(v => v > 0), 
            backgroundColor: ['#A08F63', '#373435', '#C4B287'], 
            borderWidth: 2, 
            borderColor: '#FFF' 
          }] 
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmtBR(ctx.parsed) } } }, cutout: '60%' }
      });
    }
  }
}
 
function atualizar() {
  renderKPIs();
  renderKPIsContratos();
  renderTabelaContratos();
  renderKPIsRepasses();
  renderTabelas('container-abas-cpe', state.cpe, state.filtros.aba);
  renderTabelas('container-abas-repasses', state.repasses, null);
  renderCharts();
  renderDebug();
}
 
window.addEventListener('load', carregarDados);
</script>
</body>
</html>`;
 
app.get('/', (req, res) => res.send(DASHBOARD_HTML));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Rodando na porta ' + PORT));
