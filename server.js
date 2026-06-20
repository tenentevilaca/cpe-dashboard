const express = require('express');
const cors = require('cors');
const axios = require('axios');
 
const app = express();
app.use(cors());
app.use(express.json());
 
const SHEET_CPE = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REP = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';
 
async function lerCSV(id) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
    const res = await axios.get(url, { timeout: 10000 });
    const lines = res.data.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const dados = [];
    
    for (let i = 1; i < lines.length; i++) {
      const obj = {};
      const vals = lines[i].split(',').map(v => v.trim());
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = vals[j] || '';
      }
      dados.push(obj);
    }
    return dados;
  } catch (e) {
    return [];
  }
}
 
app.get('/api/dados', async (req, res) => {
  try {
    const cpe = await lerCSV(SHEET_CPE);
    const rep = await lerCSV(SHEET_REP);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      data: { cpe: { Dados: cpe }, repasses: { Dados: rep } }
    });
  } catch (e) {
    res.status(500).json({ status: 'erro', msg: e.message });
  }
});
 
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
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
  --sombra: 0 1px 3px rgba(55,52,53,0.04), 0 4px 16px rgba(55,52,53,0.04);
}
 
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--bg);
  color: var(--texto);
  line-height: 1.5;
  min-height: 100vh;
}
 
.header {
  background: var(--preto);
  color: #FFFFFF;
  padding: 20px 40px;
  border-bottom: 3px solid var(--dourado);
}
 
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1600px;
  margin: 0 auto;
  gap: 24px;
}
 
.header-info h1 {
  font-family: 'Source Serif Pro', serif;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 2px;
  color: #FFFFFF;
}
 
.header-info .subtitle {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dourado-claro);
}
 
.refresh-btn {
  background: var(--dourado);
  color: var(--preto);
  border: none;
  padding: 10px 18px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
 
.refresh-btn:hover { background: var(--dourado-claro); }
.refresh-btn:disabled { opacity: 0.6; }
 
.status-line {
  background: rgba(255,255,255,0.08);
  padding: 8px 40px;
  text-align: center;
  font-size: 11px;
  color: #FFFFFF;
}
 
.main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 28px 40px;
}
 
.data-display {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}
 
.data-card {
  background: var(--bg-card);
  border: 1px solid var(--linha);
  border-radius: 6px;
  padding: 20px;
  box-shadow: var(--sombra);
}
 
.data-card h3 {
  font-family: 'Source Serif Pro', serif;
  font-size: 18px;
  color: var(--preto);
  margin-bottom: 12px;
  border-bottom: 2px solid var(--dourado);
  padding-bottom: 8px;
}
 
.data-sheet {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-soft);
  border-left: 4px solid var(--dourado);
  border-radius: 4px;
}
 
.data-sheet strong {
  display: block;
  font-size: 13px;
  color: var(--preto);
  margin-bottom: 4px;
}
 
.data-sheet .count {
  font-size: 11px;
  color: var(--texto-mute);
  font-family: 'JetBrains Mono', monospace;
}
 
.footer {
  max-width: 1600px;
  margin: 40px auto 0;
  padding: 24px 40px 32px;
  border-top: 1px solid var(--linha);
  font-size: 11px;
  color: var(--texto-mute);
  text-align: center;
}
 
@media (max-width: 768px) {
  .header, .main { padding: 20px; }
  .data-display { grid-template-columns: 1fr; }
}
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
      <button class="refresh-btn" onclick="carregar()">
        <span>🔄 Atualizar Dados</span>
      </button>
    </div>
  </div>
</header>
 
<div class="status-line" id="status">Carregando...</div>
 
<main class="main">
  <div class="data-display" id="container">
    <div style="text-align:center; padding: 40px;">Carregando dados...</div>
  </div>
</main>
 
<footer class="footer">Dashboard CPE 2026 — Conectado ao Google Sheets</footer>
 
<script>
async function carregar() {
  const status = document.getElementById('status');
  const container = document.getElementById('container');
  
  status.textContent = 'Buscando dados...';
  
  try {
    const res = await fetch('/api/dados');
    const json = await res.json();
    
    if (json.status !== 'ok') throw new Error(json.msg);
    
    status.textContent = '✓ Dados carregados com sucesso';
    const data = json.data;
    
    let html = '';
    
    if (data.cpe && data.cpe.Dados) {
      const qtd = data.cpe.Dados.length;
      html += '<div class="data-card"><h3>📊 CPE</h3>';
      html += '<div class="data-sheet"><strong>Dados</strong><span class="count">' + qtd + ' registros</span></div>';
      html += '</div>';
    }
    
    if (data.repasses && data.repasses.Dados) {
      const qtd = data.repasses.Dados.length;
      html += '<div class="data-card"><h3>💰 Repasses</h3>';
      html += '<div class="data-sheet"><strong>Dados</strong><span class="count">' + qtd + ' registros</span></div>';
      html += '</div>';
    }
    
    container.innerHTML = html || '<p>Sem dados</p>';
    
  } catch (e) {
    status.textContent = '⚠ Erro: ' + e.message;
    container.innerHTML = '<p style="color: red;">Erro ao carregar dados</p>';
  }
}
 
window.addEventListener('load', carregar);
</script>
 
</body>
</html>
  `);
});
 
app.get('/health', (req, res) => res.json({ status: 'ok' }));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Rodando na porta ' + PORT));
