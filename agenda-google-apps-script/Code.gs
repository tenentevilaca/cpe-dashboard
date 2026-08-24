/**
 * Agenda de Tarefas — CPE 2026
 * Armazena as tarefas numa aba da própria planilha, serve o painel web (farol de prazo)
 * e envia avisos por WhatsApp (CallMeBot) quando o farol de uma tarefa muda.
 */

const SHEET_NAME = 'Agenda';
const HEADERS = ['ID', 'Tarefa', 'Responsavel', 'DataInicio', 'Prazo', 'Concluida', 'DataConclusao', 'UltimoNivel', 'Notificar'];

// Nomes das Script Properties (configuradas em Configurações do projeto → Script Properties,
// NUNCA no código-fonte — assim a chave não vai pro GitHub).
const PROP_PHONE = 'CALLMEBOT_PHONE';
const PROP_APIKEY = 'CALLMEBOT_API_KEY';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Agenda de Tarefas — CPE 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Planilha criada antes do recurso de WhatsApp: completa o cabeçalho que faltar.
  const largura = sheet.getLastColumn();
  if (largura < HEADERS.length) {
    sheet.getRange(1, largura + 1, 1, HEADERS.length - largura).setValues([HEADERS.slice(largura)]);
  }
  return sheet;
}

function formatDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

/** Retorna todas as tarefas cadastradas. */
function listarTarefas() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  return rows
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({
      id: r[0],
      tarefa: r[1],
      responsavel: r[2],
      dataInicio: formatDate_(r[3]),
      prazo: formatDate_(r[4]),
      concluida: r[5] === true || r[5] === 'TRUE' || r[5] === 'VERDADEIRO',
      dataConclusao: formatDate_(r[6]),
      notificar: !(r[8] === false || r[8] === 'FALSE' || r[8] === 'FALSO')
    }));
}

/** Adiciona uma nova tarefa. dados = {tarefa, responsavel, dataInicio, prazo} (datas em 'yyyy-MM-dd'). */
function adicionarTarefa(dados) {
  if (!dados || !dados.tarefa || !dados.responsavel || !dados.dataInicio || !dados.prazo) {
    throw new Error('Preencha tarefa, responsável, data de início e prazo.');
  }
  const inicio = new Date(dados.dataInicio + 'T00:00:00');
  const prazo = new Date(dados.prazo + 'T00:00:00');
  if (isNaN(inicio.getTime()) || isNaN(prazo.getTime())) {
    throw new Error('Datas inválidas.');
  }
  if (prazo < inicio) {
    throw new Error('O prazo não pode ser anterior à data de início.');
  }
  const sheet = getSheet_();
  const id = Utilities.getUuid();
  const nivelInicial = calcularFarol_(dados.dataInicio, dados.prazo).nivel;
  const notificar = dados.notificar !== false;
  sheet.appendRow([id, dados.tarefa, dados.responsavel, inicio, prazo, false, '', nivelInicial, notificar]);
  return listarTarefas();
}

/** Liga/desliga o aviso de WhatsApp para uma tarefa específica. */
function alternarNotificacao(id, notificar) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 9).setValue(!!notificar);
      break;
    }
  }
  return listarTarefas();
}

/** Marca/desmarca uma tarefa como concluída. */
function concluirTarefa(id, concluida) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 6).setValue(!!concluida);
      sheet.getRange(i + 1, 7).setValue(concluida ? new Date() : '');
      const notificar = !(values[i][8] === false || values[i][8] === 'FALSE' || values[i][8] === 'FALSO');
      if (concluida && notificar) {
        try {
          enviarWhatsApp_(values[i][1], values[i][2], '✅ Concluída');
        } catch (e) {
          Logger.log('Falha ao enviar WhatsApp para tarefa "' + values[i][1] + '": ' + e);
        }
      }
      break;
    }
  }
  return listarTarefas();
}

/** Remove uma tarefa. */
function excluirTarefa(id) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return listarTarefas();
}

// ===== Farol de prazo (mesma regra do painel web, calculada aqui pro monitoramento automático) =====

function calcularFarol_(dataInicioStr, prazoStr) {
  const MS_DIA = 86400000;
  const dIni = new Date(dataInicioStr + 'T00:00:00');
  const dPrazo = new Date(prazoStr + 'T00:00:00');
  const hoje = new Date();
  const dHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const totalDias = Math.round((dPrazo - dIni) / MS_DIA);
  const decorridos = Math.round((dHoje - dIni) / MS_DIA);

  let pct;
  if (totalDias <= 0) {
    pct = decorridos >= 0 ? 100 : 0;
  } else {
    pct = (decorridos / totalDias) * 100;
  }
  pct = Math.max(0, pct);

  let nivel;
  if (pct >= 100) nivel = 'preto';
  else if (pct > 90) nivel = 'vermelho';
  else if (pct >= 70) nivel = 'laranja';
  else nivel = 'verde';

  let diasAtraso = 0;
  if (nivel === 'preto') {
    diasAtraso = Math.max(0, Math.round((dHoje - dPrazo) / MS_DIA));
  }

  return { pct: Math.round(pct), nivel: nivel, diasAtraso: diasAtraso };
}

const NIVEL_LABEL = {
  verde: '🟢 Verde (dentro do prazo)',
  laranja: '🟠 Laranja (atenção — 70% a 90% do prazo)',
  vermelho: '🔴 Vermelho (urgente — 91% a 99% do prazo)',
  preto: '⚫ Preto (atrasada)'
};

/**
 * Verifica todas as tarefas pendentes, compara o farol atual com o último farol registrado
 * e dispara um aviso de WhatsApp quando ele mudou. Rode isso periodicamente via gatilho
 * (veja instalarGatilhoDiario) ou manualmente pelo editor para testar.
 */
function verificarAlteracoesDeStatus() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = row[0];
    if (!id) continue;
    const concluida = row[5] === true;
    if (concluida) continue;

    const dataInicio = formatDate_(row[3]);
    const prazo = formatDate_(row[4]);
    const nivelAnterior = row[7];
    const notificar = !(row[8] === false || row[8] === 'FALSE' || row[8] === 'FALSO');
    const farolAtual = calcularFarol_(dataInicio, prazo);

    if (notificar && nivelAnterior && nivelAnterior !== farolAtual.nivel) {
      let statusMsg = NIVEL_LABEL[farolAtual.nivel] || farolAtual.nivel;
      if (farolAtual.nivel === 'preto' && farolAtual.diasAtraso > 0) {
        statusMsg += ' — ' + farolAtual.diasAtraso + ' dia(s) em atraso';
      }
      try {
        enviarWhatsApp_(row[1], row[2], statusMsg);
      } catch (e) {
        Logger.log('Falha ao enviar WhatsApp para tarefa "' + row[1] + '": ' + e);
      }
    }

    sheet.getRange(i + 1, 8).setValue(farolAtual.nivel);
  }
}

/** Cria o gatilho diário que roda verificarAlteracoesDeStatus. Rode esta função UMA VEZ pelo editor. */
function instalarGatilhoDiario() {
  removerGatilhos();
  ScriptApp.newTrigger('verificarAlteracoesDeStatus')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
  Logger.log('Gatilho diário instalado — verificarAlteracoesDeStatus vai rodar por volta das 8h todo dia.');
}

/** Remove gatilhos existentes de verificarAlteracoesDeStatus (evita duplicar se rodar instalarGatilhoDiario de novo). */
function removerGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarAlteracoesDeStatus') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ===== Envio de WhatsApp (CallMeBot) =====

/** Monta e envia a mensagem via CallMeBot. Lança erro se a configuração estiver incompleta ou a API falhar. */
function enviarWhatsApp_(tarefa, responsavel, statusLabel) {
  const props = PropertiesService.getScriptProperties();
  const phone = props.getProperty(PROP_PHONE);
  const apiKey = props.getProperty(PROP_APIKEY);

  if (!phone || !apiKey) {
    throw new Error('WhatsApp não configurado: defina CALLMEBOT_PHONE e CALLMEBOT_API_KEY em Configurações do projeto → Script Properties.');
  }

  const mensagem = '⚠️ Alerta de prazo — Agenda CPE\n\nTarefa: ' + tarefa +
    '\nResponsável: ' + responsavel +
    '\nNovo status: ' + statusLabel;

  const url = 'https://api.callmebot.com/whatsapp.php'
    + '?phone=' + encodeURIComponent(phone)
    + '&text=' + encodeURIComponent(mensagem)
    + '&apikey=' + encodeURIComponent(apiKey);

  const resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const codigo = resposta.getResponseCode();
  const corpo = resposta.getContentText();
  Logger.log('CallMeBot respondeu (HTTP ' + codigo + '): ' + corpo);

  if (codigo >= 300 || /error|invalid|not (an? )?(registered|allowed)/i.test(corpo)) {
    throw new Error('Erro ao enviar WhatsApp via CallMeBot (HTTP ' + codigo + '): ' + corpo);
  }
}

/** Função de teste: rode manualmente pelo editor (▶ Executar) pra validar a configuração do WhatsApp. */
function testarWhatsApp() {
  enviarWhatsApp_('Tarefa de teste', 'Você', '🟢 Verde (dentro do prazo)');
  Logger.log('Mensagem de teste enviada com sucesso — confira o WhatsApp.');
}
