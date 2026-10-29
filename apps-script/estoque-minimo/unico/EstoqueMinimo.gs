/**
 * ESTOQUE MÍNIMO - CPELOG (arquivo único)
 * Cole TODO este conteúdo num único arquivo de script do Apps Script (ex.: Código.gs).
 * Gerado a partir dos arquivos da pasta apps-script/estoque-minimo; não edite aqui.
 */

/* ===================== Configuracao.gs ===================== */

/**
 * Estrutura das abas, parâmetros padrão e famílias de criticidade pré-cadastradas.
 * Os valores são pontos de partida: o P4 calibra na aba PARAMETROS e FAMILIAS.
 */

var ABAS = {
  PARAMETROS: ['Chave', 'Valor', 'Descrição'],
  FAMILIAS: ['ID', 'Nome', 'Tipo', 'O que reúne',
    'ESS Essencialidade p/ policiamento (1-5)', 'SEG Risco à segurança na falta (1-5)', 'SUB Dificuldade de substituição (1-5)',
    'CTL Controle institucional (1-5)', 'VAR Variabilidade da demanda (1-5)', 'TR Duração da reposição (1-5)', 'TRV Incerteza da reposição (1-5)',
    'Tempo de compra padrão (dias)', 'Base de consumo padrão', 'Taxa de indisponibilidade anual (permanentes)',
    'Nota (calculada)', 'Classe (calculada)'],
  UNIDADES: ['Código (UEOp)', 'Unidade', 'Policiais (efetivo)', 'Viaturas', 'Frações (sedes)', 'Considerar no cálculo (S/N)'],
  ITENS: ['Código', 'Descrição', 'Tipo', 'Família', 'Grupo no painel CPELOG', 'Unidade de medida',
    'Base de consumo (POLICIAL/VIATURA/UNIDADE/HISTORICO)', 'Taxa por base por mês', 'Consumo histórico mensal',
    'Desvio padrão do consumo mensal', 'Saldo em estoque (permanentes: estocado)', 'Em trânsito / empenhado',
    'Parque instalado (permanentes)', 'Taxa de indisponibilidade anual (permanentes)',
    'Ata de registro de preços vigente (S/N)', 'Prazo de entrega da ata (dias)',
    'Fase interna: demanda até abertura do processo (dias)', 'Licitação: abertura até homologação (dias)',
    'Contratação: homologação até empenho (dias)', 'Entrega do fornecedor (dias)', 'Distribuição até a ponta (dias)',
    'Atualizado do CPELOG em'],
  PROCESSOS: ['Nº do processo', 'Código do item', 'Família', 'Data da demanda', 'Data de abertura do processo',
    'Data da homologação', 'Data do empenho', 'Data de entrega no almoxarifado',
    'Fase interna (dias)', 'Licitação (dias)', 'Contratação (dias)', 'Entrega (dias)', 'Total (dias)'],
  RESULTADOS: ['Código', 'Descrição', 'Família', 'Tipo', 'Classe', 'Nota', 'Demanda mensal', 'Fonte da demanda',
    'Tempo de reposição (dias)', 'Origem do prazo', 'Estoque de segurança', 'Estoque mínimo / gatilho (ou reserva técnica)',
    'Estoque máximo', 'Posição (saldo + trânsito)', 'Cobertura (meses)', 'Situação', 'Data limite p/ iniciar compra',
    'Qtd sugerida', 'Justificativa (rastro decisório)']
};

var PARAMETROS_PADRAO = [
  ['peso_ESS', 10, 'Peso: essencialidade para o policiamento (missão principal)'],
  ['peso_SEG', 8, 'Peso: risco à segurança do policial/cidadão na falta'],
  ['peso_SUB', 5, 'Peso: dificuldade de substituição'],
  ['peso_CTL', 3, 'Peso: controle institucional (material controlado)'],
  ['peso_VAR', 4, 'Peso: variabilidade da demanda (picos, sazonalidade)'],
  ['peso_TR', 6, 'Peso: duração do tempo de reposição (calculada do prazo de compra)'],
  ['peso_TRV', 4, 'Peso: incerteza do tempo de reposição (calculada do histórico de processos)'],
  ['lim_operacional', 70, 'Nota mínima para classe Operacional'],
  ['lim_funcional', 45, 'Nota mínima para classe Funcional'],
  ['piso_essencial', 'S', 'S = item com essencialidade 5 é sempre Operacional'],
  ['reforco_variabilidade', 0.5, 'Acréscimo na margem quando VAR >= 4 (método sem desvio padrão)'],
  ['tolerancia_divergencia', 0.3, 'Alerta quando histórico difere do esperado pelo efetivo em mais que este percentual'],
  ['faixas_prazo', '30;60;120;240', 'Limites (dias) das notas 1 a 4 do critério TR; acima do último = 5'],
  ['Operacional.z', 2.05, 'Fator z do nível de serviço (2,05 = 98%)'],
  ['Operacional.margem_meses', 1, 'Margem em meses de consumo quando não há desvio padrão'],
  ['Operacional.horizonte_meses', 12, 'Meses de consumo cobertos por cada compra (define o máximo)'],
  ['Operacional.fator_reserva', 1.5, 'Multiplicador da reserva técnica (permanentes)'],
  ['Funcional.z', 1.65, 'Fator z (1,65 = 95%)'],
  ['Funcional.margem_meses', 0.5, ''],
  ['Funcional.horizonte_meses', 12, ''],
  ['Funcional.fator_reserva', 1, ''],
  ['Administrativo.z', 1.28, 'Fator z (1,28 = 90%)'],
  ['Administrativo.margem_meses', 0.25, ''],
  ['Administrativo.horizonte_meses', 6, ''],
  ['Administrativo.fator_reserva', 0.5, '']
];

/** Lê a aba PARAMETROS e monta o objeto usado pelo cálculo. */
function lerParametros_(linhas) {
  var v = {};
  linhas.forEach(function (l) { if (l[0] !== '') v[String(l[0]).trim()] = l[1]; });
  function n(k, padrao) { var x = Number(v[k]); return isNaN(x) || v[k] === '' || v[k] === undefined ? padrao : x; }
  var classes = {};
  ['Operacional', 'Funcional', 'Administrativo'].forEach(function (c) {
    classes[c] = { z: n(c + '.z', 1.65), margemMeses: n(c + '.margem_meses', 0.5), horizonteMeses: n(c + '.horizonte_meses', 12), fatorReserva: n(c + '.fator_reserva', 1) };
  });
  return {
    pesos: { ESS: n('peso_ESS', 10), SEG: n('peso_SEG', 8), SUB: n('peso_SUB', 5), CTL: n('peso_CTL', 3), VAR: n('peso_VAR', 4), TR: n('peso_TR', 6), TRV: n('peso_TRV', 4) },
    limOperacional: n('lim_operacional', 70), limFuncional: n('lim_funcional', 45),
    pisoEssencial: String(v.piso_essencial || 'S').toUpperCase().charAt(0) === 'S',
    reforcoVariabilidade: n('reforco_variabilidade', 0.5), toleranciaDivergencia: n('tolerancia_divergencia', 0.3),
    faixasPrazo: String(v.faixas_prazo || '30;60;120;240').split(/[;,]/).map(Number),
    classes: classes
  };
}

var FAMILIAS_PADRAO = [
  ["C01", "Munição real de dotação", "CONSUMO", "Cartuchos reais por calibre; uso controlado", 5, 5, 5, 5, 3, 5, 4, 360, "HISTORICO", ""],
  ["C02", "Munições químicas e de impacto controlado", "CONSUMO", "Granadas, cartuchos de efeito moral, projéteis lacrimogêneos; validade e uso em distúrbios", 5, 5, 4, 5, 5, 5, 4, 360, "HISTORICO", ""],
  ["C03", "Espargidores (agentes químicos portáteis)", "CONSUMO", "Espargidor pimenta/CS de porte individual; validade", 4, 4, 4, 4, 3, 4, 3, 240, "POLICIAL", ""],
  ["C04", "Insumos de arma de condução elétrica (PEIE)", "CONSUMO", "Cartuchos de dardo, baterias, data-kit e coldre de PEIE/Spark", 4, 4, 5, 5, 3, 5, 4, 300, "HISTORICO", ""],
  ["C05", "Proteção balística individual", "CONSUMO", "Coletes balísticos (vida útil/validade da placa)", 5, 5, 5, 4, 2, 5, 4, 360, "POLICIAL", ""],
  ["C06", "Peças e acessórios de armamento", "CONSUMO", "Carregadores, desmuniciadores, zarelhos", 4, 3, 4, 5, 2, 5, 4, 360, "HISTORICO", ""],
  ["C07", "Equipamento individual de cinto", "CONSUMO", "Algema, coldre, cinturão, bastão, fiel, bandoleira", 4, 4, 3, 3, 2, 4, 3, 240, "POLICIAL", ""],
  ["C08", "Controle de distúrbios civis", "CONSUMO", "Capacete, escudo, caneleira antitumulto, cotoveleira, joelheira", 4, 4, 4, 3, 5, 4, 3, 240, "HISTORICO", ""],
  ["C09", "Capa de colete e porta-equipamentos", "CONSUMO", "Capas de colete policial", 3, 2, 3, 2, 2, 4, 3, 240, "POLICIAL", ""],
  ["C10", "Iluminação tática", "CONSUMO", "Lanternas táticas e portáteis", 4, 4, 3, 2, 2, 3, 3, 180, "POLICIAL", ""],
  ["C11", "Sinalização viária e bloqueio", "CONSUMO", "Cones, cavaletes, fita zebrada, sinalizadores, lombada portátil, limitador de fuga, apito", 4, 4, 3, 2, 4, 3, 3, 180, "HISTORICO", ""],
  ["C12", "Descartáveis de fiscalização de trânsito", "CONSUMO", "Bocal descartável de etilômetro (sem ele não há teste)", 4, 3, 5, 3, 3, 4, 3, 180, "HISTORICO", ""],
  ["C13", "Pneus", "CONSUMO", "Pneus de viaturas e motocicletas, por medida", 5, 5, 5, 3, 2, 4, 4, 180, "VIATURA", ""],
  ["C14", "Peças de manutenção preventiva da frota", "CONSUMO", "Filtros, pastilhas/lonas/discos de freio, palhetas, lâmpadas e cabos de vela: desgaste previsível por km", 4, 3, 4, 2, 2, 4, 3, 120, "VIATURA", ""],
  ["C15", "Lubrificantes e fluidos", "CONSUMO", "Óleos de motor/náuticos, fluido de freio, aditivos", 3, 2, 3, 2, 2, 3, 2, 120, "VIATURA", ""],
  ["C16", "Combustíveis", "CONSUMO", "Gasolina, diesel, álcool combustível, querosene", 5, 5, 5, 3, 3, 2, 2, 30, "VIATURA", ""],
  ["C17", "Peças de reparo corretivo da frota", "CONSUMO", "Suspensão, direção, transmissão e motor (ex.: carburador, junta, homocinética): demanda por falha, específica por modelo", 4, 4, 5, 2, 4, 5, 5, 240, "VIATURA", ""],
  ["C18", "Baterias veiculares e partida", "CONSUMO", "Baterias automotivas, cabos e garras de transferência de carga", 4, 3, 4, 2, 3, 3, 3, 120, "VIATURA", ""],
  ["C19", "Peças e acessórios náuticos", "CONSUMO", "Hélices, componentes de motor de popa, bomba e tanque de combustível de embarcação, remos", 4, 3, 5, 2, 4, 5, 5, 300, "HISTORICO", ""],
  ["C20", "Salvatagem aquática", "CONSUMO", "Coletes salva-vidas e de salvamento", 5, 5, 4, 2, 2, 4, 3, 240, "HISTORICO", ""],
  ["C21", "Captura e manejo de fauna", "CONSUMO", "Ganchos, pinções, puçás, laço cambão, redes, caixas e sacos de contenção", 4, 3, 4, 2, 3, 4, 4, 240, "HISTORICO", ""],
  ["C22", "Combate a incêndio florestal", "CONSUMO", "Abafadores, óculos e capacetes de combate a incêndio (pico sazonal na seca)", 4, 4, 4, 2, 5, 4, 3, 180, "HISTORICO", ""],
  ["C23", "Acessórios de radiocomunicação", "CONSUMO", "Baterias e carregadores de HT, PTT, fones e teclas de rádio", 5, 5, 4, 3, 2, 4, 4, 240, "HISTORICO", ""],
  ["C24", "Pilhas e baterias portáteis", "CONSUMO", "Pilhas, baterias recarregáveis, carregadores de pilha (alimentam lanternas, etilômetros etc.)", 3, 2, 2, 1, 2, 2, 2, 90, "POLICIAL", ""],
  ["C25", "Equipamentos de inteligência", "CONSUMO", "Rastreadores, gravadores e dispositivos dissimulados", 4, 3, 5, 5, 3, 5, 4, 300, "HISTORICO", ""],
  ["C26", "APH e primeiros socorros operacionais", "CONSUMO", "Torniquete, bandagem de emergência, kits de primeiros socorros", 5, 5, 4, 2, 3, 3, 3, 120, "HISTORICO", ""],
  ["C27", "Medicamentos", "CONSUMO", "Fármacos e soluções; controle de validade", 3, 2, 4, 4, 2, 4, 3, 180, "HISTORICO", ""],
  ["C28", "Material médico-hospitalar descartável", "CONSUMO", "Seringas, agulhas, luvas de procedimento, gaze, ataduras, máscaras, toucas, lençóis", 3, 2, 2, 2, 2, 3, 2, 120, "HISTORICO", ""],
  ["C29", "Material de consumo odontológico", "CONSUMO", "Resinas, cimentos, brocas, pontas, matrizes, anestésicos odontológicos", 2, 1, 4, 2, 2, 4, 3, 180, "HISTORICO", ""],
  ["C30", "Esterilização e controle", "CONSUMO", "Indicadores, embalagens e testes de autoclave", 3, 2, 4, 2, 2, 4, 3, 180, "HISTORICO", ""],
  ["C31", "Vestuário de alta visibilidade e coletes de função", "CONSUMO", "Coletes refletivos e de policiamento/fiscalização (segurança em rodovia)", 4, 4, 3, 2, 2, 4, 3, 180, "POLICIAL", ""],
  ["C32", "Uniformes e vestuário institucional", "CONSUMO", "Peças de fardamento, agasalhos, capotes, capas de chuva, luvas PMMG, insígnias", 3, 2, 3, 2, 4, 4, 3, 180, "POLICIAL", ""],
  ["C33", "EPI de trabalho", "CONSUMO", "Luvas de raspa/segurança, óculos, protetor auricular, máscaras, capacete de segurança, protetor solar", 3, 3, 2, 2, 2, 3, 2, 120, "POLICIAL", ""],
  ["C34", "Capacete de motociclista", "CONSUMO", "Capacetes para patrulhamento motorizado", 4, 4, 4, 2, 2, 4, 3, 180, "HISTORICO", ""],
  ["C35", "Operações prolongadas e acampamento", "CONSUMO", "Saco de dormir, barraca, bolsas táticas e de lona, caixa térmica", 3, 2, 3, 2, 4, 4, 3, 180, "HISTORICO", ""],
  ["C36", "Instrução e treinamento", "CONSUMO", "Alvos, obreias, tatames, cones de atletismo", 2, 1, 2, 2, 4, 3, 2, 120, "HISTORICO", ""],
  ["C37", "Suprimentos de impressão", "CONSUMO", "Toners, cartuchos, refis, fitas e fotocondutores de impressora", 2, 1, 3, 1, 2, 3, 2, 120, "HISTORICO", ""],
  ["C38", "Periféricos e acessórios de informática", "CONSUMO", "Mouse, teclado, cabos, adaptadores, pendrives, mídias, cartões de memória, fontes", 2, 1, 2, 1, 2, 2, 2, 90, "HISTORICO", ""],
  ["C39", "Telefonia fixa", "CONSUMO", "Aparelhos telefônicos simples", 2, 1, 1, 1, 1, 2, 2, 90, "HISTORICO", ""],
  ["C40", "Papel para impressão", "CONSUMO", "Papel A4/ofício, formulário contínuo, papel plano e vergê", 2, 1, 1, 1, 2, 3, 2, 120, "POLICIAL", ""],
  ["C41", "Impressos personalizados PMMG", "CONSUMO", "Formulários e impressos institucionais específicos (verificar se algum é de uso operacional)", 3, 2, 4, 3, 2, 4, 3, 180, "HISTORICO", ""],
  ["C42", "Material de expediente", "CONSUMO", "Canetas, lápis, clipes, grampos, pastas, envelopes, colas, fitas, livros de registro", 1, 1, 1, 1, 2, 2, 2, 90, "POLICIAL", ""],
  ["C43", "Limpeza e higiene de alto giro", "CONSUMO", "Saneantes e descartáveis de higiene: detergente, desinfetante, água sanitária, sabão, papel higiênico, papel toalha, sabonete, sacos de lixo", 2, 1, 1, 1, 2, 2, 2, 90, "POLICIAL", ""],
  ["C44", "Utensílios de limpeza", "CONSUMO", "Vassouras, rodos, baldes, pás, panos, esponjas, flanelas, escovas", 1, 1, 1, 1, 1, 2, 2, 90, "UNIDADE", ""],
  ["C45", "Copa e cozinha", "CONSUMO", "Copos descartáveis, guardanapos, canudos, garrafas térmicas", 1, 1, 1, 1, 2, 2, 2, 90, "POLICIAL", ""],
  ["C46", "Gêneros alimentícios", "CONSUMO", "Alimentos perecíveis/semiperecíveis (validade curta)", 2, 1, 1, 1, 3, 2, 2, 60, "HISTORICO", ""],
  ["C47", "Manutenção predial - hidráulica", "CONSUMO", "Torneiras, registros, conexões, chuveiros, reparos de descarga", 2, 1, 2, 1, 3, 2, 2, 90, "UNIDADE", ""],
  ["C48", "Manutenção predial - elétrica e iluminação", "CONSUMO", "Lâmpadas, luminárias, disjuntores, extensões, filtros de linha, conectores", 2, 1, 2, 1, 2, 2, 2, 90, "UNIDADE", ""],
  ["C49", "Manutenção predial - pintura", "CONSUMO", "Tintas, massa corrida, rolos, trinchas, solventes, lixas", 1, 1, 1, 1, 3, 2, 2, 90, "UNIDADE", ""],
  ["C50", "Ferragens, portões e segurança predial", "CONSUMO", "Fechaduras, cadeados, portões, cremalheiras, grades, postes", 2, 1, 3, 2, 2, 3, 3, 120, "UNIDADE", ""],
  ["C51", "Ferramentas manuais e de campo", "CONSUMO", "Chaves, alicates, trenas, paquímetro, ferro de solda, facão, enxada", 2, 1, 2, 1, 2, 2, 2, 90, "HISTORICO", ""],
  ["C52", "Cerimonial e símbolos", "CONSUMO", "Bandeiras, estandartes, rosetas, pedestais, talabartes", 1, 1, 2, 1, 2, 3, 2, 120, "HISTORICO", ""],
  ["C53", "Mobiliário e utilidades de consumo", "CONSUMO", "Colchões, cadeiras/mesas plásticas, lixeiras, quadros, varais", 1, 1, 1, 1, 1, 2, 2, 90, "UNIDADE", ""],
  ["C54", "Amarração e transporte de carga", "CONSUMO", "Cintas, cordas, lonas, carrinho de bagagem", 3, 2, 2, 1, 3, 2, 2, 90, "HISTORICO", ""],
  ["C55", "Limpeza e estética veicular", "CONSUMO", "Xampu automotivo, limpa-pneu", 1, 1, 1, 1, 1, 2, 2, 90, "VIATURA", ""],
  ["C56", "Controle de acesso e credenciais", "CONSUMO", "Smart cards, crachás", 2, 1, 3, 3, 1, 3, 2, 120, "HISTORICO", ""],
  ["C57", "Educativo e recreativo", "CONSUMO", "Brinquedos educativos e livros (programas educacionais)", 1, 1, 1, 1, 2, 3, 2, 120, "HISTORICO", ""],
  ["C58", "Munição de instrução e treinamento", "CONSUMO", "Munição para treinamento, festim e manejo (instrução de tiro)", 2, 1, 3, 5, 3, 5, 4, 360, "HISTORICO", ""],
  ["P01", "Armamento letal", "PERMANENTE", "Pistolas, revólveres, carabinas, fuzis, espingardas, (sub)metralhadoras", 5, 5, 5, 5, "", 5, 4, 540, "", 0.05],
  ["P02", "Armas de menor potencial ofensivo", "PERMANENTE", "Armas de imobilização (PEIE) e lançadores não letais", 5, 5, 5, 5, "", 5, 4, 360, "", 0.1],
  ["P03", "Armamento de treinamento", "PERMANENTE", "Armas de treinamento e carabinas de pressão", 2, 1, 3, 4, "", 4, 3, 360, "", 0.05],
  ["P04", "Proteção balística permanente", "PERMANENTE", "Escudos e capacetes balísticos", 5, 5, 5, 4, "", 5, 4, 360, "", 0.05],
  ["P05", "Óptica e acessórios de armamento", "PERMANENTE", "Miras e magnificadores", 3, 2, 4, 4, "", 4, 3, 360, "", 0.05],
  ["P06", "Guarda de armamento e munição", "PERMANENTE", "Cofres de armamento/munição e cofres de escritório", 3, 2, 3, 4, "", 3, 3, 240, "", 0.02],
  ["P07", "Radiocomunicação operacional", "PERMANENTE", "Rádios HT/veiculares, repetidoras, antenas, torres, links, internet satélite", 5, 5, 5, 3, "", 5, 4, 360, "", 0.1],
  ["P08", "Telefonia e celulares", "PERMANENTE", "Celulares funcionais, telefones, PABX, fax", 3, 2, 2, 2, "", 3, 3, 180, "", 0.15],
  ["P09", "Viaturas operacionais", "PERMANENTE", "Camionetes, viaturas com cela, utilitários, motocicletas, automóveis de serviço", 5, 5, 5, 3, "", 5, 5, 540, "", 0.2],
  ["P10", "Reboques e transporte de apoio", "PERMANENTE", "Reboques, semirreboques, carretas, ônibus, bicicletas", 3, 2, 3, 2, "", 4, 3, 360, "", 0.1],
  ["P11", "Embarcações e propulsão", "PERMANENTE", "Barcos, lanchas, jet-skis, botes, motores de popa e reboques de embarcação", 5, 5, 5, 3, "", 5, 5, 540, "", 0.15],
  ["P12", "Aeronaves remotamente pilotadas", "PERMANENTE", "Drones (RPA)", 4, 3, 4, 3, "", 5, 4, 360, "", 0.15],
  ["P13", "Fiscalização de trânsito", "PERMANENTE", "Etilômetros, sistemas de fiscalização eletrônica, tacógrafo", 5, 4, 5, 4, "", 5, 4, 360, "", 0.15],
  ["P14", "Instrumentos de fiscalização ambiental", "PERMANENTE", "Sonômetros, luxímetros, turbidímetros, clinômetros, GPS de campo, paquímetros, leitores de microchip", 4, 3, 4, 2, "", 4, 4, 300, "", 0.1],
  ["P15", "Captura e manejo de fauna (permanente)", "PERMANENTE", "Laços cambão e pinções", 4, 3, 3, 2, "", 4, 3, 240, "", 0.15],
  ["P16", "Combate a incêndio florestal (permanente)", "PERMANENTE", "Bombas costais e capacetes de combate a incêndio", 4, 4, 3, 2, "", 4, 3, 240, "", 0.1],
  ["P17", "Observação e detecção", "PERMANENTE", "Binóculos, monóculos, detectores e portais de metais", 4, 3, 3, 2, "", 4, 3, 240, "", 0.1],
  ["P18", "Inteligência e registro dissimulado", "PERMANENTE", "Equipamentos de escuta e microcâmeras dissimuladas", 4, 3, 5, 5, "", 5, 4, 360, "", 0.1],
  ["P19", "Videomonitoramento e segurança eletrônica", "PERMANENTE", "Câmeras, CFTV, gravadores, alarmes, automatizadores de portão, cancelas", 3, 2, 3, 2, "", 4, 3, 240, "", 0.1],
  ["P20", "Informática - estações de trabalho", "PERMANENTE", "Computadores, notebooks, monitores, tablets", 3, 2, 3, 2, "", 4, 3, 300, "", 0.1],
  ["P21", "Informática - rede e energia", "PERMANENTE", "Servidores, switches, roteadores, racks, pontos de acesso, nobreaks, estabilizadores", 4, 3, 4, 2, "", 4, 3, 300, "", 0.1],
  ["P22", "Impressão e digitalização", "PERMANENTE", "Impressoras, multifuncionais, scanners, copiadoras", 2, 1, 2, 1, "", 3, 3, 240, "", 0.1],
  ["P23", "Periféricos de informática", "PERMANENTE", "Webcams, leitores, gravadores de DVD, HDs, carregadores", 1, 1, 1, 1, "", 2, 2, 180, "", 0.1],
  ["P24", "Registro de imagem", "PERMANENTE", "Câmeras fotográficas e filmadoras, lentes, flashes (registro de ocorrências)", 3, 2, 3, 2, "", 4, 3, 240, "", 0.1],
  ["P25", "Audiovisual e eventos", "PERMANENTE", "Projetores, telas, caixas acústicas, microfones, mesas de som, TVs, video wall", 1, 1, 1, 1, "", 3, 2, 240, "", 0.05],
  ["P26", "Climatização", "PERMANENTE", "Ar-condicionado, ventiladores, climatizadores", 2, 1, 2, 1, "", 3, 3, 240, "", 0.1],
  ["P27", "Eletrodomésticos de copa e cozinha", "PERMANENTE", "Refrigeradores, fogões, fornos, freezers, bebedouros, purificadores", 2, 1, 2, 1, "", 3, 2, 240, "", 0.05],
  ["P28", "Prevenção de incêndio predial", "PERMANENTE", "Extintores (recarga e validade regulatória)", 4, 4, 3, 2, "", 2, 2, 90, "", 0.05],
  ["P29", "Geração e energia", "PERMANENTE", "Geradores, painéis fotovoltaicos, conversores", 3, 2, 4, 1, "", 4, 3, 300, "", 0.05],
  ["P30", "Equipamentos de oficina e manutenção", "PERMANENTE", "Compressores, lavadoras, furadeiras, elevadores veiculares, máquinas de solda, ferramentas elétricas", 2, 1, 2, 1, "", 3, 3, 240, "", 0.1],
  ["P31", "Jardinagem e roçada", "PERMANENTE", "Roçadeiras, aparadores, cortadores de grama, motosserras, sopradores", 1, 1, 1, 1, "", 3, 2, 240, "", 0.15],
  ["P32", "Equipamentos médico-hospitalares", "PERMANENTE", "Desfibrilador, ECG, esfigmomanômetros, estetoscópios, macas, autoclaves", 3, 2, 4, 2, "", 4, 3, 300, "", 0.05],
  ["P33", "Equipamentos e instrumental odontológico", "PERMANENTE", "Consultórios, micromotores, instrumental cirúrgico odontológico", 2, 1, 3, 2, "", 4, 3, 300, "", 0.05],
  ["P34", "Material esportivo e academia", "PERMANENTE", "Equipamentos de TFM e musculação", 1, 1, 1, 1, "", 3, 2, 240, "", 0.05],
  ["P35", "Acampamento e estruturas temporárias", "PERMANENTE", "Barracas e tendas (operações e eventos)", 3, 2, 3, 1, "", 3, 3, 240, "", 0.1],
  ["P36", "Movimentação e armazenagem", "PERMANENTE", "Carrinhos, plataformas, estrados, balanças", 1, 1, 1, 1, "", 2, 2, 180, "", 0.05],
  ["P37", "Equipamentos administrativos", "PERMANENTE", "Fragmentadoras, guilhotinas, encadernadoras, rotuladores, protocoladoras", 1, 1, 1, 1, "", 2, 2, 180, "", 0.05],
  ["P38", "Mobiliário e alojamento", "PERMANENTE", "Armários, mesas, cadeiras, arquivos, estantes, camas, roupeiros", 1, 1, 1, 1, "", 3, 2, 240, "", 0.02],
  ["P39", "Acervo, arte e cerimonial", "PERMANENTE", "Relógios, objetos religiosos, acervo bibliográfico, manequins", 1, 1, 1, 1, "", 2, 2, 180, "", 0.02],
  ["C99", "A revisar (consumo)", "CONSUMO", "Não enquadrados pelas regras: reclassificar na aba ITENS", 3, 3, 3, 3, 3, 3, 3, 180, "HISTORICO", ""],
  ["P99", "A revisar (permanente)", "PERMANENTE", "Não enquadrados pelas regras: reclassificar na aba ITENS", 3, 3, 3, 3, "", 3, 3, 240, "", 0.05],
];

/** Índices (base 0) das colunas da aba ITENS. */
var COL = { CODIGO: 0, DESCRICAO: 1, TIPO: 2, FAMILIA: 3, GRUPO: 4, UNIDADE_MEDIDA: 5, BASE: 6, TAXA: 7, HIST: 8, DESVIO: 9,
  SALDO: 10, TRANSITO: 11, PARQUE: 12, INDISP: 13, ATA: 14, PRAZO_ATA: 15, FASE_INTERNA: 16, LICITACAO: 17,
  CONTRATACAO: 18, ENTREGA: 19, DISTRIBUICAO: 20, ATUALIZADO: 21 };

/** Colunas que o sistema preenche com valor padrão (texto cinza) e o usuário pode substituir pelo real. */
var COLUNAS_PADRAO = [COL.BASE, COL.INDISP, COL.FASE_INTERNA, COL.LICITACAO, COL.CONTRATACAO, COL.ENTREGA, COL.DISTRIBUICAO];
var COR_PADRAO = '#9e9e9e';

/** Como o tempo de compra padrão da família se divide entre as fases (estimativa; o real substitui). */
var DIVISAO_FASES = { interna: 0.20, licitacao: 0.45, contratacao: 0.10, entrega: 0.25 };
var DISTRIBUICAO_PADRAO_DIAS = 10;

/** Exemplos fictícios para mostrar o formato esperado. Apague ao carregar os dados reais. */
var UNIDADES_EXEMPLO = [
  ['EXEMPLO-1', 'EXEMPLO - Batalhão A (fictício)', 120, 15, 8, 'S'],
  ['EXEMPLO-2', 'EXEMPLO - Batalhão B (fictício)', 80, 10, 6, 'S']
];
var ITENS_EXEMPLO = [
  ['EX-001', 'EXEMPLO - PAPEL TOALHA (fictício)', 'CONSUMO', 'C43', '', 'pacote', 'POLICIAL', 0.5, 110, 20, 300, 0, '', '', 'N', '', '', '', '', '', 7, ''],
  ['EX-002', 'EXEMPLO - PNEU 205/65 R15 (fictício)', 'CONSUMO', 'C13', '', 'unidade', 'VIATURA', 0.15, '', '', 12, 0, '', '', 'S', 30, '', '', '', '', '', ''],
  ['EX-003', 'EXEMPLO - RÁDIO TRANSCEPTOR (fictício)', 'PERMANENTE', 'P07', '', 'unidade', '', '', '', '', 4, 0, 200, '', 'N', '', '', '', '', '', '', '']
];
var PROCESSOS_EXEMPLO = [
  ['EX-PROC-1', '', 'C43', '2025-02-03', '2025-03-10', '2025-06-20', '2025-07-01', '2025-07-25'],
  ['EX-PROC-2', '', 'C43', '2025-08-04', '2025-08-29', '2025-11-14', '2025-11-24', '2025-12-19']
];


/* ===================== Calculo.gs ===================== */

/**
 * Motor de cálculo: criticidade, estoque mínimo (ponto de pedido), estoque máximo,
 * reserva técnica e data limite para iniciar o processo de compra.
 *
 * Funções puras (sem SpreadsheetApp) para poderem ser testadas fora do Google.
 *
 * Classificação técnica das entradas:
 *  - VARIÁVEIS (números medidos, entram nas fórmulas): efetivo, taxa de consumo por
 *    policial/viatura/unidade, consumo histórico e seu desvio, saldo, em trânsito,
 *    tempo de compra (por fase) e sua variação, prazo de entrega da ata, parque instalado.
 *  - CRITÉRIOS (julgamento 1-5, ponderado por pesos): essencialidade para o policiamento,
 *    risco à segurança na falta, dificuldade de substituição, controle institucional,
 *    variabilidade da demanda, duração e incerteza da reposição. Os dois últimos são
 *    derivados automaticamente das variáveis de tempo de compra, quando medidas.
 *  - PARÂMETROS (política do P4): pesos, limites de classe, nível de serviço, margens.
 */

var DIAS_MES = 30.4;

/** Converte o tempo de compra (dias) em nota 1-5 do critério "duração da reposição". */
function notaPorPrazo(dias, faixas) {
  if (!(dias > 0)) return null;
  for (var i = 0; i < faixas.length; i++) if (dias <= faixas[i]) return i + 1;
  return 5;
}

/** Converte coeficiente de variação (desvio/média) em nota 1-5. */
function notaPorCV(cv) {
  if (cv === null || cv === undefined || isNaN(cv)) return null;
  if (cv < 0.1) return 1;
  if (cv < 0.25) return 2;
  if (cv < 0.5) return 3;
  if (cv < 1) return 4;
  return 5;
}

/**
 * Nota de criticidade 0-100 e classe (pulmão).
 * notas: {ESS, SEG, SUB, CTL, VAR, TR, TRV} 1-5; pesos: mesmo formato (0-10).
 */
function criticidade(notas, pesos, p) {
  var soma = 0, den = 0, chaves = Object.keys(pesos);
  for (var i = 0; i < chaves.length; i++) {
    var k = chaves[i], w = Number(pesos[k]) || 0, n = Number(notas[k]);
    if (!w || !(n >= 1)) continue;
    soma += w * n; den += w;
  }
  var nota = den ? soma / den * 20 : 0;
  var classe = nota >= p.limOperacional ? 'Operacional' : nota >= p.limFuncional ? 'Funcional' : 'Administrativo';
  // Essencialidade máxima (item vital ao policiamento) nunca fica abaixo de Operacional.
  if (p.pisoEssencial && Number(notas.ESS) === 5) classe = 'Operacional';
  return { nota: nota, classe: classe };
}

/**
 * Demanda mensal do item.
 * base: POLICIAL | VIATURA | UNIDADE | HISTORICO
 * Retorna a demanda adotada e, quando há as duas fontes, a divergência entre
 * a demanda por direcionador (efetivo × taxa) e a histórica.
 */
function demandaMensal(item, efetivo) {
  var direcionador = { POLICIAL: efetivo.policiais, VIATURA: efetivo.viaturas, UNIDADE: efetivo.unidades }[item.base];
  var porTaxa = direcionador !== undefined && item.taxa > 0 ? direcionador * item.taxa : null;
  var hist = item.consumoHistorico > 0 ? item.consumoHistorico : null;
  var adotada, fonte;
  if (item.base !== 'HISTORICO' && porTaxa !== null) { adotada = porTaxa; fonte = item.base.toLowerCase() + ' × taxa'; }
  else { adotada = hist; fonte = hist === null ? 'sem dado' : 'histórico'; }
  var divergencia = porTaxa && hist ? (hist - porTaxa) / porTaxa : null;
  return { demanda: adotada, fonte: fonte, porTaxa: porTaxa, historico: hist, divergencia: divergencia };
}

/**
 * Tempo total de reposição (dias): da demanda à entrega na ponta.
 * item.fases = {interna, licitacao, contratacao, entrega, distribuicao}; item.fasesReais indica
 * quais foram digitadas pelo usuário (as demais são o padrão do sistema).
 * Prioridade: ata vigente > fases reais do item > histórico de processos > padrão do sistema.
 */
function tempoReposicao(item, familia, historico) {
  var f = item.fases || {}, reais = item.fasesReais || {};
  var distrib = Number(f.distribuicao) || 0;
  var compra = ['interna', 'licitacao', 'contratacao', 'entrega'];
  var algumaReal = compra.some(function (k) { return reais[k]; });
  if (item.ataVigente && item.prazoAta > 0) {
    return { dias: item.prazoAta + distrib, desvio: 0, origem: 'ata de registro de preços' };
  }
  if (algumaReal) {
    return { dias: compra.reduce(function (s, k) { return s + (Number(f[k]) || 0); }, 0) + distrib, desvio: 0, origem: 'fases informadas no item' };
  }
  if (historico && historico.n > 0) return { dias: historico.media + distrib, desvio: historico.desvio, origem: 'histórico de ' + historico.n + ' processo(s)' };
  var padrao = compra.reduce(function (s, k) { return s + (Number(f[k]) || 0); }, 0) || Number(familia.leadTimeDias) || 0;
  return { dias: padrao + distrib, desvio: 0, origem: 'padrão do sistema' };
}

/** Divide o tempo de compra padrão da família entre as fases. */
function fasesPadrao(leadTimeDias, divisao, distribuicao) {
  var lt = Number(leadTimeDias) || 0;
  return { interna: Math.round(lt * divisao.interna), licitacao: Math.round(lt * divisao.licitacao),
    contratacao: Math.round(lt * divisao.contratacao), entrega: Math.round(lt * divisao.entrega), distribuicao: distribuicao };
}

/**
 * Estoque de segurança, ponto de pedido (estoque mínimo/gatilho) e máximo para consumo.
 * Com desvio da demanda conhecido usa o modelo estatístico
 *   SS = z × √(LT·σd² + d²·σLT²)   (LT e σLT em meses)
 * senão usa margem em meses de consumo por classe (fator de pulmão, doc. item 10).
 */
function niveisConsumo(d, lt, classe, item, notaVar, p) {
  var cfg = p.classes[classe];
  var ltM = lt.dias / DIAS_MES, sLtM = (lt.desvio || 0) / DIAS_MES;
  var ss, metodo;
  if (item.desvioHistorico > 0) {
    ss = cfg.z * Math.sqrt(ltM * Math.pow(item.desvioHistorico, 2) + Math.pow(d * sLtM, 2));
    metodo = 'estatístico (z=' + cfg.z + ')';
  } else {
    var reforco = notaVar >= 4 ? p.reforcoVariabilidade : 0;
    ss = d * cfg.margemMeses * (1 + reforco) + (sLtM ? d * sLtM : 0);
    metodo = 'fator de pulmão (' + cfg.margemMeses + ' mês' + (reforco ? ' +' + Math.round(reforco * 100) + '%' : '') + ')';
  }
  var minimo = Math.ceil(d * ltM + ss);
  var maximo = Math.ceil(minimo + d * cfg.horizonteMeses);
  return { seguranca: Math.ceil(ss), minimo: minimo, maximo: maximo, metodo: metodo };
}

/** Situação e data limite para iniciar o processo de compra. */
function situacao(posicao, d, niveis, hoje) {
  if (!(d > 0)) return { status: 'Sem demanda informada', dataLimite: null, cobertura: null, sugerido: 0 };
  var cobertura = posicao / d;
  var status = posicao <= niveis.minimo ? 'INICIAR COMPRA' : posicao > niveis.maximo ? 'EXCESSO' : 'Dentro da faixa';
  var dataLimite = null;
  if (posicao > niveis.minimo) {
    dataLimite = new Date(hoje.getTime());
    dataLimite.setDate(dataLimite.getDate() + Math.floor((posicao - niveis.minimo) / d * DIAS_MES));
  }
  return { status: status, dataLimite: dataLimite, cobertura: cobertura, sugerido: Math.max(0, niveis.maximo - posicao) };
}

/** Reserva técnica de bens permanentes (doc. item 11). */
function reservaTecnica(item, lt, classe, p) {
  var cfg = p.classes[classe];
  var taxa = Number(item.taxaIndisponibilidade) || 0;
  var rt = Math.round((Number(item.parque) || 0) * taxa * (lt.dias / 365) * cfg.fatorReserva);
  var est = Number(item.saldo) || 0;
  var status = rt === 0 ? 'Sem reserva exigida' : est < rt ? 'RESERVA INSUFICIENTE' : est > 2 * rt ? 'EXCESSO' : 'Dentro da faixa';
  return { reserva: rt, status: status, sugerido: Math.max(0, rt - est) };
}

/** Média e desvio do tempo total (dias) dos processos de compra, por chave (item ou família). */
function estatisticaProcessos(processos) {
  var g = {};
  processos.forEach(function (pr) {
    if (!(pr.dias > 0)) return;
    [pr.item, pr.familia].forEach(function (k) { if (k) (g[k] = g[k] || []).push(pr.dias); });
  });
  var out = {};
  Object.keys(g).forEach(function (k) {
    var v = g[k], m = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    var s = v.length > 1 ? Math.sqrt(v.reduce(function (a, b) { return a + Math.pow(b - m, 2); }, 0) / (v.length - 1)) : 0;
    out[k] = { n: v.length, media: m, desvio: s };
  });
  return out;
}

/**
 * Calcula um item completo e devolve resultado + justificativa rastreável.
 */
function calcularItem(item, familia, efetivo, estatProc, p, hoje) {
  var hist = estatProc[item.codigo] || estatProc[item.familia];
  var lt = tempoReposicao(item, familia, hist);
  var notas = {
    ESS: familia.ESS, SEG: familia.SEG, SUB: familia.SUB, CTL: familia.CTL,
    VAR: notaPorCV(item.consumoHistorico > 0 && item.desvioHistorico >= 0 ? item.desvioHistorico / item.consumoHistorico : null) || familia.VAR,
    TR: notaPorPrazo(lt.dias, p.faixasPrazo) || familia.TR,
    TRV: notaPorCV(lt.dias > 0 && lt.desvio > 0 ? lt.desvio / lt.dias : null) || familia.TRV
  };
  var crit = criticidade(notas, p.pesos, p);
  var r = { codigo: item.codigo, descricao: item.descricao, familia: item.familia, tipo: familia.tipo, nota: crit.nota, classe: crit.classe, leadTime: lt.dias, origemLeadTime: lt.origem, notas: notas };
  if (familia.tipo === 'PERMANENTE') {
    var res = reservaTecnica(item, lt, crit.classe, p);
    r.minimo = res.reserva; r.maximo = null; r.status = res.status; r.sugerido = res.sugerido; r.dataLimite = null;
    r.demanda = null; r.justificativa = 'Reserva técnica = parque ' + item.parque + ' × indisp. ' + Math.round(item.taxaIndisponibilidade * 100) + '%/ano × ' + Math.round(lt.dias) + ' dias (' + lt.origem + ') × fator ' + p.classes[crit.classe].fatorReserva + ' [' + crit.classe + ']';
    return r;
  }
  var dm = demandaMensal(item, efetivo);
  r.demanda = dm.demanda; r.fonteDemanda = dm.fonte; r.divergencia = dm.divergencia;
  if (!(dm.demanda > 0)) {
    var porBase = { POLICIAL: 'por policial (e o efetivo em Unidades)', VIATURA: 'por viatura', UNIDADE: 'por fração' }[item.base];
    r.status = 'Sem demanda informada';
    r.justificativa = 'Falta o consumo: informe ' + (porBase ? 'a taxa ' + porBase + ' ou ' : '') + 'o consumo histórico mensal na aba Itens.';
    return r;
  }
  var nv = niveisConsumo(dm.demanda, lt, crit.classe, item, notas.VAR, p);
  var posicao = (Number(item.saldo) || 0) + (Number(item.emTransito) || 0);
  var st = situacao(posicao, dm.demanda, nv, hoje);
  r.seguranca = nv.seguranca; r.minimo = nv.minimo; r.maximo = nv.maximo; r.posicao = posicao;
  r.cobertura = st.cobertura; r.status = st.status; r.dataLimite = st.dataLimite; r.sugerido = st.sugerido;
  r.justificativa = 'Demanda ' + Math.round(dm.demanda) + '/mês (' + dm.fonte + '); reposição ' + Math.round(lt.dias) + ' dias (' + lt.origem + '); segurança por ' + nv.metodo + ' [' + crit.classe + ', nota ' + Math.round(crit.nota) + ']' +
    (dm.divergencia !== null && Math.abs(dm.divergencia) > p.toleranciaDivergencia ? '; ATENÇÃO: histórico ' + (dm.divergencia > 0 ? 'acima' : 'abaixo') + ' do esperado pelo efetivo em ' + Math.round(Math.abs(dm.divergencia) * 100) + '%' : '');
  return r;
}

if (typeof module !== 'undefined') {
  module.exports = { notaPorPrazo: notaPorPrazo, notaPorCV: notaPorCV, criticidade: criticidade, demandaMensal: demandaMensal, tempoReposicao: tempoReposicao, fasesPadrao: fasesPadrao, niveisConsumo: niveisConsumo, situacao: situacao, reservaTecnica: reservaTecnica, estatisticaProcessos: estatisticaProcessos, calcularItem: calcularItem };
}


/* ===================== Classificacao.gs ===================== */

/**
 * Enquadra cada material em uma família de criticidade por regras de texto.
 * Ordem importa: a primeira regra que casa vence. Testa primeiro o nome do material
 * (antes do primeiro " - "), depois a descrição completa e por último o grupo do painel.
 */

var REGRAS_CONSUMO = [
  ["C01", "\\bMUNI[C\u00c7]"],
  ["C02", "GRANADA|EFEITO MORAL|PROJETIL CARGA|LACRIMOG.*GRANADA"],
  ["C03", "ESPARGIDOR|IMPO .*ESPARGIDOR"],
  ["C04", "SPARK|LANCADOR DE DARDO|DARDO DE CHOQUE|PISTOLA DE IMOBILIZ|ARMA NAO-LETAL|BATERIA PARA ARMAMENTO|CARREGADOR DE BATERIA PARA ARMAMENTO|PORTA CARTUCHO LANCADOR|PEIE"],
  ["C05", "COLETE DE PROTECAO BALISTICA|COLETE BAL"],
  ["C06", "CARREGADOR DA PISTOLA|CONJUNTO DO CARREGADOR|DESMUNICIADOR|ZARELHO|ARMAMENTO > CARREGADOR|CARREGADOR PARA ARMA"],
  ["C07", "ALGEMA|COLDRE|CINTURAO|BASTAO POLICIAL|BAST[A\u00c3]O DE MADEIRA|FIEL TATICO|BANDOLEIRA"],
  ["C08", "ANTITUMULTO|COTOVELEIRA|JOELHEIRA|CANELEIRA"],
  ["C09", "CAPA PARA COLETE|CAPA DE COLETE|CAMUFLADA"],
  ["C10", "LANTERNA"],
  ["C11", "CONE PARA SINALIZACAO|CAVALETE|FITA ZEBRADA|FITA DEMARCACAO|SINALIZADOR|BASTAO SINALIZADOR|LOMBADA|LIMITADOR DE FUGA|PINO PERFURADOR|DISPOSITIVO DE BLOQUEIO|CILINDRO CANALIZADOR|APITO"],
  ["C12", "BOCAL DESCARTAVEL"],
  ["C13", "\\bPNEU NOVO|PNEU PARA VEICULO|> PNEU"],
  ["C14", "FILTRO (DE AR|COMBUSTIVEL|LUBRIFICANTE|PARA MOTOR|USO VEICULAR|OLEO)|FILTRO DE AR PARA MOTO|PASTILHA|LONA DE FREIO|DISCO DE FREIO|PALHETA|LAMPADA AUTOMOTIVA|CABO DE VELAS|TACOGRAFO"],
  ["C15", "OLEO LUBRIFICANTE(?!, USO ODONTO)|FLUIDO PARA SISTEMA DE FREIO|ADITIVO AUTOMOTOR|OLEO EM SPRAY|10W|5W"],
  ["C16", "GASOLINA|DIESEL|ALCOOL COMBUSTIVEL|QUEROSENE"],
  ["C17", "BRACO OSCILANTE|COIFA|CRUZETA|JUNTA USO VEICULAR|TERMINAL DE DIRECAO|HOMOCINETICA|VALVULA USO VEICULAR|RESISTENCIA USO VEICULAR|TENSOR|CARBURADOR|AMORTECEDOR|EMBREAGEM|RADIADOR|BOMBA D"],
  ["C18", "CABO USO VEICULAR|GARRA PARA CONTATOS|BATERIA AUTOMOTIVA|BATERIA - TIPO: RECARREGAVEL; TENSAO: SAIDA 14"],
  ["C19", "HELICE|MOTOR DE POPA|EMBARCACAO|REMOS|YAMAHA \\(MOTOR"],
  ["C20", "SALVA-VIDAS|COLETE PARA SALVAMENTO"],
  ["C21", "CAPTURA|PUCA|LACO CAMBAO|PINCAO|SACO DE CONTEN|TRANSPORTE DE ANIMAIS|MACACAO PARA CAPTURA|ARREMESSO"],
  ["C22", "ABAFADOR PARA COMBATE|INCENDIO|INC\u00caNCIO|INC\u00caNDIO"],
  ["C23", "TELECOMUNICACAO|BATERIA DE HT|RADIO DE COMUNICACAO|RADIO COMUNICADOR|PTT|EQUIP.COMUNICACAO"],
  ["C24", "\\bPILHA|CARREGADOR DE PILHA|CARREGADOR PORTATIL|CARREGADOR BATERIA|BATERIA PARA RPA|^BATERIA\\b|CARREGADOR PARA BATERIA"],
  ["C25", "INTELIGENCIA"],
  ["C26", "TORNIQUETE|BANDAGEM DE EMERGENCIA|PRIMEIROS SOCORROS"],
  ["C27", "PRINCIPIO ATIVO|SOLUCAO DE RINGER|DILUENTE|GLICOSE|CLORETO DE SODIO|SAIS PARA REIDRATACAO|DIPIRONA|CLOREXIDINA|PEROXIDO|MEDICAMENTO"],
  ["C28", "SERINGA(?!.*ODONTO)|AGULHA(?! GENGIVAL)|LUVA (CIRURGICA|DE PROCEDIMENTO|DESCARTAVEL)|GAZE|ATADURA|ESPARADRAPO|MASCARA DESCARTAVEL|TOUCA|LENCOL|CAMPO BABADOR|TOALHA CIRURGICA|SONDA|INTRAVENOSO|LANCETA|ABAIXADOR|BISTURI|FIOS DE SUTURA USO MEDICO|TERMOMETRO|GEL - APLICACAO|AVENTAL|OCULOS DE PROTECAO USO HOSP|HOSPITALAR|MALETA USO MEDICO|HASTE FLEXIVEL"],
  ["C29", "ODONTO|GENGIVAL|PROFILAXIA|ARKANSAS|CENTRIX|MANDRIL|CUNHA|CARBONATO HIDROGENADO|EVIDENCIADOR|SELANTE|RESINA|\\bDENTAL"],
  ["C30", "ESTERILIZACAO|AUTOCLAVE"],
  ["C31", "COLETE (MASCULINO|PARA POLICIAMENTO|PARA FUNCAO)|REFLETIVO"],
  ["C32", "(?<!USO )PMMG|CAPOTE|CAPA PARA CHUVA|AGASALHO|\\bBRACADEIRA|INSIGNIA|JAQUETA|CALCA|CADARCO|UNIFORME"],
  ["C33", "LUVA DE RASPA|LUVA PARA SEGURANCA|OCULOS DE SEGURANCA|ABAFADOR DE RUIDO|MASCARA (DE PROTECAO|FACIAL)|CAPACETE TIPO SEGURANCA|PROTETOR SOLAR|\\bLUVA\\b(?! PARA LIMPEZA)"],
  ["C34", "CAPACETE PARA MOTOCICL"],
  ["C35", "SACO DE DORMIR|BARRACA|BOLSA TATICA|BOLSA DE LONA|CAIXA TERMICA"],
  ["C36", "ALVO PARA TREINAMENTO|OBREIA|TATAME|CONES PARA ATLETISMO"],
  ["C37", "TONER|CARTUCHO (NOVO|ORIGINAL)|FITA (NOVA|ORIGINAL|SIMILAR) PARA IMPRESSORA|FOTOCONDUTOR|REFIL DE TINTA|FITA PARA ROTULADOR|FITA TERMO"],
  ["C38", "MOUSE|TECLADO|CABO (DE REDE|PARA AUDIO|PARA TRANSMISSAO)|ADAPTADOR PARA EQUIP|PENDRIVE|MIDIA|CARTAO DE MEMORIA|FONTE DE ALIMENTACAO|PLACA/ADAPTADOR|ARMAZENAMENTO EXTERNO|CAIXA SOM|APRESENTADOR|IMPRESSORA$|^IMPRESSORA|FAC-SIMILE|INFORMATICA"],
  ["C39", "APARELHO TELEFONICO|^FONE$"],
  ["C40", "PAPEL PARA ESCRITORIO|PAPEL PLANO|PAPEL VERGE|FORMULARIO CONTINUO|BOBINA"],
  ["C41", "IMPRESSOS PERSONALIZADOS"],
  ["C42", "CANETA|LAPIS|CLIPS|GRAMP|PASTA|ENVELOPE|\\bCOLA\\b|FITA (ADESIVA|CREPE)|LIVRO (ATA|PARA REGISTRO)|CORRETIVO|BORRACHA|REGUA|PERFURADOR|EXTRATOR|TESOURA|ESTILETE|CARIMBO|MARCA TEXTO|MARCADOR|PINCEL (ATOMICO|PARA QUADRO)|APAGADOR|ALFINETE|BLOCO|ETIQUETA|COLCHETE|CAIXA (ARQUIVO|PARA ARQUIVO)|CALCULADORA|PRANCHETA|CAIXA PARA CORRESP|BARBANTE|GOMINHA|VINIL|PROTETOR PLASTICO|FILME MULTI"],
  ["C43", "DETERGENTE|DESINFETANTE|AGUA SANITARIA|SABAO|SABONETE|PAPEL HIGIENICO|PAPEL TOALHA|TOALHA DE PAPEL|SACO DE LIXO|SACO PLASTICO|ALCOOL|LIMPA VIDRO|LIMPADOR|DESENGORDURANTE|DESODORIZADOR|SAPONACEO|CERA|LUSTRA|INSETICIDA|LIMPA PEDRAS|SPRAY PARA REMOCAO|LENCO|FIO DENTAL|ESCOVA PARA PROFILAXIA"],
  ["C44", "VASSOUR|RODO|BALDE|PA PARA LIXO|PANO|ESPONJA|FLANELA|ESCOVA|ESFREGAO|FIBRA (DE|PARA) LIMPEZA|LA DE ACO|PALHAS DE ACO|ESPANADOR|DESENTUPIDOR|LUVA PARA LIMPEZA|BORRIFADOR|ESTOPA|PA DE MULTI"],
  ["C45", "COPO DESCARTAVEL|GUARDANAPO|CANUDO|GARRAFA TERMICA|GARRAFA T\u00c9RMICA|ISQUEIRO"],
  ["C46", "MARGARINA|GENEROS ALIMENT"],
  ["C47", "TORNEIRA|REGISTRO|JOELHO|\\bTE \\(|UNIAO|BUCHA|CHUVEIRO|BRACO DE CHUVEIRO|REPARO CAIXA|BOIA|ASSENTO PARA VASO|MANGUEIRA|FITA PARA VEDACAO|REFIL PURIFICADOR|BICO DE TORNEIRA|HIDRAULIC|SANITARI"],
  ["C48", "LAMPADA LED|LUMINARIA|DISJUNTOR|EXTENSAO ELETRICA|FILTRO DE LINHA|BENJAMIM|CONECTOR ELETRICO|FITA ISOLANTE|REFLETOR|RELE|CANALETA|PLAFONIER|ABRACADEIRA"],
  ["C49", "TINTA PARA USO IMOB|MASSA CORRIDA|ROLO PARA PINTURA|CABO PARA ROLO|TRINCHA|THINNER|AGUARRAS|VERNIZ|SELADOR|LIXA ABRASIVA|ESMALTE|BANDEJA / CACAMBA|TINTA AUTOMOTIVA"],
  ["C50", "FECHADURA|CADEADO|PORTAO|CREMALHEIRA|GRADE|POSTE|LACRE"],
  ["C51", "CHAVE (DE FENDA|PHILIPS|DE APERTO)|ALICATE|TRENA|PAQUIMETRO|FERRO PARA SOLDAGEM|FIO DE SOLDA|ADESIVO INSTANTANEO|FERRAMENTA|FACAO|ENXADA|CAIXA PARA GUARDA DE FERRAMENTAS|MALETA PARA FERRAMENTAS|BICO PARA AR"],
  ["C52", "BANDEIRA|ESTANDARTE|ROSETA|PEDESTAL|TALABARTE"],
  ["C53", "COLCHAO|CADEIRA/POLTRONA|MESA PLASTICA|LIXEIRA|QUADRO PARA|MOLDURA|VARAL|PORTA-OBJETOS|PORTA PAPEL|DISPENSADOR|CAIXA PLASTICA"],
  ["C54", "CINTA|CORDA|LONA PLASTICA|CARRINHO DE MAO|GUINCHO|BOMBONA"],
  ["C55", "XAMPU AUTOMOTIVO|LIMPA PNEU"],
  ["C56", "SMART CARD|CRACHA"],
  ["C57", "BRINQUEDO|LIVRO DE LITERATURA"]
];

var REGRAS_PERMANENTE = [
  ["P01", "^(PISTOLA|REVOLVER|CARABINA(?! DE PRESSAO)|FUZIL|ESPINGARDA|ESCOPETA|METRALHADORA|SUBMETRALHADORA)"],
  ["P02", "ARMA DE IMOBILIZACAO|LANCADOR DE MUNICAO NAO-LETAL"],
  ["P03", "ARMA PARA TREINAMENTO|CARABINA DE PRESSAO|AIRSOFT"],
  ["P04", "BALISTIC"],
  ["P05", "MIRA PARA ARMA|MAGNIFICADOR"],
  ["P06", "COFRE|CAIXA METALICA PARA MUNICAO"],
  ["P07", "RADIO|REPETIDORA|ANTENA(?! PARABOLICA)|TORRE PARA TELECOM|LINK DE MICRO|INTERNET VIA SATEL|EQUIPAMENTO COMUNICACAO OPERACOES|SISTEMA DIGITAL DE RADIO|FONTE DE ENERGIA PARA EQUIP.TELECO|AMPLIFICADOR DE POTENCIA"],
  ["P08", "CELULAR|TELEFON|PABX|FAX|BASTIDOR PARA TELEFONIA|PORTEIRO|IDENTIFICADOR DE CHAMADAS"],
  ["P09", "VIATURA|CAMIONETA|AUTOMOVEL|MOTOCICLETA|FURGAO|JEEP|UTILITARIO"],
  ["P10", "REBOQUE(?! PARA EMBARC)|SEMIRREBOQUE|CARRETA|ONIBUS|BICICLETA(?! ERGOM)"],
  ["P11", "BARCO|LANCHA|JET-SKI|BOTE|MOTOR DE POPA|REBOQUE PARA EMBARC|SUPORTE PARA SUSTENTACAO DE MOTOR|CARRINHO USO ESPECIFICO|SONAR|\\bREMOS?\\b|GARATEIA"],
  ["P12", "RPA|DRONE"],
  ["P13", "ETILOMETRO|FISCALIZACAO ELETRONICA|TACOGRAFO|CRONOTACOMETRO"],
  ["P14", "SONOMETRO|DECIBELIMETRO|CALIBRADOR SONORO|LUXIMETRO|TURBIDIMETRO|CLINOMETRO|INCLINOMETRO|GPS|PAQUIMETRO|LEITOR MICROCHIP|MEDIDOR DE VAZAO|MEDIDOR DE NIVEL DE AGUA|TRENA|NIVEL OPTICO|BUSSOLA|MICROMETRO"],
  ["P15", "LACO CAMBAO|PINCAO|GANCHO|PUCA|CAMBAO|SERPENTE|COBRA|JAULA|GAIOLA|(CAIXA|TRANSPORTADORA).*(ANIMA|REPTEIS)"],
  ["P16", "BOMBA COSTAL|CAPACETE PARA COMBATE|ABAFADOR|COMBATE A INCENDIO"],
  ["P17", "BINOCULO|MONOCULO|DETECTOR DE METAIS|DETECCAO DE METAIS"],
  ["P18", "ESCUTA|DISSIMULA"],
  ["P19", "CAMERA DE MONITORAMENTO|CAMERA DE SEGURANCA|CAMERA OCR|FECHADURA DIGITAL|CAMERA PTZ|CIRCUITO FECHADO|GRAVADOR PARA SISTEMA DE SEG|ALARME|CONTROLADOR PARA CAMERA|AUTOMATIZADOR|MOTOREDUTOR|CANCELA|FECHADURA ESPECIAL|AUTOMACAO E CONTR"],
  ["P20", "COMPUTADOR|NOTEBOOK|MONITOR|TABLET|IPAD|TERMINAL \\(ESTACAO"],
  ["P21", "SERVIDOR|SWITCH|ROTEADOR|RACK|PONTO DE ACESSO|NOBREAK|ESTABILIZADOR|HUB|REPETIDOR DE SINAL|CONSOLE PARA RACK|FONTE ALIMENTACAO - \\(INFORM"],
  ["P22", "IMPRESSORA|SCANNER|COPIADORA|MESA DIGITALIZADORA"],
  ["P23", "WEBCAM|LEITOR|GRAVADOR/LEITOR|DISCO RIGIDO|PENDRIVE|ARMAZENAMENTO EXTERNO|CASE PARA EQUIPAMENTO DE INFORM|CARREGADOR BATERIA - \\(PERM|COLETOR DE DADOS"],
  ["P24", "CAMERA (FOTOGRAFICA|FILMADORA|CINEMATOGRAFICA|DE CAPTURA)|FILMADORA|LENTE OBJETIVA|FLASH|TRIPE|MALETA PARA CAMERA|PACK DE BATERIA"],
  ["P25", "PROJETOR|PROJECAO|CAIXA ACUSTICA|MICROFONE|MESA (CONTROLADORA|MISTURADORA)|AMPLIFICADOR|EQUALIZADOR|SOM|AUDIO|VIDEO|TELEVIS|RECEPTOR DE TELEV|BLU-RAY|MP3|EXTENSOR|PEDESTAL|SUPORTE PARA CAIXA|FONE DE OUVIDO|ANTENA PARABOLICA|ILUMINACAO|APRESENTA|LOUSA INTERATIVA|SWITCHER"],
  ["P26", "AR CONDICIONADO|SPLIT|VENTILADOR|CLIMATIZADOR|CIRCULADOR DE AR|CORTINA DE AR|AQUECEDOR"],
  ["P27", "REFRIGERADOR|FOGAO|FOGAREIRO|FORNO|FREEZER|FRIGOBAR|BEBEDOURO|PURIFICADOR|CAFETEIRA|LIQUIDIFICADOR|SANDUICHEIRA|FRITADEIRA|PANELA|CHALEIRA|ESPREMEDOR|ESTUFA PARA MARMITA|CACAROLA|RESFRIADOR|GELADEIRA|MICRO ?ONDAS|FRIGOGAR|AIRFRYER|BEBEDEOURO|BOTIJAO"],
  ["P28", "EXTINTOR"],
  ["P29", "GERADOR|FOTOVOLTAICO|CONTROLADOR DE CARGA|CONVERSOR DE FASE|MODULO DE SOMBREAMENTO|INVERSOR|TRANSFORMADOR"],
  ["P30", "COMPRESSOR|COMPREENSOR|LAVADORA|MAQUINA DE LAVAR|FURADEIRA|ESMERIL|SERRA|LIXADEIRA|MACACO|ELEVADOR|MAQUINA DE SOLDA|POLITRIZ|MARTELO ROMPEDOR|PROPULSOR|RETIFICADOR|TORNO|CONJUNTO DE FERRAMENTAS|JOGO DE CHAVES|MULTIMETRO|TESTADOR|BOMBA (HIDRAULICA|SUBMERSA)|MOTOBOMBA|MOTOR ELETRICO|AUXILIAR PORTATIL DE PARTIDA|CALIBRADOR DE PRESSAO|ENCERADEIRA|ASPIRADOR|SELADORA|CARREGADOR DE PILHAS|FONTE DE ALIMENTACAO|MALETA PARA FERRAMENTAS|CAIXA PARA GUARDA DE FERRAMENTAS|ARMARIO PARA GUARDA DE FERRAMENTAS|ESCADA|FILTRO INDUSTRIAL|LANTERNA LUZ DE CENA"],
  ["P31", "ROCADEIRA|APARADOR DE GRAMA|CORTADOR DE GRAMA|MOTOSSERRA|SOPRADOR"],
  ["P32", "HOSPITALAR|DESFIBRILADOR|ELETROCARDIO|ESFIGMO|ESTETOSCOPIO|MACA$|OTOSCOPIO|OXIMETRO|LARINGOSCOPIO|NEGATOSCOPIO|AUTOCLAVE|OXIGENIO|CADEIRA DE RODAS|BIOIMPEDANCIA|APH|MARTELO NEUROLOGICO|EXAMES CLINICOS|INSTRUMENTAL CIRURGICO|PORTA-AGULHA|REFLETOR DE FOCO|DESTILADOR|LUPA|TERMOMETRO|USO MEDI|MALETA PORTATIL DE EMERG|LAVADORA ULTRASSONICA|MICRO-JATEADOR|SORO"],
  ["P33", "ODONT|CURETA|ESPATULA|PINCA|FORCEPS|SONDA|SINDESMOTOMO|EXTRATOR DE TARTARO|CONDENSADOR|ESCAVADOR|ESCULPIDOR|BRUNIDOR|CALCADOR|ALAVANCA|ALVEOLOTOMO|PORTA MATRIZ|PORTA-AMALGAMA|TESOURA|ESPECULO|AFASTADOR|APLICADOR PARA HIDROXIDO|CABO (BISTURI|INOX|PARA ESPELHO)|MICROMOTOR|MICRO-MOTOR|CONTRA-ANGULO|PECA DE MAO|MANEQUIM ODONT|COMPASSO DE DOBRAS|BANDEJA PARA INSTRUMENTAL|SERINGA PARA ANESTESIA|FOTOPOLIMERIZADOR|CLAREADOR|LASER|CUBA|INCUBADORA|ESTOJO PARA ESTERILIZACAO|REGUA USO"],
  ["P34", "GINASTICA|ACADEMIA|SUPINO|LEG PRESS|ABDOMINAL|ERGOMETRICA|MUSCULACA|ESPALDAR|PULLEY|PEITORAL|EXTENSOR|ANILHA|HALTER|BARRA GUIADA|PANTURRILHA|MULTIESTACAO"],
  ["P35", "BARRACA|TENDA"],
  ["P36", "CARRINHO|CARRO (ARMAZEM|PLATAFORMA)|ESTRADO|BALANCA|GUINCHO|COLETOR/CONTENTOR"],
  ["P37", "FRAGMENTADORA|TRITURADOR|GUILHOTINA|ENCADERN|ROTULADOR|ETIQUETADORA|MAQUINA (DE CALCULAR|PROTOCOLADORA|DE LUSTRAR)|BIOMETRICO|DEPURADOR|EXAUSTOR|PERFURADORA|FERRO PARA PASSAR|TABUA PARA PASSAR|TANQUINHO"],
  ["P38", "ARMARIO|MESA|CADEIRA|GUARDA ROUPA|TAMBORETE|COLCHAO|CORTINA|ARQUIVO|ESTANTE|CAMA|ROUPEIRO|GAVETEIRO|POLTRONA|SOFA|LONGARINA|BANCO|BANQUETA|PERSIANA|ESCANINHO|CLAVICULARIO|SUPORTE|PRATELEIRA|ESTACAO DE TRABALHO|CARTEIRA|BALCAO|BANCADA|QUADRO|LOUSA|CABIDEIRO|GUARDA-ROUPA|CRIADO|BAU|MAPOTECA|MOVEIS|TABLADO|PULPITO|ESCRIVANINHA|APARADOR|SAPATEIRA|FICHARIO|PAINEL|NICHO|CONEXAO PARA ESTACAO"],
  ["P39", "RELOGIO|CRUCIFIXO|ORATORIO|DICIONARIO|MANEQUIM"]
];

function normalizar_(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function semCodigo_(d) { return String(d || '').trim().replace(/^\d{6,9}\s*-\s*/, ''); }

var regrasCompiladas_ = {};
function regras_(tipo) {
  if (!regrasCompiladas_[tipo]) {
    regrasCompiladas_[tipo] = (tipo === 'PERMANENTE' ? REGRAS_PERMANENTE : REGRAS_CONSUMO)
      .map(function (r) { return [r[0], new RegExp(r[1])]; });
  }
  return regrasCompiladas_[tipo];
}

/** Devolve o ID da família (C99/P99 quando nenhuma regra casa). */
function classificar(tipo, descricao, grupo) {
  var d = semCodigo_(descricao), regras = regras_(tipo);
  var textos = [normalizar_(d.split(/ - |\u203a|:/)[0]), normalizar_(d), normalizar_(grupo)];
  var fam = null;
  for (var t = 0; t < textos.length && !fam; t++) {
    if (!textos[t]) continue;
    for (var i = 0; i < regras.length; i++) if (regras[i][1].test(textos[t])) { fam = regras[i][0]; break; }
  }
  if (tipo === 'PERMANENTE') return fam || 'P99';
  var tudo = normalizar_(descricao + ' ' + grupo);
  if (fam === 'C01' && /TREINAMENTO|FESTIM|MANEJO|INSTRUCAO/.test(tudo)) fam = 'C58';
  // Arma cadastrada como material de consumo, fora do grupo de carregadores: revisar.
  if (/^(FUZIL|METRALHADORA|SUBMETRALHADORA|PISTOLA GLOCK)/.test(normalizar_(d)) && !/CARREGADOR/.test(normalizar_(grupo))) fam = null;
  return fam || 'C99';
}

if (typeof module !== 'undefined') module.exports = { classificar: classificar };


/* ===================== Importacao.gs ===================== */

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

/** Guarda nome e posto do usuário (para o cabeçalho e a marca-d'água do painel). */
function guardarPerfil_() {
  try {
    var u = PropertiesService.getScriptProperties().getProperty('CPELOG_USUARIO');
    var p = lerTabela_('profiles', 'select=nome,posto_graduacao&numero_policia=eq.' + encodeURIComponent(u));
    if (p.length) PropertiesService.getScriptProperties().setProperty('CPELOG_NOME', [p[0].posto_graduacao, p[0].nome].filter(Boolean).join(' '));
  } catch (e) { /* opcional */ }
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
  var dados = lerCatalogoCpelog_(), agora = new Date();
  guardarPerfil_();

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
  PropertiesService.getScriptProperties().setProperty('ULTIMO_IMPORT', agora.toISOString());
  aviso_(saida.length + ' materiais (' + novos + ' novos). Recalcule para ver os resultados.', 'Importado do CPELOG');
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


/* ===================== Codigo.gs ===================== */

/**
 * Template de diagnóstico de criticidade e estoque mínimo (Google Planilhas + Apps Script).
 * Menu "Estoque mínimo" na planilha; painel web publicado por doGet().
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Estoque mínimo')
    .addItem('1. Configurar planilha (cria as abas)', 'configurar')
    .addItem('2. Configurar acesso ao CPELOG', 'configurarAcesso')
    .addItem('3. Importar do CPELOG', 'importarCpelog')
    .addItem('4. Recalcular', 'recalcular')
    .addSeparator()
    .addItem('Abrir painel', 'abrirPainel')
    .addToUi();
}

/**
 * Planilha onde ficam os dados. Se o projeto não estiver ligado a uma planilha
 * (Apps Script avulso, publicado como app da web), cria uma no Drive na primeira vez.
 */
function planilha_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('PLANILHA_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.getActive();
  if (!ss) ss = SpreadsheetApp.create('Estoque mínimo - CPELOG (dados do painel)');
  if (ss.getId() !== id) props.setProperty('PLANILHA_ID', ss.getId());
  if (!ss.getSheetByName('RESULTADOS')) configurarAbas_(ss);
  return ss;
}

/** Mensagem rápida na planilha, quando houver uma aberta (no app da web não há). */
function aviso_(msg, titulo) {
  try { var a = SpreadsheetApp.getActive(); if (a) a.toast(msg, titulo || 'Estoque mínimo', 6); } catch (e) { /* sem interface */ }
}

function configurar() { configurarAbas_(planilha_()); aviso_('Abas criadas. Configure o acesso e importe do CPELOG.'); }

/** Cria as abas que faltarem, com cabeçalho, parâmetros, famílias e exemplos. Não apaga nada. */
function configurarAbas_(ss) {
  var seeds = { PARAMETROS: PARAMETROS_PADRAO, FAMILIAS: FAMILIAS_PADRAO, UNIDADES: UNIDADES_EXEMPLO, ITENS: ITENS_EXEMPLO, PROCESSOS: PROCESSOS_EXEMPLO };
  Object.keys(ABAS).forEach(function (nome) {
    if (ss.getSheetByName(nome)) return;
    var sh = ss.insertSheet(nome), cab = ABAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
    sh.setFrozenRows(1);
    var dados = seeds[nome];
    if (dados && dados.length) {
      var w = Math.max.apply(null, dados.map(function (r) { return r.length; }));
      var linhas = dados.map(function (r) { var x = r.slice(); while (x.length < w) x.push(''); return x; });
      sh.getRange(2, 1, linhas.length, w).setValues(linhas);
    }
    if (nome === 'ITENS' || nome === 'UNIDADES' || nome === 'FAMILIAS' || nome === 'PARAMETROS') {
      var entrada = nome === 'FAMILIAS' ? [5, 14] : nome === 'PARAMETROS' ? [2, 2] : [1, cab.length];
      sh.getRange(2, entrada[0], Math.max(sh.getMaxRows() - 1, 1), entrada[1] - entrada[0] + 1).setBackground('#fff2cc');
    }
  });
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  preencherPadroes_(ss);
}

function linhas_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; });
}

function num_(v) { var n = Number(v); return v === '' || v === null || isNaN(n) ? null : n; }
function sim_(v) { return String(v).trim().toUpperCase().charAt(0) === 'S'; }
function dias_(a, b) { return a instanceof Date && b instanceof Date ? Math.round((b - a) / 86400000) : null; }

/** Lê tudo, calcula e grava RESULTADOS, as notas das famílias e os prazos dos processos. */
function recalcular() {
  var ss = planilha_();
  var p = lerParametros_(linhas_(ss, 'PARAMETROS'));

  var familias = {};
  linhas_(ss, 'FAMILIAS').forEach(function (r) {
    familias[String(r[0]).trim()] = { id: r[0], nome: r[1], tipo: String(r[2]).trim().toUpperCase(), ESS: r[4], SEG: r[5], SUB: r[6], CTL: r[7], VAR: r[8], TR: r[9], TRV: r[10], leadTimeDias: num_(r[11]), base: String(r[12]).trim().toUpperCase(), taxaIndisponibilidade: num_(r[13]) };
  });

  var ef = { policiais: 0, viaturas: 0, unidades: 0 };
  linhas_(ss, 'UNIDADES').forEach(function (r) {
    if (r[5] !== '' && !sim_(r[5])) return;
    ef.policiais += num_(r[2]) || 0; ef.viaturas += num_(r[3]) || 0; ef.unidades += num_(r[4]) || 0;
  });

  // Processos: calcula a duração de cada fase e o total (demanda -> entrega).
  var shProc = ss.getSheetByName('PROCESSOS'), procs = [];
  var lp = linhas_(ss, 'PROCESSOS');
  if (lp.length) {
    var fases = lp.map(function (r) {
      var d = [r[3], r[4], r[5], r[6], r[7]].map(function (x) { return x instanceof Date ? x : (x ? new Date(x) : null); });
      var tot = dias_(d[0], d[4]);
      procs.push({ item: String(r[1]).trim(), familia: String(r[2]).trim(), dias: tot });
      return [dias_(d[0], d[1]), dias_(d[1], d[2]), dias_(d[2], d[3]), dias_(d[3], d[4]), tot].map(function (x) { return x === null ? '' : x; });
    });
    shProc.getRange(2, 9, fases.length, 5).setValues(fases);
  }
  var estat = estatisticaProcessos(procs);

  preencherPadroes_(ss);
  var shI = ss.getSheetByName('ITENS');
  var li = shI.getLastRow() > 1 ? shI.getRange(2, 1, shI.getLastRow() - 1, ABAS.ITENS.length).getValues() : [];
  var cores = li.length ? shI.getRange(2, 1, li.length, ABAS.ITENS.length).getFontColors() : [];
  var hoje = new Date(), saida = [];
  li.forEach(function (r, idx) {
    if (String(r[COL.CODIGO]).trim() === '') return;
    var fam = familias[String(r[COL.FAMILIA]).trim()];
    if (!fam) { saida.push([r[0], r[1], r[COL.FAMILIA], '', '', '', '', '', '', '', '', '', '', '', '', 'FAMÍLIA INEXISTENTE', '', '', 'Corrigir a família na aba ITENS']); return; }
    var real = function (c) { return r[c] !== '' && !ehPadrao_(cores[idx][c]); };
    var item = {
      codigo: String(r[COL.CODIGO]).trim(), descricao: r[COL.DESCRICAO], familia: fam.id,
      base: String(r[COL.BASE]).trim().toUpperCase() || fam.base || 'HISTORICO',
      taxa: num_(r[COL.TAXA]), consumoHistorico: num_(r[COL.HIST]), desvioHistorico: num_(r[COL.DESVIO]),
      saldo: num_(r[COL.SALDO]) || 0, emTransito: num_(r[COL.TRANSITO]) || 0,
      ataVigente: sim_(r[COL.ATA]), prazoAta: num_(r[COL.PRAZO_ATA]),
      fases: { interna: num_(r[COL.FASE_INTERNA]), licitacao: num_(r[COL.LICITACAO]), contratacao: num_(r[COL.CONTRATACAO]), entrega: num_(r[COL.ENTREGA]), distribuicao: num_(r[COL.DISTRIBUICAO]) },
      fasesReais: { interna: real(COL.FASE_INTERNA), licitacao: real(COL.LICITACAO), contratacao: real(COL.CONTRATACAO), entrega: real(COL.ENTREGA) },
      parque: num_(r[COL.PARQUE]) || 0, taxaIndisponibilidade: num_(r[COL.INDISP]) !== null ? num_(r[COL.INDISP]) : (fam.taxaIndisponibilidade || 0)
    };
    var x = calcularItem(item, fam, ef, estat, p, hoje);
    saida.push([x.codigo, x.descricao, x.familia, x.tipo, x.classe, Math.round(x.nota), arred_(x.demanda, 1), x.fonteDemanda || '',
      Math.round(x.leadTime), x.origemLeadTime, x.seguranca === undefined ? '' : x.seguranca, x.minimo === undefined ? '' : x.minimo,
      x.maximo === null || x.maximo === undefined ? '' : x.maximo, x.posicao === undefined ? item.saldo : x.posicao,
      x.cobertura === null || x.cobertura === undefined ? '' : arred_(x.cobertura, 1), x.status, x.dataLimite || (x.status === 'INICIAR COMPRA' ? 'IMEDIATO' : ''),
      x.sugerido || 0, x.justificativa]);
  });

  var sh = ss.getSheetByName('RESULTADOS');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent().setBackground(null);
  if (saida.length) {
    sh.getRange(2, 1, saida.length, saida[0].length).setValues(saida);
    sh.getRange(2, 17, saida.length, 1).setNumberFormat('dd/mm/yyyy');
    var cores = saida.map(function (l) { var s = l[15]; var c = s === 'INICIAR COMPRA' || s === 'RESERVA INSUFICIENTE' ? '#f4b6b6' : s === 'EXCESSO' ? '#fce4b6' : s === 'Dentro da faixa' ? '#d9ead3' : null; return [c]; });
    sh.getRange(2, 16, saida.length, 1).setBackgrounds(cores);
  }

  // Nota e classe de cada família com as notas padrão (referência para o especialista).
  var shF = ss.getSheetByName('FAMILIAS'), lf = linhas_(ss, 'FAMILIAS');
  if (lf.length) {
    shF.getRange(2, 15, lf.length, 2).setValues(lf.map(function (r) {
      var c = criticidade({ ESS: r[4], SEG: r[5], SUB: r[6], CTL: r[7], VAR: r[8], TR: r[9], TRV: r[10] }, p.pesos, p);
      return [Math.round(c.nota), c.classe];
    }));
  }
  PropertiesService.getScriptProperties().setProperty('ULTIMO_CALCULO', new Date().toISOString());
  aviso_(saida.length + ' itens calculados.');
}

function ehPadrao_(cor) { return String(cor || '').toLowerCase() === COR_PADRAO; }

/**
 * Preenche, em cinza, as células vazias das colunas com padrão do sistema (base de consumo,
 * taxa de indisponibilidade e fases do processo de compra). Valores digitados pelo usuário
 * ficam em preto e nunca são sobrescritos; os cinzas acompanham mudanças na aba FAMILIAS.
 */
function preencherPadroes_(ss) {
  var sh = ss.getSheetByName('ITENS'), fs = ss.getSheetByName('FAMILIAS');
  if (!sh || !fs || sh.getLastRow() < 2) return;
  var fam = {};
  linhas_(ss, 'FAMILIAS').forEach(function (r) { fam[String(r[0]).trim()] = { tipo: String(r[2]).toUpperCase(), lt: num_(r[11]), base: r[12], indisp: r[13] }; });
  var n = sh.getLastRow() - 1, nc = ABAS.ITENS.length;
  var rg = sh.getRange(2, 1, n, nc), v = rg.getValues(), c = rg.getFontColors();
  var mudou = false;
  v.forEach(function (r, i) {
    var f = fam[String(r[COL.FAMILIA]).trim()]; if (!f) return;
    var fp = fasesPadrao(f.lt, DIVISAO_FASES, DISTRIBUICAO_PADRAO_DIAS);
    var padrao = {};
    padrao[COL.BASE] = f.tipo === 'CONSUMO' ? f.base : '';
    padrao[COL.INDISP] = f.tipo === 'PERMANENTE' ? f.indisp : '';
    padrao[COL.FASE_INTERNA] = fp.interna; padrao[COL.LICITACAO] = fp.licitacao; padrao[COL.CONTRATACAO] = fp.contratacao;
    padrao[COL.ENTREGA] = fp.entrega; padrao[COL.DISTRIBUICAO] = fp.distribuicao;
    COLUNAS_PADRAO.forEach(function (col) {
      if (r[col] === '' || ehPadrao_(c[i][col])) {
        if (r[col] !== padrao[col] || (padrao[col] !== '' && !ehPadrao_(c[i][col]))) { r[col] = padrao[col]; mudou = true; }
        c[i][col] = padrao[col] === '' ? null : COR_PADRAO;
      }
    });
  });
  if (mudou) rg.setValues(v);
  rg.setFontColors(c);
}

/** Ao digitar sobre um valor padrão (cinza), o valor passa a ser real (preto). */
function onEdit(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== 'ITENS' || e.range.getRow() < 2) return;
  var c0 = e.range.getColumn() - 1, nc = e.range.getNumColumns();
  for (var j = 0; j < nc; j++) {
    if (COLUNAS_PADRAO.indexOf(c0 + j) < 0) continue;
    var col = sh.getRange(e.range.getRow(), c0 + j + 1, e.range.getNumRows(), 1);
    col.setFontColor('#000000').setFontStyle('normal');
  }
}

function arred_(v, c) { if (v === null || v === undefined || v === '') return ''; var f = Math.pow(10, c); return Math.round(v * f) / f; }

/** HTML do painel: embutido (versão de arquivo único) ou do arquivo Painel.html. */
function painelHtml_() {
  return typeof PAINEL_HTML !== 'undefined' ? HtmlService.createHtmlOutput(PAINEL_HTML) : HtmlService.createHtmlOutputFromFile('Painel');
}

/** Painel web. */
function doGet() {
  return painelHtml_()
    .setTitle('Estoque mínimo - diagnóstico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function abrirPainel() {
  var html = painelHtml_().setWidth(1400).setHeight(850);
  SpreadsheetApp.getUi().showModalDialog(html, 'Diagnóstico de estoque');
}

/* ---------- Funções chamadas pelo painel (google.script.run) ---------- */

function estadoWeb() {
  var props = PropertiesService.getScriptProperties();
  var ss = planilha_();
  var sh = ss.getSheetByName('ITENS');
  return {
    acesso: !!(props.getProperty('CPELOG_USUARIO') && props.getProperty('CPELOG_SENHA')),
    usuario: props.getProperty('CPELOG_USUARIO') || '',
    nome: props.getProperty('CPELOG_NOME') || '',
    planilha: ss.getUrl(),
    ultimoImport: props.getProperty('ULTIMO_IMPORT'),
    ultimoCalculo: props.getProperty('ULTIMO_CALCULO'),
    itens: sh ? Math.max(sh.getLastRow() - 1, 0) : 0
  };
}

/** Grava e valida o login do CPELOG digitado no painel. */
function salvarAcesso(usuario, senha) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CPELOG_USUARIO', String(usuario || '').replace(/\D/g, ''));
  props.setProperty('CPELOG_SENHA', String(senha || ''));
  try { tokenCpelog_(true); } catch (e) { props.deleteProperty('CPELOG_SENHA'); throw e; }
  guardarPerfil_();
  return estadoWeb();
}

/** Puxa tudo do CPELOG, recalcula e devolve os dados do painel. */
function atualizarDoCpelog() {
  importarCpelog();
  recalcular();
  return dadosWeb();
}

/**
 * Grava edições feitas no painel e recalcula.
 * alteracoes: [{aba, linha (da planilha), coluna (1 = A), valor}]
 */
function salvarAlteracoes(alteracoes) {
  var ss = planilha_(), editaveis = { ITENS: 1, FAMILIAS: 1, PARAMETROS: 1, UNIDADES: 1, PROCESSOS: 1 };
  (alteracoes || []).forEach(function (a) {
    if (!editaveis[a.aba] || !(a.linha >= 2) || !(a.coluna >= 1)) return;
    var sh = ss.getSheetByName(a.aba), v = String(a.valor === null || a.valor === undefined ? '' : a.valor).trim();
    var cel = sh.getRange(a.linha, a.coluna);
    cel.setValue(/^-?\d+([.,]\d+)?$/.test(v) ? Number(v.replace(',', '.')) : v);
    if (a.aba === 'ITENS' && COLUNAS_PADRAO.indexOf(a.coluna - 1) >= 0) cel.setFontColor('#000000').setFontStyle('normal');
  });
  recalcular();
  return dadosWeb();
}

function serial_(v, tz) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v; }

function tabelaWeb_(ss, nome, comCores) {
  var sh = ss.getSheetByName(nome), cab = ABAS[nome], tz = ss.getSpreadsheetTimeZone();
  var n = sh && sh.getLastRow() > 1 ? sh.getLastRow() - 1 : 0;
  if (!n) return { cab: cab, linhas: [] };
  var rg = sh.getRange(2, 1, n, cab.length), v = rg.getValues(), c = comCores ? rg.getFontColors() : null;
  var linhas = [];
  v.forEach(function (r, i) {
    if (String(r[0]).trim() === '') return;
    var o = { l: i + 2, v: r.map(function (x) { return serial_(x, tz); }) };
    if (c) o.p = COLUNAS_PADRAO.filter(function (k) { return ehPadrao_(c[i][k]); });
    linhas.push(o);
  });
  return { cab: cab, linhas: linhas };
}

/** Todas as informações do painel: resultados, itens (com o que é padrão), famílias, parâmetros, unidades, processos. */
function dadosWeb() {
  var ss = planilha_();
  return {
    estado: estadoWeb(),
    resultados: tabelaWeb_(ss, 'RESULTADOS'),
    itens: tabelaWeb_(ss, 'ITENS', true),
    familias: tabelaWeb_(ss, 'FAMILIAS'),
    parametros: tabelaWeb_(ss, 'PARAMETROS'),
    unidades: tabelaWeb_(ss, 'UNIDADES'),
    processos: tabelaWeb_(ss, 'PROCESSOS'),
    colunasPadrao: COLUNAS_PADRAO,
    col: COL
  };
}


/* ===================== Painel.html ===================== */

var PAINEL_HTML = "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n<base target=\"_top\">\n<meta charset=\"utf-8\">\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n<script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js\"></script>\n<style>\n  :root { --preto:#0f0f10; --preto2:#1b1b1d; --dourado:#A08F63; --dourado2:#D9C68F; --ouro-txt:#9a7d2e; --bg:#EFEBE0; --card:#fff; --soft:#F6F3EA; --tx:#2b2a28; --mut:#6d6a63; --fraco:#9b978d; --bd:#E2DCCB;\n          --red:#a3201b; --redbg:#f8e1df; --amb:#9a6200; --ambbg:#f8ecd3; --grn:#2f6b3c; --grnbg:#e1efe2; --cin:#5b5f66; --cinbg:#ecebe6; --edit:#fffdf3; --pad:#a09f9a;\n          --sombra:0 1px 2px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.05); }\n  * { box-sizing:border-box; }\n  body { margin:0; background:var(--bg); color:var(--tx); font:14px/1.45 Inter, Arial, sans-serif; }\n  .layout { display:flex; min-height:100vh; }\n  aside { width:250px; flex-shrink:0; background:var(--preto); color:#fff; position:sticky; top:0; height:100vh; overflow:auto; padding:10px 8px; }\n  .grupo-nav { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:var(--dourado2); padding:14px 12px 6px; font-weight:700; }\n  .item-nav { display:flex; align-items:center; gap:12px; padding:11px 12px; margin:2px 0; cursor:pointer; color:#eee; border-radius:8px; font-size:15px; }\n  .item-nav:hover { background:rgba(255,255,255,.07); }\n  .item-nav.on { background:var(--dourado2); color:var(--preto); font-weight:700; }\n  .item-nav .ic { width:24px; text-align:center; font-size:18px; }\n  .item-nav .cont { margin-left:auto; font-size:11px; background:rgba(255,255,255,.14); padding:1px 8px; border-radius:9px; font-weight:600; }\n  .item-nav.on .cont { background:rgba(0,0,0,.12); }\n  .item-nav .cont.r { background:#a3201b; color:#fff; } .item-nav .cont.a { background:#9a6200; color:#fff; }\n  .conteudo { flex:1; min-width:0; display:flex; flex-direction:column; }\n  .topo { background:var(--preto); color:#fff; padding:18px 28px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }\n  .topo .id { display:flex; align-items:center; gap:18px; }\n  .topo img { width:72px; height:72px; object-fit:contain; }\n  .topo .sup { font-size:12px; color:var(--dourado2); font-weight:700; letter-spacing:.6px; text-transform:uppercase; }\n  .topo h1 { font-size:28px; margin:2px 0 0; font-weight:700; }\n  .topo .dir { display:flex; flex-direction:column; align-items:flex-end; gap:8px; }\n  .usuario { border:1px solid var(--dourado); border-radius:8px; padding:8px 16px; font-size:15px; color:var(--dourado2); text-transform:uppercase; }\n  .bt-ouro { background:transparent; border:1px solid var(--dourado); color:var(--dourado2); border-radius:8px; padding:6px 14px; font:inherit; font-weight:600; cursor:pointer; }\n  .bt-ouro:hover { background:rgba(160,143,99,.18); }\n  .sinc { font-size:12px; color:#bdb8aa; }\n  .faixa { background:var(--dourado); color:#fff; text-align:center; font-weight:600; padding:8px 12px; }\n  main { padding:18px 28px 90px; }\n  .filtrobar { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:12px 18px; display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end; box-shadow:var(--sombra); margin-bottom:18px; }\n  .fg { display:flex; flex-direction:column; gap:4px; } .fg label { font-size:12px; font-weight:700; color:var(--mut); text-transform:uppercase; letter-spacing:.5px; }\n  select, input { padding:8px 10px; border:1px solid var(--bd); border-radius:6px; background:#fff; color:var(--tx); font:inherit; }\n  .bt { padding:8px 14px; border:1px solid var(--bd); background:#fff; color:var(--tx); border-radius:6px; cursor:pointer; font:inherit; font-weight:600; }\n  .bt.pri { background:var(--dourado); border-color:var(--dourado); color:#fff; }\n  .bt:disabled, .bt-ouro:disabled { opacity:.5; cursor:wait; }\n  .ativos { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-left:auto; font-size:12px; color:var(--mut); }\n  .tagf { background:var(--soft); border:1px solid var(--bd); border-radius:12px; padding:3px 10px; cursor:pointer; color:var(--tx); }\n  .tagf:hover { border-color:var(--red); }\n  .titulo { display:flex; align-items:baseline; gap:12px; margin:6px 0 4px; flex-wrap:wrap; }\n  .titulo h2 { font-size:19px; font-weight:800; letter-spacing:.3px; text-transform:uppercase; margin:0; }\n  .titulo span { color:var(--ouro-txt); font-size:14px; }\n  .dica { color:var(--mut); margin:0 0 14px; }\n  .secao { margin-bottom:22px; } .secao > h3 { font-size:13px; text-transform:uppercase; letter-spacing:.6px; color:var(--mut); margin:0 0 10px; }\n  .cards { display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(178px,1fr)); }\n  .card { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:16px 18px; box-shadow:var(--sombra); position:relative; }\n  .card.clic { cursor:pointer; } .card.clic:hover { border-color:var(--dourado); box-shadow:0 6px 18px rgba(0,0,0,.08); }\n  .card .seta { position:absolute; top:14px; right:16px; color:var(--fraco); font-size:16px; }\n  .card .rot { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.3px; padding-right:16px; }\n  .card .val { font-size:32px; font-weight:800; margin:8px 0 4px; font-variant-numeric:tabular-nums; }\n  .card .det { font-size:13px; color:var(--ouro-txt); }\n  .card.r .val { color:var(--red); } .card.a .val { color:var(--amb); } .card.g .val { color:var(--grn); }\n  .card.zero { opacity:.6; }\n  .prog { height:6px; background:var(--soft); border-radius:3px; margin:8px 0 0; overflow:hidden; } .prog i { display:block; height:100%; background:var(--dourado); }\n  .graficos { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); }\n  .grafico { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:14px 16px; box-shadow:var(--sombra); }\n  .grafico .rot { font-size:13px; font-weight:800; text-transform:uppercase; } .grafico .det { font-size:12px; color:var(--mut); margin-bottom:8px; }\n  .grafico .tela { position:relative; height:260px; }\n  .chip { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; white-space:nowrap; }\n  .c-Operacional, .s-r { background:var(--redbg); color:var(--red); } .c-Funcional, .s-a { background:var(--ambbg); color:var(--amb); } .c-Administrativo, .s-g { background:var(--grnbg); color:var(--grn); } .s-c { background:var(--cinbg); color:var(--cin); }\n  .wrap { overflow:auto; max-height:70vh; border:1px solid var(--bd); border-radius:10px; background:var(--card); box-shadow:var(--sombra); }\n  table { border-collapse:collapse; width:100%; }\n  th, td { padding:9px 10px; border-bottom:1px solid var(--bd); text-align:left; vertical-align:middle; }\n  th { position:sticky; top:0; z-index:2; background:var(--soft); font-size:11px; font-weight:800; color:var(--mut); text-transform:uppercase; letter-spacing:.4px; }\n  thead tr.grupo th { text-align:center; color:var(--ouro-txt); border-bottom:none; }\n  thead tr.grupo + tr th { top:31px; }\n  tr.clic { cursor:pointer; } tr.clic:hover td { background:var(--soft); }\n  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }\n  .nome { font-weight:700; } .sub { color:var(--mut); font-size:12px; }\n  .num-r { color:var(--red); font-weight:800; } .num-a { color:var(--amb); font-weight:800; }\n  details summary { cursor:pointer; color:var(--ouro-txt); font-size:12px; font-weight:700; }\n  details p { margin:6px 0 0; font-size:12px; color:var(--mut); max-width:480px; }\n  td input, td select { width:100%; min-width:70px; padding:5px 6px; font-size:13px; background:var(--edit); }\n  td select { min-width:112px; }\n  td input.padrao, td select.padrao { color:var(--pad); font-style:italic; background:transparent; }\n  td input.mudou, td select.mudou { outline:2px solid var(--amb); }\n  .fixa { position:sticky; left:0; z-index:1; background:var(--card); min-width:230px; max-width:290px; } th.fixa { z-index:3; background:var(--soft); }\n  .pag { display:flex; gap:8px; align-items:center; margin-top:8px; color:var(--mut); font-size:12px; }\n  .fundo { position:fixed; inset:0; background:rgba(10,10,12,.55); z-index:40; display:none; align-items:flex-start; justify-content:center; padding:4vh 2vw; }\n  .fundo.on { display:flex; }\n  .janela { background:var(--bg); width:min(1300px,96vw); max-height:92vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; border-top:5px solid var(--dourado); }\n  .janela header { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 20px; background:var(--card); border-bottom:1px solid var(--bd); }\n  .janela h2 { margin:0; font-size:18px; }\n  .janela .corpo { padding:14px 20px; overflow:auto; }\n  .janela .wrap { max-height:62vh; }\n  .ajuda h3 { margin:18px 0 6px; font-size:15px; color:var(--ouro-txt); text-transform:uppercase; letter-spacing:.4px; }\n  .ajuda p, .ajuda li { color:var(--tx); max-width:900px; } .ajuda li { margin:4px 0; }\n  .ajuda dl { display:grid; grid-template-columns:220px 1fr; gap:6px 16px; max-width:950px; } .ajuda dt { font-weight:700; } .ajuda dd { margin:0; }\n  .barra { position:fixed; left:250px; right:0; bottom:0; background:var(--card); border-top:3px solid var(--dourado); padding:10px 24px; display:none; gap:12px; align-items:center; z-index:30; }\n  .barra.on { display:flex; }\n  .login { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:22px; max-width:460px; box-shadow:var(--sombra); }\n  .login input { width:100%; margin:4px 0 12px; }\n  .aviso { background:var(--ambbg); color:var(--amb); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-weight:600; }\n  .erro { background:var(--redbg); color:var(--red); border-radius:8px; padding:10px 12px; margin-bottom:14px; }\n  .marca { position:fixed; inset:0; pointer-events:none; z-index:35; background-repeat:repeat; opacity:.9; }\n  .oculto { display:none !important; }\n  @media (max-width:900px) { .layout { flex-direction:column; } aside { width:auto; height:auto; position:static; } .barra { left:0; } main, .topo { padding:14px; } .graficos { grid-template-columns:1fr; } .ajuda dl { grid-template-columns:1fr; } }\n</style>\n</head>\n<body>\n<div class=\"marca\" id=\"marca\"></div>\n<div class=\"layout\">\n  <aside id=\"nav\"></aside>\n  <div class=\"conteudo\">\n    <div class=\"topo\">\n      <div class=\"id\"><img src=\"data:image/jpeg;base64,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\" alt=\"PMMG\"><div><div class=\"sup\">Estado-Maior do CPE | Estoque e compras</div><h1>Estoque Mínimo CPE</h1></div></div>\n      <div class=\"dir\">\n        <div class=\"usuario\" id=\"usuario\">—</div>\n        <div style=\"display:flex;gap:8px\"><button class=\"bt-ouro\" id=\"btAjuda\">? Como usar o painel</button><button class=\"bt-ouro oculto\" id=\"btAtualizar\">⟳ Atualizar do CPELOG</button></div>\n        <div class=\"sinc\" id=\"sinc\"></div>\n      </div>\n    </div>\n    <div class=\"faixa\" id=\"faixa\">Carregando…</div>\n    <main>\n      <div id=\"msg\"></div>\n      <div id=\"login\" class=\"login oculto\">\n        <h2 style=\"margin-top:0\">Acesso ao CPELOG</h2>\n        <p class=\"sub\">O painel lê os dados do inventário (inventario.cpelog.com.br) com o seu login. Somente leitura: nada é alterado no CPELOG. A senha fica guardada nas propriedades deste script.</p>\n        <label>Número de polícia<input id=\"lgUsuario\" autocomplete=\"username\"></label>\n        <label>Senha<input id=\"lgSenha\" type=\"password\" autocomplete=\"current-password\"></label>\n        <button class=\"bt pri\" id=\"btLogin\">Entrar e importar</button>\n      </div>\n      <div id=\"corpoApp\" class=\"oculto\">\n        <div class=\"filtrobar\" id=\"filtrobar\">\n          <div class=\"fg\"><label>Classe</label><select id=\"fClasse\"><option value=\"\">Todas</option><option>Operacional</option><option>Funcional</option><option>Administrativo</option></select></div>\n          <div class=\"fg\"><label>Tipo</label><select id=\"fTipo\"><option value=\"\">Todos</option><option value=\"CONSUMO\">Consumo</option><option value=\"PERMANENTE\">Permanentes</option></select></div>\n          <div class=\"fg\"><label>Família</label><select id=\"fFam\" style=\"max-width:300px\"><option value=\"\">Todas</option></select></div>\n          <div class=\"fg\"><label>Situação</label><select id=\"fSit\"><option value=\"\">Todas</option></select></div>\n          <button class=\"bt\" id=\"btLimpar\">Limpar filtros</button>\n          <div class=\"ativos\" id=\"ativos\"></div>\n        </div>\n        <div id=\"pagina\"></div>\n      </div>\n    </main>\n  </div>\n</div>\n\n<div class=\"fundo\" id=\"fundo\"><div class=\"janela\">\n  <header><div><h2 id=\"jTitulo\"></h2><div class=\"sub\" id=\"jSub\"></div></div><button class=\"bt\" id=\"jFechar\">Fechar ✕</button></header>\n  <div class=\"corpo\">\n    <div style=\"display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap\"><input id=\"jBusca\" placeholder=\"Buscar material ou código…\" style=\"min-width:280px\"><span class=\"sub\">Clique em \"ver\" para entender o cálculo de cada material.</span></div>\n    <div class=\"wrap\"><table id=\"jTabela\"></table></div><div class=\"pag\" id=\"jPag\"></div>\n  </div>\n</div></div>\n\n<div class=\"fundo\" id=\"fundoAjuda\"><div class=\"janela\">\n  <header><h2>Como usar o painel</h2><button class=\"bt\" id=\"ajFechar\">Fechar ✕</button></header>\n  <div class=\"corpo ajuda\">\n    <p><b>Para que serve.</b> O painel lê os materiais do CPELOG e calcula, para cada um, quanto estoque mínimo manter, até quando abrir o processo de compra e quanto comprar, considerando que a compra pública depende de licitação (por isso não existe estoque zero). A lógica segue o documento <i>A lógica da distribuição na PMMG</i>: criticidade, pulmão de proteção, tempo real de reposição e distribuição.</p>\n\n    <h3>1. Cabeçalho</h3>\n    <dl>\n      <dt>Nome e número</dt><dd>Quem está conectado ao CPELOG. O mesmo nome aparece na marca-d'água: os dados incluem material controlado e são de uso restrito.</dd>\n      <dt>? Como usar o painel</dt><dd>Abre esta explicação.</dd>\n      <dt>⟳ Atualizar do CPELOG</dt><dd>Busca de novo o estoque do Consumo PRO e os bens do BIMG e recalcula tudo (cerca de 1 minuto). Só lê o CPELOG. O que você digitou aqui (efetivo, taxas, prazos, notas) é mantido.</dd>\n      <dt>Sincronizado</dt><dd>Data da última importação do CPELOG. A faixa dourada mostra também a data do último cálculo.</dd>\n    </dl>\n\n    <h3>2. Menu à esquerda</h3>\n    <dl>\n      <dt>Visão geral</dt><dd>Indicadores, gráficos e os materiais mais urgentes.</dd>\n      <dt>Por família</dt><dd>Um card por família de criticidade, com quantos materiais estão em cada situação.</dd>\n      <dt>Comprar agora, Próximos 90 dias, Reserva insuficiente, Acima do máximo, Falta consumo</dt><dd>Listas prontas de cada situação. O número ao lado é a quantidade de materiais.</dd>\n      <dt>Dados dos itens</dt><dd>Onde se informa o consumo de cada material e os prazos reais do processo de compra.</dd>\n      <dt>Unidades e efetivo</dt><dd>Número de policiais por UEOp (multiplica a taxa \"por policial\"). Viaturas e frações vêm do CPELOG.</dd>\n      <dt>Famílias e notas</dt><dd>Notas de 1 a 5 de cada critério por família e os prazos padrão.</dd>\n      <dt>Pesos e parâmetros</dt><dd>Peso de cada critério e os limites que definem a classe.</dd>\n      <dt>Processos de compra</dt><dd>Datas de processos reais; com elas o prazo médio real substitui o padrão.</dd>\n    </dl>\n\n    <h3>3. Filtros (barra branca)</h3>\n    <p>Classe, Tipo, Família e Situação filtram <b>todos</b> os cards, gráficos e listas da tela. Os filtros ativos aparecem à direita como etiquetas: clique numa etiqueta para retirá-la, ou em <b>Limpar filtros</b> para tirar todos.</p>\n\n    <h3>4. Cards (indicadores)</h3>\n    <dl>\n      <dt>Iniciar compra agora</dt><dd>O saldo já chegou ao estoque mínimo: se o processo não começar agora, o material falta antes da entrega.</dd>\n      <dt>Iniciar em até 30 / 90 dias</dt><dd>A data limite para abrir o processo cai nesse período. Serve para planejar o calendário de compras.</dd>\n      <dt>Reserva técnica insuficiente</dt><dd>Bens permanentes: o que está ESTOCADO é menor que a reserva necessária para repor falhas durante o prazo de compra.</dd>\n      <dt>Acima do máximo</dt><dd>Estoque maior que o teto calculado: indica possível compra defensiva ou excesso.</dd>\n      <dt>Dentro da faixa</dt><dd>Entre o mínimo e o máximo.</dd>\n      <dt>Falta consumo</dt><dd>Materiais de consumo sem taxa nem consumo histórico: o sistema ainda não consegue calcular.</dd>\n      <dt>Base de dados</dt><dd>Quanto já foi preenchido (efetivo, consumo, prazos reais, processos). Quanto mais completo, mais preciso o cálculo.</dd>\n    </dl>\n    <p>Clicar em qualquer card abre uma <b>janela com a lista dos materiais</b>, com busca e o \"ver\" que explica o cálculo de cada um.</p>\n\n    <h3>5. Gráficos (interativos)</h3>\n    <dl>\n      <dt>Situação dos materiais</dt><dd>Quantos materiais há em cada situação. Clique numa fatia para filtrar a tela por ela.</dd>\n      <dt>Situação por classe</dt><dd>As situações dentro de cada classe (Operacional, Funcional, Administrativo). Clique num pedaço da barra para filtrar por classe e situação.</dd>\n      <dt>Compras a iniciar por mês</dt><dd>Quantos processos precisam começar em cada um dos próximos 12 meses. Clique numa coluna para ver só aquele mês.</dd>\n      <dt>Famílias com mais alertas</dt><dd>As famílias com mais materiais para comprar, com reserva insuficiente ou acima do máximo. Clique numa barra para filtrar pela família.</dd>\n      <dt>De onde vem o prazo</dt><dd>Quantos materiais usam prazo padrão do sistema, prazo informado, histórico de processos ou ata. Clique para filtrar.</dd>\n    </dl>\n    <p>Clique de novo no mesmo item do gráfico para desfazer o filtro.</p>\n\n    <h3>6. Como preencher</h3>\n    <ol>\n      <li><b>Unidades e efetivo:</b> informe o número de policiais de cada UEOp.</li>\n      <li><b>Dados dos itens:</b> para cada material de consumo, escolha a <b>base</b> e informe a <b>taxa por mês</b> (ex.: 0,5 pacote por policial por mês) ou o <b>consumo histórico mensal</b>.</li>\n      <li>Prazos: as cinco fases (fase interna, licitação, contratação, entrega, distribuição) vêm com o <span style=\"color:var(--pad);font-style:italic\">padrão do sistema em cinza</span>. Digite o valor real por cima quando souber; ele fica preto e passa a valer. Apague para voltar ao padrão. Se houver <b>ata de registro de preços</b>, marque \"Sim\" e informe o prazo de entrega da ata.</li>\n      <li>Clique em <b>Salvar e recalcular</b> (barra que aparece embaixo quando há alterações).</li>\n    </ol>\n\n    <h3>7. Glossário do cálculo</h3>\n    <dl>\n      <dt>Família de criticidade</dt><dd>Grupo de materiais com o mesmo efeito da falta, o mesmo comportamento de consumo e a mesma dinâmica de reposição (ex.: pneus separados de peças de reparo).</dd>\n      <dt>Nota e classe</dt><dd>Média ponderada dos critérios (0 a 100). Operacional = proteção máxima; Funcional = moderada; Administrativo = mínima. Essencialidade 5 é sempre Operacional.</dd>\n      <dt>Consumo/mês</dt><dd>Efetivo (ou viaturas, ou frações) × taxa, ou o consumo histórico informado.</dd>\n      <dt>Prazo (dias)</dt><dd>Tempo real de reposição: da demanda até o material chegar na ponta.</dd>\n      <dt>Estoque mínimo</dt><dd>Consumo durante o prazo + margem de segurança da classe. É o <b>gatilho</b>: ao chegar nele, inicia-se a compra.</dd>\n      <dt>Estoque máximo</dt><dd>Mínimo + consumo do horizonte de cobertura da compra. É o teto contra acúmulo.</dd>\n      <dt>Iniciar compra até</dt><dd>Último dia para abrir o processo sem que o material falte.</dd>\n      <dt>Comprar</dt><dd>Quantidade para voltar ao máximo (consumo) ou completar a reserva (permanentes).</dd>\n      <dt>Reserva técnica</dt><dd>Permanentes: bens de reserva = parque × taxa de indisponibilidade × prazo × fator da classe.</dd>\n      <dt>Cinza / preto</dt><dd>Cinza = valor padrão do sistema (estimativa). Preto = valor informado por você.</dd>\n    </dl>\n\n    <h3>8. Segurança</h3>\n    <p>O painel só lê o CPELOG. Tudo o que é digitado fica na planilha de dados no seu Google Drive (link \"Planilha de dados\" no menu). Mantenha o app com acesso restrito: os dados incluem armamento e munição.</p>\n  </div>\n</div></div>\n\n<div class=\"barra\" id=\"barra\"><b id=\"nAlt\"></b><button class=\"bt pri\" id=\"btSalvar\">Salvar e recalcular</button><button class=\"bt\" id=\"btDescartar\">Descartar</button></div>\n\n<script>\nvar D = null, alt = {}, pagina = 'geral', estadoPag = {}, POR_PAG = 50, janela = null, graficos = {};\nvar F = { classe: '', tipo: '', fam: '', sit: '', mes: null, origem: '' };\nvar R = { cod: 0, desc: 1, fam: 2, tipo: 3, classe: 4, nota: 5, dem: 6, fonte: 7, lt: 8, origem: 9, ss: 10, min: 11, max: 12, pos: 13, cob: 14, sit: 15, data: 16, sug: 17, just: 18 };\nvar SIT = {\n  'INICIAR COMPRA': ['Iniciar compra', 's-r', '#a3201b'], 'RESERVA INSUFICIENTE': ['Reserva insuficiente', 's-r', '#d66a5f'],\n  'EXCESSO': ['Acima do máximo', 's-a', '#c99632'], 'Dentro da faixa': ['OK', 's-g', '#3f8a4f'], 'Sem demanda informada': ['Falta consumo', 's-c', '#8f8b80'],\n  'Sem reserva exigida': ['Sem reserva necessária', 's-c', '#cfcabd'], 'FAMÍLIA INEXISTENTE': ['Família inválida', 's-r', '#5a1010']\n};\nvar ORDEM_SIT = ['INICIAR COMPRA', 'RESERVA INSUFICIENTE', 'EXCESSO', 'Dentro da faixa', 'Sem demanda informada', 'Sem reserva exigida'];\nvar CLASSES = ['Operacional', 'Funcional', 'Administrativo'], COR_CLASSE = { Operacional: '#a3201b', Funcional: '#c99632', Administrativo: '#3f8a4f' };\nfunction $(id) { return document.getElementById(id); }\nfunction esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); }\nfunction fmt(n) { return n === '' || n === null || n === undefined ? '' : (isNaN(n) ? esc(n) : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })); }\nfunction dt(s) { return !s ? '' : s === 'IMEDIATO' ? '<b class=\"num-r\">Agora</b>' : new Date(s + 'T12:00').toLocaleDateString('pt-BR'); }\nfunction quando(s) { return s ? new Date(s).toLocaleString('pt-BR') : 'nunca'; }\nfunction curto(d) { d = String(d || '').replace(/^\\d{6,9}\\s*-\\s*/, ''); var i = d.indexOf(' - '); d = i > 0 ? d.slice(0, i) : d; d = d.split(' › ').pop(); return d.length > 70 ? d.slice(0, 68) + '…' : d; }\nfunction chipClasse(c) { return c ? '<span class=\"chip c-' + esc(c) + '\">' + esc(c) + '</span>' : ''; }\nfunction chipSit(s) { var x = SIT[s] || [s, 's-c']; return s ? '<span class=\"chip ' + x[1] + '\">' + esc(x[0]) + '</span>' : ''; }\nfunction diasAte(s) { if (!s) return Infinity; if (s === 'IMEDIATO') return -1; return (new Date(s) - new Date()) / 864e5; }\nfunction mesDe(x) { var s = x[R.data], h = new Date(); var d = s === 'IMEDIATO' ? h : s ? new Date(s + 'T12:00') : null; if (!d) return null; var k = (d.getFullYear() - h.getFullYear()) * 12 + d.getMonth() - h.getMonth(); return k >= 0 && k < 12 ? k : null; }\nfunction origemDe(x) { var o = String(x[R.origem] || ''); return /^ata/.test(o) ? 'Ata de registro de preços' : /^fases/.test(o) ? 'Informado no item' : /^hist/.test(o) ? 'Histórico de processos' : o ? 'Padrão do sistema' : ''; }\nfunction nomeMes(k) { var h = new Date(); return new Date(h.getFullYear(), h.getMonth() + k, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }\n\nvar FILTROS = {\n  agora: { t: 'Iniciar compra agora', d: 'Saldo já está no estoque mínimo: o processo de compra deve começar já.', f: function (x) { return x[R.sit] === 'INICIAR COMPRA'; } },\n  d30: { t: 'Iniciar compra em até 30 dias', d: 'Data limite para abrir o processo nos próximos 30 dias.', f: function (x) { var d = diasAte(x[R.data]); return d >= 0 && d <= 30; } },\n  d90: { t: 'Iniciar compra em até 90 dias', d: 'Data limite para abrir o processo nos próximos 90 dias.', f: function (x) { var d = diasAte(x[R.data]); return d >= 0 && d <= 90; } },\n  reserva: { t: 'Reserva técnica insuficiente', d: 'Permanentes: estocado abaixo da reserva necessária para repor falhas durante o prazo de compra.', f: function (x) { return x[R.sit] === 'RESERVA INSUFICIENTE'; } },\n  excesso: { t: 'Acima do máximo', d: 'Estoque maior que o teto calculado: possível excesso.', f: function (x) { return x[R.sit] === 'EXCESSO'; } },\n  ok: { t: 'Dentro da faixa', d: 'Estoque entre o mínimo e o máximo.', f: function (x) { return x[R.sit] === 'Dentro da faixa'; } },\n  sem: { t: 'Falta consumo', d: 'Materiais de consumo sem taxa nem consumo histórico.', f: function (x) { return x[R.sit] === 'Sem demanda informada'; } },\n  todos: { t: 'Todos os materiais', d: 'Materiais importados do CPELOG (respeitando os filtros da barra).', f: function () { return true; } }\n};\n/** Materiais com os filtros globais aplicados. */\nfunction base() {\n  return D.resultados.linhas.map(function (r) { return r.v; }).filter(function (x) {\n    return (!F.classe || x[R.classe] === F.classe) && (!F.tipo || x[R.tipo] === F.tipo) && (!F.fam || x[R.fam] === F.fam) && (!F.sit || x[R.sit] === F.sit) &&\n      (F.mes === null || mesDe(x) === F.mes) && (!F.origem || origemDe(x) === F.origem);\n  });\n}\nfunction ordenar(l) { return l.sort(function (a, b) { return diasAte(a[R.data]) - diasAte(b[R.data]) || ORDEM_SIT.indexOf(a[R.sit]) - ORDEM_SIT.indexOf(b[R.sit]) || (b[R.nota] - a[R.nota]); }); }\n\nfunction chama(fn, args, ok, txt) {\n  ocupado(true, txt);\n  var r = google.script.run.withSuccessHandler(function (x) { ocupado(false); ok(x); }).withFailureHandler(function (e) { ocupado(false); $('msg').innerHTML = '<div class=\"erro\">Erro: ' + esc(e.message) + '</div>'; });\n  r[fn].apply(r, args || []);\n}\nfunction ocupado(on, txt) { ['btAtualizar', 'btLogin', 'btSalvar'].forEach(function (b) { $(b).disabled = on; }); if (on) $('msg').innerHTML = '<div class=\"aviso\">' + esc(txt || 'Processando…') + '</div>'; else if (!$('msg').querySelector('.erro')) $('msg').innerHTML = ''; }\n\n/* ---------- carga e cabeçalho ---------- */\nfunction marcaDagua(txt) {\n  var svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"520\" height=\"300\"><text x=\"20\" y=\"190\" transform=\"rotate(-24 260 150)\" font-family=\"Arial\" font-size=\"17\" fill=\"rgba(140,120,70,0.13)\">' + esc(txt) + '</text></svg>';\n  $('marca').style.backgroundImage = 'url(\"data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '\")';\n}\nfunction mostrarEstado(e) {\n  var quem = (e.nome || 'Usuário') + ' · Nº ' + (e.usuario || '—');\n  $('usuario').textContent = e.acesso ? quem : 'Não conectado';\n  $('sinc').textContent = 'Sincronizado com o CPELOG: ' + quando(e.ultimoImport);\n  $('faixa').textContent = e.acesso ? '✓ Dados consultados no CPELOG (somente leitura) · ' + fmt(e.itens) + ' materiais · último cálculo ' + quando(e.ultimoCalculo) : 'Conecte-se ao CPELOG para carregar os dados';\n  $('btAtualizar').classList.toggle('oculto', !e.acesso);\n  $('login').classList.toggle('oculto', e.acesso); $('corpoApp').classList.toggle('oculto', !e.acesso);\n  marcaDagua((e.nome || '') + ' · Nº ' + (e.usuario || '') + ' · ' + new Date().toLocaleDateString('pt-BR') + ' · uso restrito');\n  D_estado = e;\n}\nvar D_estado = null;\nfunction receber(d) {\n  D = d; alt = {}; mostrarEstado(d.estado); barra();\n  D.res = {}; d.resultados.linhas.forEach(function (r) { D.res[String(r.v[0])] = r.v; });\n  D.fam = {}; d.familias.linhas.forEach(function (r) { D.fam[r.v[0]] = { nome: r.v[1], tipo: r.v[2], desc: r.v[3], classe: r.v[15], nota: r.v[14], lt: r.v[11] }; });\n  $('fFam').innerHTML = '<option value=\"\">Todas</option>' + Object.keys(D.fam).sort().map(function (id) { return '<option value=\"' + esc(id) + '\">' + esc(id + ' · ' + D.fam[id].nome) + '</option>'; }).join('');\n  $('fSit').innerHTML = '<option value=\"\">Todas</option>' + ORDEM_SIT.map(function (s) { return '<option value=\"' + esc(s) + '\">' + esc(SIT[s][0]) + '</option>'; }).join('');\n  render(); if (janela) renderJanela();\n}\n$('btLogin').onclick = function () { chama('salvarAcesso', [$('lgUsuario').value, $('lgSenha').value], function (e) { mostrarEstado(e); $('lgSenha').value = ''; chama('atualizarDoCpelog', [], receber, 'Importando todos os dados do CPELOG (cerca de 1 minuto)…'); }, 'Validando login…'); };\n$('btAtualizar').onclick = function () { chama('atualizarDoCpelog', [], receber, 'Importando os dados do CPELOG e recalculando (cerca de 1 minuto)…'); };\n$('btAjuda').onclick = function () { $('fundoAjuda').classList.add('on'); };\n$('ajFechar').onclick = function () { $('fundoAjuda').classList.remove('on'); };\n\n/* ---------- filtros globais ---------- */\nfunction sincFiltros() {\n  $('fClasse').value = F.classe; $('fTipo').value = F.tipo; $('fFam').value = F.fam; $('fSit').value = F.sit;\n  var t = [];\n  if (F.classe) t.push(['classe', 'Classe: ' + F.classe]); if (F.tipo) t.push(['tipo', F.tipo === 'CONSUMO' ? 'Consumo' : 'Permanentes']);\n  if (F.fam) t.push(['fam', 'Família: ' + ((D.fam[F.fam] || {}).nome || F.fam)]); if (F.sit) t.push(['sit', 'Situação: ' + SIT[F.sit][0]]);\n  if (F.mes !== null) t.push(['mes', 'Compra em ' + nomeMes(F.mes)]); if (F.origem) t.push(['origem', 'Prazo: ' + F.origem]);\n  $('ativos').innerHTML = t.length ? 'Filtros: ' + t.map(function (x) { return '<span class=\"tagf\" data-tira=\"' + x[0] + '\">' + esc(x[1]) + ' ✕</span>'; }).join('') : '';\n}\nfunction filtrar(campo, valor) { F[campo] = (F[campo] === valor) ? (campo === 'mes' ? null : '') : valor; render(); }\n$('ativos').onclick = function (e) { var k = e.target.dataset.tira; if (k) { F[k] = k === 'mes' ? null : ''; render(); } };\n['fClasse', 'fTipo', 'fFam', 'fSit'].forEach(function (id) { $(id).onchange = function () { F[{ fClasse: 'classe', fTipo: 'tipo', fFam: 'fam', fSit: 'sit' }[id]] = this.value; render(); }; });\n$('btLimpar').onclick = function () { F = { classe: '', tipo: '', fam: '', sit: '', mes: null, origem: '' }; render(); };\n\n/* ---------- menu ---------- */\nvar MENU = [\n  ['Painel', [['geral', '📊', 'Visão geral'], ['familias-cards', '🗂️', 'Por família']]],\n  ['Situação', [['agora', '🛒', 'Comprar agora', 'r'], ['d90', '⏳', 'Próximos 90 dias', 'a'], ['reserva', '🛡️', 'Reserva insuficiente', 'r'], ['excesso', '📦', 'Acima do máximo', 'a'], ['sem', '❔', 'Falta consumo']]],\n  ['Cadastro', [['itens', '📝', 'Dados dos itens'], ['unidades', '👮', 'Unidades e efetivo'], ['familias', '⚖️', 'Famílias e notas'], ['parametros', '🎚️', 'Pesos e parâmetros'], ['processos', '📅', 'Processos de compra']]],\n  ['Apoio', [['ajuda', '❓', 'Como usar'], ['planilha', '📄', 'Planilha de dados']]]\n];\nfunction renderNav() {\n  var b = D ? base() : [];\n  $('nav').innerHTML = MENU.map(function (g) {\n    return '<div class=\"grupo-nav\">' + g[0] + '</div>' + g[1].map(function (m) {\n      var n = D && FILTROS[m[0]] ? b.filter(FILTROS[m[0]].f).length : null;\n      return '<div class=\"item-nav ' + (pagina === m[0] ? 'on' : '') + '\" data-p=\"' + m[0] + '\"><span class=\"ic\">' + m[1] + '</span><span>' + m[2] + '</span>' + (n !== null ? '<span class=\"cont ' + (n ? (m[3] || '') : '') + '\">' + fmt(n) + '</span>' : '') + '</div>';\n    }).join('');\n  }).join('');\n}\n$('nav').onclick = function (e) {\n  var el = e.target.closest('.item-nav'); if (!el) return;\n  if (el.dataset.p === 'ajuda') return $('btAjuda').onclick();\n  if (el.dataset.p === 'planilha') { if (D_estado) window.open(D_estado.planilha, '_blank'); return; }\n  pagina = el.dataset.p; render(); window.scrollTo(0, 0);\n};\n\n/* ---------- edição ---------- */\nfunction campo(aba, linha, col, valor, opts) {\n  opts = opts || {};\n  var k = aba + '|' + linha.l + '|' + (col + 1), v = alt[k] !== undefined ? alt[k] : valor;\n  var cls = (opts.padrao && alt[k] === undefined ? 'padrao' : '') + (alt[k] !== undefined ? ' mudou' : '');\n  var data = ' data-k=\"' + esc(k) + '\" data-o=\"' + esc(valor) + '\"' + (opts.dica ? ' title=\"' + esc(opts.dica) + '\"' : '');\n  if (opts.lista) return '<select class=\"' + cls + '\"' + data + '>' + opts.lista.map(function (o) { var val = (o && o.v !== undefined) ? o.v : o; return '<option value=\"' + esc(val) + '\"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc((o && o.t) || o) + '</option>'; }).join('') + '</select>';\n  return '<input class=\"' + cls + '\"' + data + ' value=\"' + esc(v) + '\" inputmode=\"decimal\">';\n}\ndocument.addEventListener('change', function (e) {\n  var el = e.target; if (!el.dataset || !el.dataset.k) return;\n  if (String(el.value) === String(el.dataset.o) && !el.classList.contains('padrao')) delete alt[el.dataset.k]; else alt[el.dataset.k] = el.value;\n  el.classList.remove('padrao'); el.classList.toggle('mudou', alt[el.dataset.k] !== undefined); barra();\n});\nfunction barra() { var n = Object.keys(alt).length; $('barra').classList.toggle('on', n > 0); $('nAlt').textContent = n + ' alteração(ões) não salva(s)'; }\n$('btDescartar').onclick = function () { alt = {}; barra(); render(); };\n$('btSalvar').onclick = function () { var l = Object.keys(alt).map(function (k) { var p = k.split('|'); return { aba: p[0], linha: Number(p[1]), coluna: Number(p[2]), valor: alt[k] }; }); chama('salvarAlteracoes', [l], receber, 'Salvando e recalculando…'); };\n\n/* ---------- janela com lista ---------- */\nfunction abrir(titulo, sub, f) { janela = { titulo: titulo, sub: sub, f: f, pag: 0 }; $('jBusca').value = ''; $('fundo').classList.add('on'); renderJanela(); }\nfunction fechar() { janela = null; $('fundo').classList.remove('on'); $('fundoAjuda').classList.remove('on'); }\n$('jFechar').onclick = fechar; document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });\n['fundo', 'fundoAjuda'].forEach(function (id) { $(id).onclick = function (e) { if (e.target === $(id)) fechar(); }; });\n$('jBusca').oninput = function () { janela.pag = 0; renderJanela(); };\nfunction tabelaMateriais(lista) {\n  return '<thead><tr><th>Material</th><th>Família</th><th>Situação</th><th>Iniciar compra até</th><th class=\"n\">Consumo/mês</th><th class=\"n\">Prazo (dias)</th><th class=\"n\">Saldo</th><th class=\"n\">Mínimo</th><th class=\"n\">Máximo</th><th class=\"n\">Comprar</th><th>Cálculo</th></tr></thead><tbody>' +\n    lista.map(function (x) {\n      var perm = x[R.tipo] === 'PERMANENTE';\n      return '<tr><td title=\"' + esc(x[R.desc]) + '\"><div class=\"nome\">' + esc(curto(x[R.desc])) + '</div><div class=\"sub\">' + esc(x[R.cod]) + ' · ' + (perm ? 'Permanente' : 'Consumo') + '</div></td>' +\n        '<td><div class=\"sub\">' + esc((D.fam[x[R.fam]] || {}).nome || x[R.fam]) + '</div>' + chipClasse(x[R.classe]) + '</td><td>' + chipSit(x[R.sit]) + '</td><td>' + dt(x[R.data]) + '</td>' +\n        '<td class=\"n\">' + (perm ? '<span class=\"sub\">–</span>' : fmt(x[R.dem])) + '</td><td class=\"n\">' + fmt(x[R.lt]) + '</td><td class=\"n\">' + fmt(x[R.pos]) + '</td>' +\n        '<td class=\"n\">' + fmt(x[R.min]) + (perm ? ' <span class=\"sub\">reserva</span>' : '') + '</td><td class=\"n\">' + fmt(x[R.max]) + '</td>' +\n        '<td class=\"n\">' + (Number(x[R.sug]) > 0 && /INICIAR|RESERVA/.test(x[R.sit]) ? '<b>' + fmt(x[R.sug]) + '</b>' : '<span class=\"sub\">–</span>') + '</td>' +\n        '<td><details><summary>ver</summary><p>' + esc(x[R.just]) + '</p></details></td></tr>';\n    }).join('') + '</tbody>';\n}\nfunction renderJanela() {\n  var q = $('jBusca').value.toLowerCase();\n  var l = ordenar(base().filter(function (x) { return janela.f(x) && (!q || (x[R.desc] + ' ' + x[R.cod]).toLowerCase().indexOf(q) >= 0); }));\n  $('jTitulo').textContent = janela.titulo + ' (' + fmt(l.length) + ')'; $('jSub').textContent = (janela.sub || '') + (temFiltro() ? ' · com os filtros da barra' : '');\n  var np = Math.max(Math.ceil(l.length / POR_PAG), 1); janela.pag = Math.min(janela.pag, np - 1);\n  $('jTabela').innerHTML = l.length ? tabelaMateriais(l.slice(janela.pag * POR_PAG, (janela.pag + 1) * POR_PAG)) : '<tr><td class=\"sub\" style=\"padding:24px\">Nenhum material.</td></tr>';\n  paginar('jPag', np, janela.pag, function (p) { janela.pag = p; renderJanela(); });\n}\nfunction temFiltro() { return !!(F.classe || F.tipo || F.fam || F.sit || F.mes !== null || F.origem); }\nfunction paginar(id, np, pag, irPag) {\n  $(id).innerHTML = np > 1 ? 'Página ' + (pag + 1) + ' de ' + np + ' ' + (pag > 0 ? '<button class=\"bt\" data-p=\"' + (pag - 1) + '\">‹ anterior</button>' : '') + (pag < np - 1 ? '<button class=\"bt\" data-p=\"' + (pag + 1) + '\">próxima ›</button>' : '') : '';\n  $(id).onclick = function (e) { if (e.target.dataset.p !== undefined) irPag(Number(e.target.dataset.p)); };\n}\n\n/* ---------- visão geral ---------- */\nfunction card(o) {\n  return '<div class=\"card ' + (o.cor || '') + (o.acao ? ' clic' : '') + (o.v === 0 ? ' zero' : '') + '\"' + (o.acao ? ' data-acao=\"' + esc(o.acao) + '\"' : '') + '>' + (o.acao ? '<span class=\"seta\">›</span>' : '') +\n    '<div class=\"rot\">' + esc(o.rot) + '</div><div class=\"val\">' + (o.vHtml || fmt(o.v)) + '</div><div class=\"det\">' + (o.det || '') + '</div>' + (o.extra || '') + '</div>';\n}\nfunction titulo(t, sub) { return '<div class=\"titulo\"><h2>' + esc(t) + '</h2><span>' + esc(sub || '') + '</span></div>'; }\nfunction renderGeral() {\n  var b = base(), C = D.col, cons = b.filter(function (x) { return x[R.tipo] === 'CONSUMO'; });\n  var uni = D.unidades.linhas, efet = uni.reduce(function (s, u) { return s + (Number(u.v[2]) || 0); }, 0), vtr = uni.reduce(function (s, u) { return s + (Number(u.v[3]) || 0); }, 0);\n  var comDem = cons.filter(function (x) { return Number(x[R.dem]) > 0; }).length;\n  var prazoReal = D.itens.linhas.filter(function (l) { return [C.FASE_INTERNA, C.LICITACAO, C.CONTRATACAO, C.ENTREGA].some(function (k) { return l.p.indexOf(k) < 0 && l.v[k] !== ''; }) || String(l.v[C.ATA]).toUpperCase() === 'S'; }).length;\n  var proc = D.processos.linhas.filter(function (l) { return !/^EX/i.test(String(l.v[0])); }).length;\n  var n = function (id) { return b.filter(FILTROS[id].f).length; };\n  var h = titulo('Visão geral', 'clique em um indicador para ver os materiais') +\n    '<p class=\"dica\">Dica: clique em uma barra ou fatia dos gráficos para filtrar a tela por aquele item. Clique de novo para desfazer. Dúvidas: botão \"? Como usar o painel\".</p>';\n  h += '<div class=\"secao\"><h3>Compras e alertas</h3><div class=\"cards\">' +\n    card({ rot: 'Iniciar compra agora', v: n('agora'), det: 'saldo já no estoque mínimo', cor: 'r', acao: 'f:agora' }) +\n    card({ rot: 'Iniciar em até 30 dias', v: n('d30'), det: 'data limite no próximo mês', cor: 'a', acao: 'f:d30' }) +\n    card({ rot: 'Iniciar em até 90 dias', v: n('d90'), det: 'planejar a abertura do processo', cor: 'a', acao: 'f:d90' }) +\n    card({ rot: 'Reserva técnica insuficiente', v: n('reserva'), det: 'permanentes abaixo da reserva', cor: 'r', acao: 'f:reserva' }) +\n    card({ rot: 'Acima do máximo', v: n('excesso'), det: 'possível excesso de estoque', cor: 'a', acao: 'f:excesso' }) +\n    card({ rot: 'Dentro da faixa', v: n('ok'), det: 'entre mínimo e máximo', cor: 'g', acao: 'f:ok' }) +\n    '</div></div>';\n  h += '<div class=\"secao\"><h3>Base de dados</h3><div class=\"cards\">' +\n    card({ rot: 'Materiais monitorados', v: b.length, det: fmt(cons.length) + ' de consumo · ' + fmt(b.length - cons.length) + ' permanentes', acao: 'f:todos' }) +\n    card({ rot: 'Falta consumo', v: n('sem'), det: 'informe taxa ou consumo histórico', acao: 'f:sem' }) +\n    card({ rot: 'Consumo informado', vHtml: fmt(comDem) + ' <span style=\"font-size:15px;color:var(--mut)\">de ' + fmt(cons.length) + '</span>', det: 'itens de consumo com dado', acao: 'p:itens', extra: '<div class=\"prog\"><i style=\"width:' + Math.round(comDem / Math.max(cons.length, 1) * 100) + '%\"></i></div>' }) +\n    card({ rot: 'Efetivo informado', v: efet, det: uni.length + ' UEOps · ' + fmt(vtr) + ' viaturas no CPELOG', acao: 'p:unidades' }) +\n    card({ rot: 'Prazos reais ou com ata', vHtml: fmt(prazoReal) + ' <span style=\"font-size:15px;color:var(--mut)\">de ' + fmt(D.itens.linhas.length) + '</span>', det: 'os demais usam o padrão (cinza)', acao: 'p:itens', extra: '<div class=\"prog\"><i style=\"width:' + Math.round(prazoReal / Math.max(D.itens.linhas.length, 1) * 100) + '%\"></i></div>' }) +\n    card({ rot: 'Processos de compra', v: proc, det: 'histórico de prazos reais', acao: 'p:processos' }) +\n    '</div></div>';\n  h += '<div class=\"secao\"><h3>Gráficos</h3><div class=\"graficos\">' +\n    '<div class=\"grafico\"><div class=\"rot\">Situação dos materiais</div><div class=\"det\">Clique numa fatia para filtrar.</div><div class=\"tela\"><canvas id=\"gSit\"></canvas></div></div>' +\n    '<div class=\"grafico\"><div class=\"rot\">Situação por classe</div><div class=\"det\">Clique num pedaço da barra para filtrar por classe e situação.</div><div class=\"tela\"><canvas id=\"gClasse\"></canvas></div></div>' +\n    '<div class=\"grafico\"><div class=\"rot\">Compras a iniciar por mês</div><div class=\"det\">Próximos 12 meses. Clique numa coluna para ver o mês.</div><div class=\"tela\"><canvas id=\"gMes\"></canvas></div></div>' +\n    '<div class=\"grafico\"><div class=\"rot\">Famílias com mais alertas</div><div class=\"det\">Comprar agora, em até 90 dias, reserva insuficiente e acima do máximo. Clique para filtrar.</div><div class=\"tela\"><canvas id=\"gFam\"></canvas></div></div>' +\n    '<div class=\"grafico\"><div class=\"rot\">De onde vem o prazo de compra</div><div class=\"det\">Padrão do sistema x dado real. Clique para filtrar.</div><div class=\"tela\"><canvas id=\"gOrigem\"></canvas></div></div>' +\n    '<div class=\"grafico\"><div class=\"rot\">Mais urgentes</div><div class=\"det\">Clique para ver o cálculo.</div><div id=\"urgentes\" style=\"max-height:260px;overflow:auto\"></div></div>' +\n    '</div></div>';\n  h += '<div class=\"secao\"><h3>Famílias com alertas</h3><div id=\"famAlerta\"></div></div>';\n  $('pagina').innerHTML = h;\n  var urg = ordenar(b.filter(function (x) { return /INICIAR|RESERVA/.test(x[R.sit]) || diasAte(x[R.data]) <= 90; })).slice(0, 12);\n  $('urgentes').innerHTML = urg.length ? '<table><tbody>' + urg.map(function (x) { return '<tr class=\"clic\" data-acao=\"item:' + esc(x[R.cod]) + '\"><td><div class=\"nome\">' + esc(curto(x[R.desc])) + '</div><div class=\"sub\">' + esc((D.fam[x[R.fam]] || {}).nome || '') + '</div></td><td>' + chipSit(x[R.sit]) + '<div class=\"sub\">' + dt(x[R.data]) + '</div></td></tr>'; }).join('') + '</tbody></table>' : '<p class=\"sub\">Nada urgente com os filtros e dados atuais.</p>';\n  $('famAlerta').innerHTML = cardsFamilias(b, function (g) { return g.alertas > 0; }, 12);\n  desenharGraficos(b);\n}\n\n/* ---------- gráficos (Chart.js) ---------- */\nfunction destaque(cor, ativo, sel) { return !sel || ativo ? cor : cor + '44'; }\nfunction grafico(id, cfg) {\n  if (graficos[id]) graficos[id].destroy();\n  var el = $(id); if (!el) return;\n  if (typeof Chart === 'undefined') { el.parentNode.innerHTML = '<p class=\"sub\">Gráficos indisponíveis (não foi possível carregar a biblioteca).</p>'; return; }\n  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Inter' } } } } }, cfg.options || {});\n  graficos[id] = new Chart(el, cfg);\n}\nfunction desenharGraficos(b) {\n  // 1. situação (rosca)\n  var cont = {}; b.forEach(function (x) { cont[x[R.sit]] = (cont[x[R.sit]] || 0) + 1; });\n  var sits = ORDEM_SIT.filter(function (s) { return cont[s]; });\n  grafico('gSit', { type: 'doughnut', data: { labels: sits.map(function (s) { return SIT[s][0]; }), datasets: [{ data: sits.map(function (s) { return cont[s]; }), backgroundColor: sits.map(function (s) { return destaque(SIT[s][2], F.sit === s, F.sit); }) }] },\n    options: { cutout: '58%', onClick: function (e, el) { if (el.length) filtrar('sit', sits[el[0].index]); }, plugins: { legend: { position: 'right' } } } });\n  // 2. situação por classe (barras empilhadas)\n  grafico('gClasse', { type: 'bar', data: { labels: CLASSES, datasets: ORDEM_SIT.map(function (s) {\n      return { label: SIT[s][0], data: CLASSES.map(function (c) { return b.filter(function (x) { return x[R.classe] === c && x[R.sit] === s; }).length; }),\n        backgroundColor: CLASSES.map(function (c) { return destaque(SIT[s][2], (!F.classe || F.classe === c) && (!F.sit || F.sit === s), F.classe || F.sit); }) };\n    }).filter(function (d) { return d.data.some(Boolean); }) },\n    options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, onClick: function (e, el) {\n      if (!el.length) return; var ds = graficos.gClasse.data.datasets[el[0].datasetIndex].label, s = ORDEM_SIT.filter(function (k) { return SIT[k][0] === ds; })[0], c = CLASSES[el[0].index];\n      var mesmo = F.classe === c && F.sit === s; F.classe = mesmo ? '' : c; F.sit = mesmo ? '' : s; render(); } } });\n  // 3. compras por mês\n  var meses = []; for (var k = 0; k < 12; k++) meses.push(0); b.forEach(function (x) { var m = mesDe(x); if (m !== null) meses[m]++; });\n  var h = new Date();\n  grafico('gMes', { type: 'bar', data: { labels: meses.map(function (v, k) { return new Date(h.getFullYear(), h.getMonth() + k, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); }),\n      datasets: [{ label: 'Processos a iniciar', data: meses, backgroundColor: meses.map(function (v, k) { return destaque('#A08F63', F.mes === k, F.mes !== null); }), borderRadius: 4 }] },\n    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, onClick: function (e, el) { if (el.length) filtrar('mes', el[0].index); } } });\n  // 4. famílias com alertas\n  var g = agregado(b), ids = Object.keys(g).filter(function (id) { return g[id].alertas; }).sort(function (a, c) { return g[c].alertas - g[a].alertas; }).slice(0, 10);\n  var partes = [['agora', 'Comprar agora', '#a3201b'], ['res', 'Reserva insuficiente', '#d66a5f'], ['d90', 'Em até 90 dias', '#e0b25a'], ['exc', 'Acima do máximo', '#c99632']];\n  grafico('gFam', { type: 'bar', data: { labels: ids.map(function (id) { var nm = (D.fam[id] || {}).nome || id; return nm.length > 34 ? nm.slice(0, 33) + '…' : nm; }),\n      datasets: partes.map(function (p) { return { label: p[1], data: ids.map(function (id) { return g[id][p[0]]; }), backgroundColor: ids.map(function (id) { return destaque(p[2], F.fam === id, F.fam); }) }; }) },\n    options: { indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, ticks: { font: { size: 11 } } } }, onClick: function (e, el) { if (el.length) filtrar('fam', ids[el[0].index]); } } });\n  if (!ids.length) { var c4 = $('gFam'); if (c4) c4.parentNode.innerHTML = '<p class=\"sub\">Nenhuma família com alerta nos filtros atuais.</p>'; }\n  // 5. origem do prazo\n  var orig = {}; b.forEach(function (x) { var o = origemDe(x); if (o) orig[o] = (orig[o] || 0) + 1; });\n  var os = ['Padrão do sistema', 'Informado no item', 'Histórico de processos', 'Ata de registro de preços'].filter(function (o) { return orig[o]; }), corO = { 'Padrão do sistema': '#b9b3a3', 'Informado no item': '#373435', 'Histórico de processos': '#A08F63', 'Ata de registro de preços': '#3f8a4f' };\n  grafico('gOrigem', { type: 'doughnut', data: { labels: os, datasets: [{ data: os.map(function (o) { return orig[o]; }), backgroundColor: os.map(function (o) { return destaque(corO[o], F.origem === o, F.origem); }) }] },\n    options: { cutout: '58%', onClick: function (e, el) { if (el.length) filtrar('origem', os[el[0].index]); }, plugins: { legend: { position: 'right' } } } });\n}\n\n/* ---------- famílias ---------- */\nfunction agregado(b) {\n  var g = {};\n  b.forEach(function (x) {\n    var f = g[x[R.fam]] || (g[x[R.fam]] = { n: 0, agora: 0, d90: 0, res: 0, exc: 0, sem: 0, ok: 0, alertas: 0 });\n    f.n++; if (x[R.sit] === 'INICIAR COMPRA') f.agora++; var d = diasAte(x[R.data]); if (d >= 0 && d <= 90) f.d90++;\n    if (x[R.sit] === 'RESERVA INSUFICIENTE') f.res++; if (x[R.sit] === 'EXCESSO') f.exc++; if (x[R.sit] === 'Sem demanda informada') f.sem++; if (x[R.sit] === 'Dentro da faixa') f.ok++;\n    f.alertas = f.agora + f.d90 + f.res + f.exc;\n  });\n  return g;\n}\nfunction cardsFamilias(b, filtro, limite) {\n  var g = agregado(b), ordem = { Operacional: 0, Funcional: 1, Administrativo: 2 };\n  var ids = Object.keys(g).filter(function (id) { return !filtro || filtro(g[id]); })\n    .sort(function (a, c) { return (g[c].agora + g[c].res - g[a].agora - g[a].res) || (ordem[(D.fam[a] || {}).classe] - ordem[(D.fam[c] || {}).classe]) || (g[c].alertas - g[a].alertas) || (a > c ? 1 : -1); });\n  if (limite) ids = ids.slice(0, limite);\n  if (!ids.length) return '<p class=\"sub\">Nenhuma família com os filtros atuais.</p>';\n  return '<div class=\"cards\" style=\"grid-template-columns:repeat(auto-fill,minmax(260px,1fr))\">' + ids.map(function (id) {\n    var f = D.fam[id] || {}, x = g[id], cor = x.agora + x.res ? 'r' : x.d90 + x.exc ? 'a' : x.ok ? 'g' : '';\n    var l = [['Comprar agora', x.agora, 'num-r'], ['Em até 90 dias', x.d90, 'num-a'], ['Reserva insuficiente', x.res, 'num-r'], ['Acima do máximo', x.exc, 'num-a'], ['OK', x.ok, ''], ['Falta consumo', x.sem, '']].filter(function (k) { return k[1]; });\n    return '<div class=\"card clic ' + cor + '\" data-acao=\"fam:' + esc(id) + '\"><span class=\"seta\">›</span><div class=\"rot\">' + esc(f.nome || id) + '</div><div style=\"margin:6px 0\">' + chipClasse(f.classe) + ' <span class=\"sub\">' + esc(id) + ' · ' + fmt(x.n) + ' materiais · prazo ' + fmt(f.lt) + ' dias</span></div>' +\n      '<div class=\"det\" style=\"color:var(--tx)\">' + l.map(function (k) { return esc(k[0]) + ': <span class=\"' + k[2] + '\">' + fmt(k[1]) + '</span>'; }).join(' · ') + '</div></div>';\n  }).join('') + '</div>';\n}\nfunction renderFamiliasCards() { $('pagina').innerHTML = titulo('Por família de criticidade', 'clique numa família para ver os materiais') + '<p class=\"dica\">Use a barra de filtros para ver só uma classe ou tipo.</p>' + cardsFamilias(base(), null, 0); }\n\n/* ---------- situação ---------- */\nfunction renderSituacao(id) {\n  var Fi = FILTROS[id], ep = estadoPag[id] || (estadoPag[id] = { q: '', pag: 0 });\n  var l = ordenar(base().filter(function (x) { return Fi.f(x) && (!ep.q || (x[R.desc] + ' ' + x[R.cod]).toLowerCase().indexOf(ep.q.toLowerCase()) >= 0); }));\n  var np = Math.max(Math.ceil(l.length / POR_PAG), 1); ep.pag = Math.min(ep.pag, np - 1);\n  $('pagina').innerHTML = titulo(Fi.t + ' (' + fmt(l.length) + ')', Fi.d) +\n    '<div style=\"margin:10px 0 12px\"><input id=\"sBusca\" placeholder=\"Buscar material ou código…\" style=\"min-width:300px\" value=\"' + esc(ep.q) + '\"></div>' +\n    '<div class=\"wrap\">' + (l.length ? '<table>' + tabelaMateriais(l.slice(ep.pag * POR_PAG, (ep.pag + 1) * POR_PAG)) + '</table>' : '<p class=\"sub\" style=\"padding:20px\">Nenhum material nesta situação.</p>') + '</div><div class=\"pag\" id=\"sPag\"></div>';\n  $('sBusca').onchange = function () { ep.q = this.value; ep.pag = 0; renderSituacao(id); };\n  paginar('sPag', np, ep.pag, function (p) { ep.pag = p; renderSituacao(id); });\n}\n\n/* ---------- cadastro ---------- */\nvar BASES = [{ v: 'POLICIAL', t: 'Por policial' }, { v: 'VIATURA', t: 'Por viatura' }, { v: 'UNIDADE', t: 'Por fração' }, { v: 'HISTORICO', t: 'Histórico' }];\nfunction renderItens() {\n  var C = D.col, ep = estadoPag.itens || (estadoPag.itens = { falta: '', q: '', pag: 0 });\n  var lista = D.itens.linhas.filter(function (r) {\n    var v = r.v, rr = D.res[String(v[C.CODIGO])] || [];\n    if (ep.falta === 'consumo' && !(v[C.TIPO] === 'CONSUMO' && !(Number(rr[R.dem]) > 0))) return false;\n    if (ep.falta === 'prazo' && r.p.indexOf(C.LICITACAO) < 0) return false;\n    return (!F.fam || v[C.FAMILIA] === F.fam) && (!F.tipo || v[C.TIPO] === F.tipo) && (!F.classe || rr[R.classe] === F.classe) && (!F.sit || rr[R.sit] === F.sit) &&\n      (!ep.q || (v[C.DESCRICAO] + ' ' + v[C.CODIGO]).toLowerCase().indexOf(ep.q.toLowerCase()) >= 0);\n  });\n  var np = Math.max(Math.ceil(lista.length / POR_PAG), 1); ep.pag = Math.min(ep.pag, np - 1);\n  var famOpts = Object.keys(D.fam).sort().map(function (id) { return { v: id, t: id + ' · ' + D.fam[id].nome }; });\n  $('pagina').innerHTML = titulo('Dados dos itens (' + fmt(lista.length) + ')', 'informe o consumo e os prazos reais') +\n    '<p class=\"dica\">Escolha a base e a taxa por mês, ou o consumo histórico. <i style=\"color:var(--pad)\">Cinza = padrão do sistema</i>; o que você digitar fica preto e passa a valer. Depois clique em Salvar e recalcular.</p>' +\n    '<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px\"><select id=\"iFalta\"><option value=\"\">Todos</option><option value=\"consumo\">Só itens sem consumo</option><option value=\"prazo\">Só prazos no padrão</option></select>' +\n    '<input id=\"iBusca\" placeholder=\"Buscar item ou código…\" style=\"min-width:260px\" value=\"' + esc(ep.q) + '\"></div>' +\n    '<div class=\"wrap\"><table><thead><tr class=\"grupo\"><th class=\"fixa\"></th><th colspan=\"3\"></th><th colspan=\"4\">Consumo</th><th colspan=\"3\">Compra</th><th colspan=\"5\">Prazo do processo (dias)</th><th colspan=\"2\">Resultado</th></tr>' +\n    '<tr><th class=\"fixa\">Item</th><th>Família</th><th class=\"n\">Saldo</th><th class=\"n\">Parque</th><th>Base</th><th>Taxa/mês</th><th>Histórico/mês</th><th>Desvio</th><th>Em trânsito</th><th>Ata vigente</th><th>Prazo da ata</th><th>Fase interna</th><th>Licitação</th><th>Contratação</th><th>Entrega</th><th>Distribuição</th><th>Situação</th><th class=\"n\">Mínimo</th></tr></thead><tbody>' +\n    lista.slice(ep.pag * POR_PAG, (ep.pag + 1) * POR_PAG).map(function (r) {\n      var v = r.v, perm = v[C.TIPO] === 'PERMANENTE', rr = D.res[String(v[C.CODIGO])] || [];\n      function f(col, o) { o = o || {}; o.padrao = r.p.indexOf(col) >= 0; return '<td>' + campo('ITENS', r, col, v[col], o) + '</td>'; }\n      var nada = '<td class=\"sub\">–</td>';\n      return '<tr><td class=\"fixa\" title=\"' + esc(v[C.DESCRICAO]) + '\"><div class=\"nome\">' + esc(curto(v[C.DESCRICAO])) + '</div><div class=\"sub\">' + esc(v[C.CODIGO]) + ' · ' + (perm ? 'Permanente' : 'Consumo') + '</div></td>' +\n        f(C.FAMILIA, { lista: famOpts }) + '<td class=\"n\">' + fmt(v[C.SALDO]) + '</td><td class=\"n\">' + (perm ? fmt(v[C.PARQUE]) : '<span class=\"sub\">–</span>') + '</td>' +\n        (perm ? nada + nada + nada + nada : f(C.BASE, { lista: BASES }) + f(C.TAXA, { dica: 'Unidades por mês para cada policial, viatura ou fração' }) + f(C.HIST, { dica: 'Consumo médio mensal observado' }) + f(C.DESVIO, { dica: 'Desvio padrão do consumo mensal (opcional)' })) +\n        f(C.TRANSITO) + f(C.ATA, { lista: [{ v: '', t: '—' }, { v: 'S', t: 'Sim' }, { v: 'N', t: 'Não' }] }) + f(C.PRAZO_ATA) +\n        f(C.FASE_INTERNA, { dica: 'Da demanda à abertura do processo' }) + f(C.LICITACAO, { dica: 'Da abertura à homologação' }) + f(C.CONTRATACAO, { dica: 'Da homologação ao empenho' }) + f(C.ENTREGA, { dica: 'Do empenho à entrega no almoxarifado' }) + f(C.DISTRIBUICAO, { dica: 'Do almoxarifado à ponta' }) +\n        '<td>' + chipSit(rr[R.sit]) + '</td><td class=\"n\">' + fmt(rr[R.min]) + '</td></tr>';\n    }).join('') + '</tbody></table></div><div class=\"pag\" id=\"iPag\"></div>';\n  $('iFalta').value = ep.falta;\n  $('iFalta').onchange = function () { ep.falta = this.value; ep.pag = 0; renderItens(); };\n  $('iBusca').onchange = function () { ep.q = this.value; ep.pag = 0; renderItens(); };\n  paginar('iPag', np, ep.pag, function (p) { ep.pag = p; renderItens(); });\n}\nvar NOTA = ['', 1, 2, 3, 4, 5];\nfunction tabela(t1, t2, texto, aba, t, cols) {\n  $('pagina').innerHTML = titulo(t1, t2) + '<p class=\"dica\">' + texto + '</p><div class=\"wrap\"><table><thead><tr>' + cols.map(function (c) { return '<th' + (c.n ? ' class=\"n\"' : '') + '>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +\n    t.linhas.map(function (r) { return '<tr>' + cols.map(function (c) { var x = r.v[c.i]; if (c.edit) return '<td>' + campo(aba, r, c.i, x, { lista: c.lista }) + '</td>'; if (c.fmt) return '<td>' + c.fmt(x, r.v) + '</td>'; return '<td class=\"' + (c.n ? 'n' : '') + (c.mut ? ' sub' : '') + '\">' + (c.n ? fmt(x) : esc(x)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';\n}\n\nfunction render() {\n  if (!D) return;\n  sincFiltros(); renderNav();\n  $('filtrobar').classList.toggle('oculto', ['unidades', 'familias', 'parametros', 'processos'].indexOf(pagina) >= 0);\n  if (pagina === 'geral') renderGeral();\n  else if (pagina === 'familias-cards') renderFamiliasCards();\n  else if (FILTROS[pagina]) renderSituacao(pagina);\n  else if (pagina === 'itens') renderItens();\n  else if (pagina === 'familias') tabela('Famílias e notas', 'critérios de criticidade', 'Notas de 1 (baixo) a 5 (alto). A nota final (0-100) e a classe usam os pesos de \"Pesos e parâmetros\". Prazo padrão = dias da demanda até a entrega, sem a distribuição.', 'FAMILIAS', D.familias, [\n    { i: 0, t: 'ID' }, { i: 1, t: 'Família', fmt: function (x, v) { return '<div class=\"nome\">' + esc(x) + '</div><div class=\"sub\">' + esc(v[3]) + '</div>'; } }, { i: 2, t: 'Tipo', mut: true },\n    { i: 4, t: 'Essencialidade', edit: true, lista: NOTA }, { i: 5, t: 'Risco à segurança', edit: true, lista: NOTA }, { i: 6, t: 'Substituição', edit: true, lista: NOTA },\n    { i: 7, t: 'Controle', edit: true, lista: NOTA }, { i: 8, t: 'Variabilidade', edit: true, lista: NOTA }, { i: 9, t: 'Duração reposição', edit: true, lista: NOTA },\n    { i: 10, t: 'Incerteza reposição', edit: true, lista: NOTA }, { i: 11, t: 'Prazo padrão (dias)', edit: true }, { i: 12, t: 'Base padrão', edit: true, lista: [{ v: '', t: '—' }].concat(BASES) },\n    { i: 13, t: 'Indisp. anual (perm.)', edit: true }, { i: 14, t: 'Nota', n: true }, { i: 15, t: 'Classe', fmt: function (x) { return chipClasse(x); } }]);\n  else if (pagina === 'parametros') tabela('Pesos e parâmetros', 'política de cálculo', 'Pesos de 0 a 10 para cada critério, limites de nota das classes e parâmetros do cálculo.', 'PARAMETROS', D.parametros, [{ i: 0, t: 'Parâmetro', mut: true }, { i: 1, t: 'Valor', edit: true }, { i: 2, t: 'O que é' }]);\n  else if (pagina === 'unidades') tabela('Unidades e efetivo', 'informe o nº de policiais', 'Viaturas e frações vêm do CPELOG. O efetivo multiplica a taxa dos itens consumidos \"por policial\". Alterar aqui não muda nada no CPELOG.', 'UNIDADES', D.unidades, [\n    { i: 0, t: 'UEOp' }, { i: 2, t: 'Policiais (efetivo)', edit: true }, { i: 3, t: 'Viaturas', edit: true }, { i: 4, t: 'Frações', edit: true }, { i: 5, t: 'Considerar', edit: true, lista: [{ v: 'S', t: 'Sim' }, { v: 'N', t: 'Não' }] }]);\n  else if (pagina === 'processos') tabela('Processos de compra', 'histórico de prazos reais', 'Com as datas de processos reais, o prazo médio da família substitui o padrão do sistema. Para incluir processos, use a planilha de dados (aba PROCESSOS). As linhas EXEMPLO são fictícias.', 'PROCESSOS', D.processos, [\n    { i: 0, t: 'Processo' }, { i: 1, t: 'Código do item', edit: true }, { i: 2, t: 'Família', edit: true }, { i: 3, t: 'Demanda', edit: true }, { i: 4, t: 'Abertura', edit: true }, { i: 5, t: 'Homologação', edit: true },\n    { i: 6, t: 'Empenho', edit: true }, { i: 7, t: 'Entrega', edit: true }, { i: 8, t: 'Fase interna', n: true }, { i: 9, t: 'Licitação', n: true }, { i: 10, t: 'Contratação', n: true }, { i: 11, t: 'Entrega', n: true }, { i: 12, t: 'Total (dias)', n: true }]);\n}\n\n/* ---------- cliques em cards e listas ---------- */\ndocument.addEventListener('click', function (e) {\n  var el = e.target.closest('[data-acao]'); if (!el) return;\n  var a = el.dataset.acao, i = a.indexOf(':'), tipo = a.slice(0, i), val = a.slice(i + 1);\n  if (tipo === 'f') abrir(FILTROS[val].t, FILTROS[val].d, FILTROS[val].f);\n  else if (tipo === 'p') { pagina = val; render(); window.scrollTo(0, 0); }\n  else if (tipo === 'fam') { var f = D.fam[val] || {}; abrir((f.nome || val) + ' (' + val + ')', (f.desc || '') + (f.classe ? ' · classe ' + f.classe : ''), function (x) { return x[R.fam] === val; }); }\n  else if (tipo === 'item') abrir('Material ' + val, '', function (x) { return String(x[R.cod]) === val; });\n});\n\nrenderNav();\nchama('estadoWeb', [], function (e) { mostrarEstado(e); if (e.acesso) chama('dadosWeb', [], receber, 'Carregando dados…'); }, 'Verificando acesso…');\n</script>\n</body>\n</html>\n";
