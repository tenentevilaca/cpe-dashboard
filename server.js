const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// IDs das planilhas
const SHEET_CPE_ID = '14_loVs5PklVuyxLVWkxKP2uJhn8inxTovCv9DcYb9Xg';
const SHEET_REPASSES_ID = '1nU9jcXC6zhtA_lnYrUDVDvF0U-4YONPU';

// Função para converter CSV em JSON
function csvToJson(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    const obj = {};
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    
    let temDado = false;
    for (let v of values) {
      if (v && v !== '') {
        temDado = true;
        break;
      }
    }
    
    if (!temDado) continue;
    
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }
    result.push(obj);
  }
  
  return result;
}

// Função para ler planilha via export CSV
async function lerPlanilha(sheetId) {
  try {
    const resultado = {};
    
    // Tenta ler via Google Sheets export
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    
    const response = await axios.get(sheetUrl, { timeout: 10000 });
    const dados = csvToJson(response.data);
    
    resultado['Dados'] = dados;
    return resultado;
  } catch (error) {
    console.error('Erro ao ler planilha:', error.message);
    return { 'Erro': [{ mensagem: error.message }] };
  }
}

// API endpoint
app.get('/api/dados', async (req, res) => {
  try {
    const dataCPE = await lerPlanilha(SHEET_CPE_ID);
    const dataRepasses = await lerPlanilha(SHEET_REPASSES_ID);
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      data: {
        cpe: dataCPE,
        repasses: dataRepasses
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'erro',
      mensagem: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Rota raiz (serve o dashboard)
app.get('/', (req, res) => {
  res.send(getDashboardHTML());
});

// Função que retorna o HTML do dashboard
function getDashboardHTML() {
  return require('fs').readFileSync(__dirname + '/dashboard.html', 'utf8');
}

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Dashboard CPE rodando na porta ${PORT}`);
  console.log(`📊 Acesse: http://localhost:${PORT}`);
});
