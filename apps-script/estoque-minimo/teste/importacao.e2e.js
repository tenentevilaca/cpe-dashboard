// Teste de ponta a ponta: executa os .gs com Sheets simulado e HTTP real (curl) contra o CPELOG.
// Uso: U=<numero de policia> P=<senha> node apps-script/estoque-minimo/teste/importacao.e2e.js apps-script/estoque-minimo
// Só lê o CPELOG. Os valores digitados no meio do teste são fictícios e ficam apenas na memória.
const fs = require('fs'), vm = require('vm'), path = require('path'), { execFileSync } = require('child_process');
const dir = process.argv[2];
class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  each(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) f(this.r + i, this.c + j, i, j); }
  setValues(v) { if (v.length !== this.nr || v.some(x => x.length !== this.nc)) throw new Error(`dims ${v.length}x${v[0] && v[0].length} vs ${this.nr}x${this.nc}`); this.each((r, c, i, j) => this.sh.set(r, c, v[i][j])); return this; }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; }
  getFontColors() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.col[(this.r + i) + ':' + (this.c + j)] || '#000000'); o.push(row); } return o; }
  setFontColors(v) { this.each((r, c, i, j) => { this.sh.col[r + ':' + c] = v[i][j]; }); return this; }
  setFontColor(x) { this.each((r, c) => { this.sh.col[r + ':' + c] = x; }); return this; }
  clearContent() { this.each((r, c) => this.sh.set(r, c, '')); return this; }
  getRow() { return this.r; } getColumn() { return this.c; } getNumColumns() { return this.nc; } getNumRows() { return this.nr; } getSheet() { return this.sh; }
  setFontWeight() { return this; } setBackground() { return this; } setWrap() { return this; } setNumberFormat() { return this; } setBackgrounds() { return this; } setFontStyle() { return this; } }
class Sheet { constructor(n) { this.n = n; this.d = {}; this.col = {}; } getName() { return this.n; }
  set(r, c, v) { (this.d[r] = this.d[r] || {})[c] = v; } get(r, c) { const v = (this.d[r] || {})[c]; return v === undefined || v === null ? '' : (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? new Date(v + 'T12:00') : v); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); } setFrozenRows() {} getMaxRows() { return 1000; }
  getLastRow() { const rs = Object.keys(this.d).map(Number).filter(r => Object.values(this.d[r]).some(v => v !== '' && v !== null)); return rs.length ? Math.max(...rs) : 0; }
  getLastColumn() { let m = 0; Object.values(this.d).forEach(row => Object.keys(row).forEach(c => { if (row[c] !== '') m = Math.max(m, +c); })); return m; } }
const sheets = {}, props = { CPELOG_USUARIO: process.env.U, CPELOG_SENHA: process.env.P }, cache = {};
const ss = { getId: () => 'X', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet() {}, getSpreadsheetTimeZone: () => 'America/Sao_Paulo', toast: m => console.log('toast:', m) };
let nReq = 0;
function fetchSync(url, o = {}) {
  nReq++;
  const hf = require('os').tmpdir() + '/h' + nReq, bf = require('os').tmpdir() + '/b' + nReq;
  const args = ['-sS', '-D', hf, '-o', bf, '-X', (o.method || 'get').toUpperCase(), url];
  Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
  if (o.contentType) args.push('-H', 'Content-Type: ' + o.contentType);
  if (o.payload) args.push('--data', o.payload);
  execFileSync('curl', args);
  const blocks = fs.readFileSync(hf, 'utf8').trim().split(/\r?\n\r?\n/); const head = blocks[blocks.length - 1].split(/\r?\n/);
  const body = fs.readFileSync(bf, 'utf8'); fs.unlinkSync(hf); fs.unlinkSync(bf);
  const code = Number(head[0].split(' ')[1]); const h = {}; head.slice(1).forEach(l => { const k = l.indexOf(':'); h[l.slice(0, k)] = l.slice(k + 1).trim(); });
  return { getResponseCode: () => code, getContentText: () => body, getHeaders: () => h };
}
const ctx = { console, Math, Date, JSON,
  SpreadsheetApp: { getActive: () => ss, openById: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  UrlFetchApp: { fetch: fetchSync, fetchAll: rs => rs.map(r => fetchSync(r.url, r)) },
  Utilities: { formatDate: d => d.toISOString().slice(0, 10) } };
vm.createContext(ctx);
for (const f of ['Configuracao.gs', 'Calculo.gs', 'Classificacao.gs', 'Importacao.gs', 'Codigo.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const t0 = Date.now();
vm.runInContext('configurar(); importarCpelog();', ctx);
console.log('importação', ((Date.now() - t0) / 1000).toFixed(1) + 's', nReq, 'requisições');
const I = sheets.ITENS, U = sheets.UNIDADES;
console.log('ITENS', I.getLastRow() - 1, 'UNIDADES', U.getRange(2, 1, U.getLastRow() - 1, 6).getValues());
// simula: usuário informa efetivo, uma taxa e uma fase real
const lin = I.getRange(2, 1, I.getLastRow() - 1, 22).getValues();
const rPapel = lin.findIndex(r => /PAPEL TOALHA/.test(r[1])) + 2, rPneu = lin.findIndex(r => r[3] === 'C13') + 2;
console.log('papel toalha antes', I.getRange(rPapel, 1, 1, 22).getValues()[0], I.getRange(rPapel, 17, 1, 5).getFontColors()[0]);
U.getRange(2, 3, U.getLastRow() - 1, 1).setValues(U.getRange(2, 1, U.getLastRow() - 1, 1).getValues().map(() => [300]));
I.getRange(rPapel, 8).setValues([[0.5]]);
I.getRange(rPapel, 18).setValues([[150]]); ctx.e = { range: I.getRange(rPapel, 18) }; vm.runInContext('onEdit(e)', ctx);
I.getRange(rPneu, 8).setValues([[0.2]]);
vm.runInContext('recalcular(); var D = dadosPainel();', ctx);
const R = ctx.D.itens; const cnt = {}; R.forEach(x => cnt[x['Situação']] = (cnt[x['Situação']] || 0) + 1);
console.log('RESULTADOS', R.length, cnt);
[R.find(x => /PAPEL TOALHA/.test(x['Descrição'])), R.find(x => x['Família'] === 'C13'), R.find(x => x['Descrição'] === 'PISTOLA')].forEach(x => console.log(JSON.stringify(x)));
console.log('cores fase papel depois', I.getRange(rPapel, 17, 1, 5).getFontColors()[0]);
// reimportação preserva o que o usuário digitou
vm.runInContext('importarCpelog();', ctx);
const r2 = I.getRange(2, 1, I.getLastRow() - 1, 22).getValues().find(r => /PAPEL TOALHA/.test(r[1]));
console.log('após reimportar: taxa', r2[7], 'licitação', r2[17], 'linhas', I.getLastRow() - 1);
