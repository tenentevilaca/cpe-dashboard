/**
 * Agenda de Tarefas — CPE 2026
 * Armazena as tarefas numa aba da própria planilha, serve o painel web (farol de prazo)
 * e envia avisos por WhatsApp (CallMeBot) quando o farol de uma tarefa muda.
 */

const SHEET_NAME = 'Agenda';
const HEADERS = ['ID', 'Tarefa', 'Responsavel', 'DataInicio', 'Prazo', 'Concluida', 'DataConclusao', 'UltimoNivel', 'Notificar', 'TelefoneResponsavel'];

const OBS_SHEET_NAME = 'Observacoes';
const OBS_HEADERS = ['ID', 'TarefaID', 'Data', 'Texto', 'PrazoAnterior', 'PrazoNovo'];

const ACESSO_SHEET_NAME = 'Acesso';
const ACESSO_HEADERS = ['ID', 'Email', 'Nome', 'Motivo', 'Status', 'DataSolicitacao', 'DataAprovacao'];

// Nomes das Script Properties (configuradas em Configurações do projeto → Script Properties,
// NUNCA no código-fonte — assim a chave não vai pro GitHub).
const PROP_PHONE = 'CALLMEBOT_PHONE';
const PROP_APIKEY = 'CALLMEBOT_API_KEY';
const PROP_OWNER_EMAIL = 'OWNER_EMAIL';

/**
 * Tela inicial (escudo + card "Agenda") sempre aparece primeiro. O acesso à Agenda em si é
 * controlado pela conta Google de quem abriu o link — não existe usuário/senha digitados,
 * já que o Apps Script não tem como guardar senha com segurança. Quem não é o dono nem já
 * foi aprovado vê um formulário de solicitação de acesso; o dono aprova por um link que
 * chega por e-mail.
 */
function doGet(e) {
  const email = Session.getActiveUser().getEmail() || '';
  let mensagemAprovacao = '';

  if (e && e.parameter && e.parameter.acao === 'aprovar' && e.parameter.id) {
    if (isOwner_(email)) {
      const ok = aprovarAcesso_(e.parameter.id);
      mensagemAprovacao = ok
        ? 'Acesso aprovado com sucesso.'
        : 'Solicitação não encontrada (pode já ter sido aprovada antes).';
    } else {
      mensagemAprovacao = 'Só o responsável pela Agenda pode aprovar solicitações — abra o link de aprovação logado com a conta correta.';
    }
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.userEmail = email;
  template.isOwner = isOwner_(email);
  template.statusAcesso = getStatusAcesso_(email);
  template.mensagemAprovacao = mensagemAprovacao;

  return template.evaluate()
    .setTitle('Agenda de Tarefas — CPE 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== Controle de acesso (dono + aprovação por e-mail) =====

function getAcessoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ACESSO_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACESSO_SHEET_NAME);
    sheet.appendRow(ACESSO_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function isOwner_(email) {
  if (!email) return false;
  const dono = PropertiesService.getScriptProperties().getProperty(PROP_OWNER_EMAIL);
  return !!dono && email.toLowerCase() === dono.toLowerCase();
}

/** Retorna 'owner', 'aprovado', 'pendente' ou 'nenhum' pro e-mail informado. */
function getStatusAcesso_(email) {
  if (!email) return 'semLogin';
  if (isOwner_(email)) return 'owner';
  const sheet = getAcessoSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).toLowerCase() === email.toLowerCase()) {
      return values[i][4] === 'Aprovado' ? 'aprovado' : 'pendente';
    }
  }
  return 'nenhum';
}

/**
 * Registra um pedido de acesso à Agenda pra conta Google atualmente logada e manda um
 * e-mail pro dono com um link de aprovação. Chamado pelo formulário "Solicitar acesso".
 */
function solicitarAcesso(nome, motivo) {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('Não foi possível identificar sua conta Google. Faça login e tente de novo.');
  }

  const statusAtual = getStatusAcesso_(email);
  if (statusAtual === 'owner' || statusAtual === 'aprovado' || statusAtual === 'pendente') {
    return { status: statusAtual };
  }

  const sheet = getAcessoSheet_();
  const id = Utilities.getUuid();
  sheet.appendRow([
    id,
    email,
    nome || '',
    motivo || '',
    'Pendente',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
    ''
  ]);

  const dono = PropertiesService.getScriptProperties().getProperty(PROP_OWNER_EMAIL);
  if (dono) {
    const linkAprovar = ScriptApp.getService().getUrl() + '?acao=aprovar&id=' + encodeURIComponent(id);
    const corpo = 'Nova solicitação de acesso à Agenda CPE:\n\n' +
      'Nome: ' + (nome || '(não informado)') + '\n' +
      'E-mail (Google): ' + email + '\n' +
      'Motivo: ' + (motivo || '(não informado)') + '\n\n' +
      'Para aprovar, abra o link abaixo logado com a sua conta (só funciona pra você):\n' + linkAprovar;
    try {
      MailApp.sendEmail(dono, '🔐 Solicitação de acesso — Agenda CPE', corpo);
    } catch (e) {
      Logger.log('Falha ao enviar e-mail de solicitação de acesso: ' + e);
    }
  }

  return { status: 'pendente' };
}

/** Aprova um pedido de acesso pelo ID (chamado só a partir de doGet, após confirmar que é o dono). */
function aprovarAcesso_(id) {
  const sheet = getAcessoSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 5).setValue('Aprovado');
      sheet.getRange(i + 1, 7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
      return true;
    }
  }
  return false;
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

/**
 * O Google Sheets às vezes reconhece um texto tipo "28/08/2026 14:10" e guarda como
 * data de verdade em vez de texto puro. Se isso não for convertido de volta pra string
 * antes de devolver pro navegador, o google.script.run trava silenciosamente ao tentar
 * mandar um objeto Date embutido numa lista.
 */
function formatDataHora_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return v;
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
      telefoneResponsavel: r[9] || ''
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
      data: formatDataHora_(r[2]),
      texto: r[3],
      prazoAnterior: formatDate_(r[4]),
      prazoNovo: formatDate_(r[5])
    }));
}

/**
 * Registra uma observação/justificativa numa tarefa e, opcionalmente, prorroga o prazo.
 * dados = {tarefaId, texto, novoPrazo} — novoPrazo é opcional ('yyyy-MM-dd', escolhido
 * direto num calendário), e substitui o prazo atual da tarefa por essa data exata. Optamos
 * por data exata em vez de "dias a somar" porque somar dias ao prazo antigo de uma tarefa já
 * vencida podia devolver uma data que ainda estava no passado (ou bem em cima da hora),
 * confundindo o farol.
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

  const prazoAtual = formatDate_(values[linha][4]);

  let prazoAnterior = '';
  let prazoNovo = '';
  if (dados.novoPrazo) {
    const novaData = new Date(dados.novoPrazo + 'T00:00:00');
    if (isNaN(novaData.getTime())) {
      throw new Error('Novo prazo inválido.');
    }
    prazoAnterior = prazoAtual;
    prazoNovo = dados.novoPrazo;
    sheet.getRange(linha + 1, 5).setValue(novaData);
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

  // Nenhuma chamada de rede (WhatsApp) acontece aqui de propósito: o CallMeBot pode
  // demorar ou travar pra responder, e isso prendia a tela em "Salvando..." — o aviso
  // de mudança de farol pro dono continua acontecendo pelas outras vias (conclusão de
  // tarefa e verificação periódica).

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
  sheet.appendRow([id, dados.tarefa, dados.responsavel, inicio, prazo, false, '', chaveInicial, notificar, dados.telefoneResponsavel || '']);
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
    const farolAtual = calcularFarol_(dataInicio, prazo);
    const chaveAtual = statusKey_(farolAtual);

    if (notificar && chaveAnterior && chaveAnterior !== chaveAtual) {
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
