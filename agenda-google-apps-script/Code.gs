/**
 * Agenda de Tarefas — CPE 2026
 * Armazena as tarefas numa aba da própria planilha, serve o painel web (farol de prazo)
 * e envia avisos por WhatsApp (CallMeBot) quando o farol de uma tarefa muda.
 */

const SHEET_NAME = 'Agenda';
const HEADERS = ['ID', 'Tarefa', 'Responsavel', 'DataInicio', 'Prazo', 'Concluida', 'DataConclusao', 'UltimoNivel', 'Notificar', 'TelefoneResponsavel', 'NotificarRespAuto'];

const OBS_SHEET_NAME = 'Observacoes';
const OBS_HEADERS = ['ID', 'TarefaID', 'Data', 'Texto', 'PrazoAnterior', 'PrazoNovo'];

// Nomes das Script Properties (configuradas em Configurações do projeto → Script Properties,
// NUNCA no código-fonte — assim a chave não vai pro GitHub).
const PROP_PHONE = 'CALLMEBOT_PHONE';
const PROP_APIKEY = 'CALLMEBOT_API_KEY';
const PROP_META_PHONE_ID = 'META_PHONE_NUMBER_ID';
const PROP_META_TOKEN = 'META_ACCESS_TOKEN';
const PROP_META_TEMPLATE = 'META_TEMPLATE_NAME';
const PROP_META_LANG = 'META_TEMPLATE_LANG';

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

function getObsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(OBS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(OBS_SHEET_NAME);
    sheet.appendRow(OBS_HEADERS);
    sheet.setFrozenRows(1);
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

function fmtDataBr_(s) {
  if (!s) return '';
  const p = s.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function addDias_(dataStr, dias) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(dias));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function contarObservacoesPorTarefa_() {
  const sheet = getObsSheet_();
  const values = sheet.getDataRange().getValues();
  const mapa = {};
  for (let i = 1; i < values.length; i++) {
    const tid = values[i][1];
    if (!tid) continue;
    mapa[tid] = (mapa[tid] || 0) + 1;
  }
  return mapa;
}

/**
 * Retorna todas as tarefas cadastradas, junto com a data de "hoje" segundo o fuso horário
 * do script (America/Sao_Paulo). O painel usa essa data em vez do relógio do navegador do
 * usuário para calcular o farol — assim o farol exibido sempre bate com o que dispara os
 * avisos de WhatsApp, independente do fuso/relógio do computador de quem está olhando.
 */
function listarTarefas() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  const contagemObs = contarObservacoesPorTarefa_();
  const tarefas = rows
    .filter(r => r[0] !== '' && r[0] != null)
    .map(r => ({
      id: r[0],
      tarefa: r[1],
      responsavel: r[2],
      dataInicio: formatDate_(r[3]),
      prazo: formatDate_(r[4]),
      concluida: r[5] === true || r[5] === 'TRUE' || r[5] === 'VERDADEIRO',
      dataConclusao: formatDate_(r[6]),
      notificar: !(r[8] === false || r[8] === 'FALSE' || r[8] === 'FALSO'),
      totalObservacoes: contagemObs[r[0]] || 0,
      telefoneResponsavel: r[9] || '',
      notificarResponsavelAuto: !(r[10] === false || r[10] === 'FALSE' || r[10] === 'FALSO')
    }));
  return {
    tarefas: tarefas,
    hoje: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

/** Retorna as observações/justificativas de uma tarefa, em ordem cronológica. */
function listarObservacoes(tarefaId) {
  const sheet = getObsSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  return rows
    .filter(r => r[1] === tarefaId)
    .map(r => ({
      id: r[0],
      tarefaId: r[1],
      data: r[2],
      texto: r[3],
      prazoAnterior: r[4],
      prazoNovo: r[5]
    }));
}

/**
 * Registra uma observação/justificativa numa tarefa e, opcionalmente, prorroga o prazo.
 * dados = {tarefaId, texto, diasExtra} — diasExtra é opcional (número de dias a somar ao
 * prazo atual da tarefa).
 */
function adicionarObservacao(dados) {
  if (!dados || !dados.tarefaId || !dados.texto) {
    throw new Error('Informe a observação/justificativa.');
  }
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  let linha = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === dados.tarefaId) { linha = i; break; }
  }
  if (linha === -1) {
    throw new Error('Tarefa não encontrada.');
  }

  const tarefaNome = values[linha][1];
  const responsavel = values[linha][2];
  const prazoAtual = formatDate_(values[linha][4]);
  const notificar = !(values[linha][8] === false || values[linha][8] === 'FALSE' || values[linha][8] === 'FALSO');
  const telefoneResp = values[linha][9];
  const notificarRespAuto = !(values[linha][10] === false || values[linha][10] === 'FALSE' || values[linha][10] === 'FALSO');

  let prazoAnterior = '';
  let prazoNovo = '';
  const diasExtra = Number(dados.diasExtra);
  if (diasExtra && diasExtra > 0) {
    prazoAnterior = prazoAtual;
    prazoNovo = addDias_(prazoAtual, diasExtra);
    sheet.getRange(linha + 1, 5).setValue(new Date(prazoNovo + 'T00:00:00'));
  }

  const obsSheet = getObsSheet_();
  obsSheet.appendRow([
    Utilities.getUuid(),
    dados.tarefaId,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    dados.texto,
    prazoAnterior,
    prazoNovo
  ]);

  if (prazoNovo) {
    const msgProrrogacao = '🗓️ Prazo prorrogado para ' + fmtDataBr_(prazoNovo) + ' — Motivo: ' + dados.texto;
    if (notificar) {
      try {
        enviarWhatsApp_(tarefaNome, responsavel, msgProrrogacao);
      } catch (e) {
        Logger.log('Falha ao enviar WhatsApp de prorrogação para "' + tarefaNome + '": ' + e);
      }
    }
    if (telefoneResp && notificarRespAuto && metaConfigurado_()) {
      try {
        enviarWhatsAppMeta_(telefoneResp, tarefaNome, responsavel, msgProrrogacao);
      } catch (e) {
        Logger.log('Falha ao enviar WhatsApp (Meta) de prorrogação para responsável de "' + tarefaNome + '": ' + e);
      }
    }
  }

  return {
    observacoes: listarObservacoes(dados.tarefaId),
    resultado: listarTarefas()
  };
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
  const chaveInicial = statusKey_(calcularFarol_(dados.dataInicio, dados.prazo));
  const notificar = dados.notificar !== false;
  const notificarRespAuto = dados.notificarResponsavelAuto !== false;
  sheet.appendRow([id, dados.tarefa, dados.responsavel, inicio, prazo, false, '', chaveInicial, notificar, dados.telefoneResponsavel || '', notificarRespAuto]);
  return listarTarefas();
}

/** Atualiza o telefone de WhatsApp do responsável por uma tarefa (usado pelo botão "Definir nº"). */
function atualizarTelefoneResponsavel(id, telefone) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 10).setValue(telefone || '');
      break;
    }
  }
  return listarTarefas();
}

/** Liga/desliga o aviso de WhatsApp (CallMeBot, pro seu número) para uma tarefa específica. */
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

/** Liga/desliga o aviso automático via WhatsApp Cloud API (Meta) pro número do responsável. */
function alternarNotificacaoResponsavel(id, notificar) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 11).setValue(!!notificar);
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
      const telefoneResp = values[i][9];
      const notificarRespAuto = !(values[i][10] === false || values[i][10] === 'FALSE' || values[i][10] === 'FALSO');
      if (concluida) {
        if (notificar) {
          try {
            enviarWhatsApp_(values[i][1], values[i][2], '✅ Concluída');
          } catch (e) {
            Logger.log('Falha ao enviar WhatsApp para tarefa "' + values[i][1] + '": ' + e);
          }
        }
        if (telefoneResp && notificarRespAuto && metaConfigurado_()) {
          try {
            enviarWhatsAppMeta_(telefoneResp, values[i][1], values[i][2], '✅ Concluída');
          } catch (e) {
            Logger.log('Falha ao enviar WhatsApp (Meta) para responsável da tarefa "' + values[i][1] + '": ' + e);
          }
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

/**
 * Chave de comparação de status: quando preta, inclui o número de dias em atraso, para que
 * cada dia a mais de atraso conte como uma mudança de status (e dispare um novo aviso),
 * mesmo a cor continuando preta.
 */
function statusKey_(farol) {
  return farol.nivel === 'preto' ? 'preto:' + farol.diasAtraso : farol.nivel;
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
    const chaveAnterior = row[7];
    const notificar = !(row[8] === false || row[8] === 'FALSE' || row[8] === 'FALSO');
    const telefoneResp = row[9];
    const notificarRespAuto = !(row[10] === false || row[10] === 'FALSE' || row[10] === 'FALSO');
    const farolAtual = calcularFarol_(dataInicio, prazo);
    const chaveAtual = statusKey_(farolAtual);

    if (chaveAnterior && chaveAnterior !== chaveAtual) {
      let statusMsg = NIVEL_LABEL[farolAtual.nivel] || farolAtual.nivel;
      if (farolAtual.nivel === 'preto' && farolAtual.diasAtraso > 0) {
        statusMsg += ' — ' + farolAtual.diasAtraso + ' dia(s) em atraso';
      }
      if (notificar) {
        try {
          enviarWhatsApp_(row[1], row[2], statusMsg);
        } catch (e) {
          Logger.log('Falha ao enviar WhatsApp para tarefa "' + row[1] + '": ' + e);
        }
      }
      if (telefoneResp && notificarRespAuto && metaConfigurado_()) {
        try {
          enviarWhatsAppMeta_(telefoneResp, row[1], row[2], statusMsg);
        } catch (e) {
          Logger.log('Falha ao enviar WhatsApp (Meta) para responsável da tarefa "' + row[1] + '": ' + e);
        }
      }
    }

    sheet.getRange(i + 1, 8).setValue(chaveAtual);
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

// ===== Envio de WhatsApp pro RESPONSÁVEL (WhatsApp Cloud API — Meta) =====
// Diferente do CallMeBot (que só manda pro seu próprio número), a Cloud API oficial da Meta
// manda pro número que você quiser, sem o responsável precisar instalar/ativar nada — ele só
// recebe a mensagem no WhatsApp normal dele. Em compensação, enquanto o app da Meta estiver em
// modo de Desenvolvimento (sem verificação de empresa), só é possível mandar mensagem pros
// números de teste cadastrados manualmente no painel da Meta (limite de 5 números).

function metaConfigurado_() {
  const props = PropertiesService.getScriptProperties();
  return !!(props.getProperty(PROP_META_PHONE_ID) && props.getProperty(PROP_META_TOKEN));
}

function soDigitos_(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Envia uma mensagem via WhatsApp Cloud API (Meta) direto pro número do responsável, usando um
 * template aprovado com 3 variáveis no corpo: {{1}} tarefa, {{2}} responsável, {{3}} status.
 * Requer META_PHONE_NUMBER_ID e META_ACCESS_TOKEN em Script Properties (veja o README).
 */
function enviarWhatsAppMeta_(telefone, tarefa, responsavel, statusLabel) {
  const props = PropertiesService.getScriptProperties();
  const phoneNumberId = props.getProperty(PROP_META_PHONE_ID);
  const token = props.getProperty(PROP_META_TOKEN);
  if (!phoneNumberId || !token) {
    throw new Error('WhatsApp (Meta) não configurado: defina META_PHONE_NUMBER_ID e META_ACCESS_TOKEN em Script Properties.');
  }
  const templateName = props.getProperty(PROP_META_TEMPLATE) || 'agenda_cpe_status';
  const lang = props.getProperty(PROP_META_LANG) || 'pt_BR';

  const payload = {
    messaging_product: 'whatsapp',
    to: soDigitos_(telefone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: String(tarefa) },
          { type: 'text', text: String(responsavel) },
          { type: 'text', text: String(statusLabel) }
        ]
      }]
    }
  };

  const resposta = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + phoneNumberId + '/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const codigo = resposta.getResponseCode();
  const corpo = resposta.getContentText();
  Logger.log('WhatsApp Cloud API (Meta) respondeu (HTTP ' + codigo + '): ' + corpo);

  if (codigo >= 300) {
    throw new Error('Erro ao enviar WhatsApp via Meta (HTTP ' + codigo + '): ' + corpo);
  }
}

/**
 * Função de teste: edite o número de teste abaixo (precisa ser um dos números cadastrados no
 * painel da Meta, em modo Desenvolvimento) e rode manualmente pelo editor (▶ Executar).
 */
function testarWhatsAppMeta() {
  const telefoneDeTeste = '5531999999999'; // <- troque por um número cadastrado no painel da Meta
  enviarWhatsAppMeta_(telefoneDeTeste, 'Tarefa de teste', 'Fulano de Tal', '🟢 Verde (dentro do prazo)');
  Logger.log('Mensagem de teste enviada com sucesso — confira o WhatsApp do número informado.');
}
