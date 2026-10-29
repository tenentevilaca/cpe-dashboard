// Gera EstoqueMinimo.gs: todos os scripts + o HTML do painel num único arquivo para colar no Apps Script.
// Uso: node apps-script/estoque-minimo/unico/gerar.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const partes = ['Configuracao.gs', 'Calculo.gs', 'Classificacao.gs', 'Importacao.gs', 'Codigo.gs'];
let out = '/**\n * ESTOQUE MÍNIMO - CPELOG (arquivo único)\n * Cole TODO este conteúdo num único arquivo de script do Apps Script (ex.: Código.gs).\n * Gerado a partir dos arquivos da pasta apps-script/estoque-minimo; não edite aqui.\n */\n\n';
for (const f of partes) out += '/* ===================== ' + f + ' ===================== */\n\n' + fs.readFileSync(path.join(dir, f), 'utf8') + '\n\n';
out += '/* ===================== Painel.html ===================== */\n\nvar PAINEL_HTML = ' + JSON.stringify(fs.readFileSync(path.join(dir, 'Painel.html'), 'utf8')) + ';\n';
fs.writeFileSync(path.join(__dirname, 'EstoqueMinimo.gs'), out);
console.log('EstoqueMinimo.gs', out.length, 'caracteres');
