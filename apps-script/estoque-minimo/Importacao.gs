/**
 * Importação direta do painel CPELOG (inventario.cpelog.com.br, base Supabase).
 *
 * Usuário e senha ficam nas Propriedades do script (menu "Configurar acesso ao CPELOG"),
 * nunca no código nem na planilha. A importação só LÊ o CPELOG.
 */

var CPELOG = {
  url: 'https://iakyurryqlaoifpmundq.supabase.co',
  // Chave pública ("anon") que o próprio site entrega ao navegador; o acesso real depende do login.
  chavePublica: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlha3l1cnJ5cWxhb2lmcG11bmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzUwNjcsImV4cCI6MjA4ODA1MTA2N30.5K1_7kkX5dj0p-Is_PvRp6pzsMHYU4aSOudnxBkj8rY',
  dominioLogin: '@inventario.local',
  pagina: 1000
};

function configurarAcesso() {
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('Acesso ao CPELOG', 'Número de polícia (login do painel):', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  var s = ui.prompt('Acesso ao CPELOG', 'Senha do painel (fica guardada só nas propriedades deste script):', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CPELOG_USUARIO', u.getResponseText().replace(/\D/g, ''));
  props.setProperty('CPELOG_SENHA', s.getResponseText());
  tokenCpelog_(true);
  ui.alert('Acesso validado. Use "Importar do CPELOG".');
}

function tokenCpelog_(forcar) {
  var cache = CacheService.getScriptCache();
  if (!forcar) { var t = cache.get('CPELOG_TOKEN'); if (t) return t; }
  var props = PropertiesService.getScriptProperties();
  var usuario = props.getProperty('CPELOG_USUARIO'), senha = props.getProperty('CPELOG_SENHA');
  if (!usuario || !senha) throw new Error('Configure o acesso: menu Estoque mínimo > Configurar acesso ao CPELOG.');
  var r = UrlFetchApp.fetch(CPELOG.url + '/auth/v1/token?grant_type=password', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: CPELOG.chavePublica },
    payload: JSON.stringify({ email: usuario + CPELOG.dominioLogin, password: senha })
  });
  if (r.getResponseCode() !== 200) throw new Error('Login no CPELOG recusado (' + r.getResponseCode() + '). Confira usuário e senha.');
  var tok = JSON.parse(r.getContentText()).access_token;
  cache.put('CPELOG_TOKEN', tok, 3000);
  return tok;
}

/** Lê uma tabela inteira, em páginas buscadas em paralelo. */
function lerTabela_(tabela, consulta) {
  var h = { apikey: CPELOG.chavePublica, Authorization: 'Bearer ' + tokenCpelog_() };
  var base = CPELOG.url + '/rest/v1/' + tabela + '?' + consulta;
  var r0 = UrlFetchApp.fetch(base + '&limit=1', { headers: Object.assign({ Prefer: 'count=exact' }, h), muteHttpExceptions: true });
  if (r0.getResponseCode() >= 300) throw new Error('CPELOG ' + tabela + ': ' + r0.getContentText().slice(0, 200));
  var total = Number(String(r0.getHeaders()['Content-Range'] || r0.getHeaders()['content-range'] || '*/0').split('/')[1]) || 0;
  var reqs = [];
  for (var off = 0; off < total; off += CPELOG.pagina) reqs.push({ url: base + '&offset=' + off + '&limit=' + CPELOG.pagina, headers: h, muteHttpExceptions: true });
  var linhas = [];
  for (var i = 0; i < reqs.length; i += 8) {
    UrlFetchApp.fetchAll(reqs.slice(i, i + 8)).forEach(function (r) {
      if (r.getResponseCode() >= 300) throw new Error('CPELOG ' + tabela + ': ' + r.getContentText().slice(0, 200));
      linhas = linhas.concat(JSON.parse(r.getContentText()));
    });
  }
  return linhas;
}

/** Monta o catálogo de materiais (consumo + permanentes) a partir do CPELOG. */
function lerCatalogoCpelog_() {
  var grupos = {};
  lerTabela_('grupo_hierarquia', 'select=id,nome,pai_id&order=id.asc').forEach(function (g) { grupos[g.id] = g; });
  function caminho(id) { var p = [], g = grupos[id]; while (g) { p.unshift(g.nome); g = grupos[g.pai_id]; } return p.join(' > '); }
  var clsCons = {};
  lerTabela_('classificacao_material_consumo', 'select=codigo_material,grupo_id,subgrupo_id&order=codigo_material.asc')
    .forEach(function (c) { clsCons[c.codigo_material] = caminho(c.subgrupo_id || c.grupo_id); });

  var cat = {};
  lerTabela_('consumo_pro_estoque', 'select=codigo_material,descricao,qtd_total,codigo_almoxarifado,unidade_medida&deleted_at=is.null&order=id.asc')
    .forEach(function (e) {
      var k = String(e.codigo_material || '').trim(); if (!k) return;
      var c = cat[k] || (cat[k] = { codigo: k, descricao: e.descricao, tipo: 'CONSUMO', grupo: clsCons[k] || '', unidade: e.unidade_medida || '', saldo: 0, parque: '' });
      c.saldo += Number(e.qtd_total) || 0;
    });

  var clsPerm = {};
  lerTabela_('classes_permanentes', 'select=codigo_numerico,classe_corrigida,subclasse_corrigida&order=id.asc')
    .forEach(function (c) { clsPerm[c.codigo_numerico] = [c.classe_corrigida, c.subclasse_corrigida].filter(Boolean).join(' / '); });
  var viaturasPorFracao = {};
  lerTabela_('bimg', 'select=codigo_material,material,destinacao_bem,grupo,subgrupo,adicionado_manualmente,codigo_unidade_responsavel&deleted_at=is.null&order=id.asc')
    .forEach(function (b) {
      var desc = String(b.material || '').replace(/\s*-\s*$/, '').trim();
      var k = b.codigo_material ? String(b.codigo_material) : 'MANUAL-' + normalizar_(desc).slice(0, 50).trim();
      var c = cat[k] || (cat[k] = { codigo: k, descricao: desc, tipo: 'PERMANENTE', grupo: clsPerm[b.codigo_material] || [b.grupo, b.subgrupo].filter(Boolean).join(' / '), unidade: 'unidade', saldo: 0, parque: 0 });
      if (c.tipo !== 'PERMANENTE') return;
      c.parque += 1;
      if (b.destinacao_bem === 'ESTOCADO') c.saldo += 1;
      if (/VIATURA|CAMIONETA|MOTOCICLETA|AUTOMOVEL|FURGAO|UTILITARIO|JEEP/.test(normalizar_(desc))) {
        var f = String(b.codigo_unidade_responsavel || ''); viaturasPorFracao[f] = (viaturasPorFracao[f] || 0) + 1;
      }
    });
  return { itens: Object.keys(cat).map(function (k) { return cat[k]; }), viaturasPorFracao: viaturasPorFracao };
}

/** Importa e mescla: atualiza colunas do sistema, preserva tudo o que o usuário digitou. */
function importarCpelog() {
  var ss = planilha_();
  if (!ss.getSheetByName('ITENS')) configurar();
  var dados = lerCatalogoCpelog_(), agora = new Date();

  var sh = ss.getSheetByName('ITENS'), nc = ABAS.ITENS.length;
  var existentes = {}, ordem = [];
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues().forEach(function (r) {
      var k = String(r[0]).trim(); if (!k || /^EX-/.test(k)) return;
      existentes[k] = r; ordem.push(k);
    });
  }
  var fontes = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, nc).getFontColors() : [];
  var corPorCodigo = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) { corPorCodigo[String(r[0]).trim()] = fontes[i]; });

  var novos = 0, saida = [], cores = [];
  dados.itens.sort(function (a, b) { return a.tipo === b.tipo ? (a.descricao > b.descricao ? 1 : -1) : (a.tipo > b.tipo ? 1 : -1); });
  var vistos = {};
  dados.itens.forEach(function (it) {
    vistos[it.codigo] = true;
    var r = existentes[it.codigo];
    if (!r) { r = new Array(nc).fill(''); r[COL.FAMILIA] = classificar(it.tipo, it.descricao, it.grupo); novos++; }
    r[COL.CODIGO] = it.codigo; r[COL.DESCRICAO] = it.descricao; r[COL.TIPO] = it.tipo; r[COL.GRUPO] = it.grupo;
    if (!r[COL.UNIDADE_MEDIDA]) r[COL.UNIDADE_MEDIDA] = it.unidade;
    r[COL.SALDO] = Math.round(it.saldo * 100) / 100; r[COL.PARQUE] = it.parque; r[COL.ATUALIZADO] = agora;
    saida.push(r); cores.push(corPorCodigo[it.codigo] || null);
  });
  // Itens que sumiram do CPELOG ficam no fim, marcados, para o usuário decidir.
  ordem.forEach(function (k) { if (!vistos[k]) { var r = existentes[k]; r[COL.ATUALIZADO] = 'Não encontrado no CPELOG'; saida.push(r); cores.push(corPorCodigo[k] || null); } });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent().setFontColor(null).setFontStyle(null);
  if (saida.length) {
    sh.getRange(2, 1, saida.length, nc).setValues(saida);
    var fc = cores.map(function (c) { return c || new Array(nc).fill(null); });
    sh.getRange(2, 1, saida.length, nc).setFontColors(fc);
    sh.getRange(2, COL.ATUALIZADO + 1, saida.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  }
  preencherPadroes_(ss);
  importarUnidades_(ss, dados.viaturasPorFracao);
  SpreadsheetApp.getActive().toast(saida.length + ' materiais (' + novos + ' novos). Recalcule para ver os resultados.', 'Importado do CPELOG', 8);
}

/** UNIDADES por batalhão/UEOp: frações e viaturas vêm do CPELOG; o efetivo é digitado. */
function importarUnidades_(ss, viaturasPorFracao) {
  var art = lerTabela_('articulacao', 'select=codigo,ueop_uead,udi&order=id.asc');
  var g = {};
  art.forEach(function (a) {
    var k = a.ueop_uead || a.udi || 'Sem UEOp';
    var x = g[k] || (g[k] = { fracoes: 0, viaturas: 0 });
    x.fracoes++; x.viaturas += viaturasPorFracao[String(a.codigo)] || 0;
  });
  var sh = ss.getSheetByName('UNIDADES'), atuais = {}, nc = ABAS.UNIDADES.length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues().forEach(function (r) { if (r[0] && !/^EXEMPLO/.test(String(r[0]))) atuais[r[0]] = r; });
  // Efetivo e "Considerar" são do usuário; nome, viaturas e frações vêm do CPELOG.
  var out = Object.keys(g).sort().map(function (k) {
    var r = atuais[k] || [k, '', '', '', '', 'S'];
    r[1] = k; r[3] = g[k].viaturas; r[4] = g[k].fracoes;
    return r;
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ABAS.UNIDADES.length).clearContent();
  sh.getRange(2, 1, out.length, nc).setValues(out);
}
