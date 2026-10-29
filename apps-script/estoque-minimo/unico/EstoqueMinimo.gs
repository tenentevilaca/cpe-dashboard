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

var PAINEL_HTML = "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n<base target=\"_top\">\n<meta charset=\"utf-8\">\n<style>\n  :root { --bg:#f4f6f9; --card:#fff; --tx:#1d2330; --mut:#5f6878; --fraco:#8a93a3; --bd:#e1e5eb; --pri:#1f3864; --pri2:#e8eef8;\n          --red:#b3261e; --redbg:#fbe4e1; --amb:#8a5300; --ambbg:#fdf0d6; --grn:#1b6e3f; --grnbg:#dcf1e4; --cin:#59616e; --cinbg:#eceff3;\n          --op:#b3261e; --fu:#8a5300; --ad:#1b6e3f; --edit:#fffdf3; --pad:#9aa1ad; }\n  @media (prefers-color-scheme: dark) {\n    :root { --bg:#13161b; --card:#1c2027; --tx:#e7eaef; --mut:#a1a9b7; --fraco:#7c8492; --bd:#2d333d; --pri:#9bb8ec; --pri2:#232c3b;\n            --red:#ff8f80; --redbg:#3b2421; --amb:#f2bb63; --ambbg:#3a2f1b; --grn:#74d6a0; --grnbg:#1b3427; --cin:#b3bac6; --cinbg:#2a2f37;\n            --op:#ff8f80; --fu:#f2bb63; --ad:#74d6a0; --edit:#25231a; --pad:#7c8492; }\n  }\n  * { box-sizing:border-box; }\n  body { margin:0; background:var(--bg); color:var(--tx); font:14px/1.45 Arial, sans-serif; }\n  header { background:var(--card); border-bottom:1px solid var(--bd); padding:14px 20px 0; }\n  .topo { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; justify-content:space-between; }\n  h1 { font-size:20px; margin:0; color:var(--pri); }\n  h2 { font-size:15px; margin:0 0 4px; }\n  main { padding:18px 20px 80px; max-width:1500px; }\n  .mut { color:var(--mut); font-size:12px; }\n  .acoes { display:flex; gap:8px; align-items:center; }\n  button, .bt { padding:8px 14px; border:1px solid var(--pri); background:var(--pri); color:#fff; border-radius:6px; cursor:pointer; font:inherit; text-decoration:none; }\n  .sec { background:transparent; color:var(--pri); }\n  button:disabled { opacity:.5; cursor:wait; }\n  a { color:var(--pri); }\n  .abas { display:flex; flex-wrap:wrap; gap:2px; margin-top:12px; }\n  .aba { padding:9px 14px; cursor:pointer; color:var(--mut); border-bottom:3px solid transparent; }\n  .aba.on { color:var(--pri); font-weight:bold; border-bottom-color:var(--pri); }\n  .bloco { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:16px; margin-bottom:16px; }\n  .grade { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }\n  .passo { border:1px solid var(--bd); border-radius:8px; padding:12px; }\n  .passo b { font-size:20px; }\n  .prog { height:6px; background:var(--cinbg); border-radius:3px; margin:8px 0; overflow:hidden; }\n  .prog i { display:block; height:100%; background:var(--grn); }\n  .passo.falta .prog i { background:var(--amb); }\n  .kpis { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); }\n  .kpi { border:1px solid var(--bd); border-radius:8px; padding:10px 12px; cursor:pointer; background:var(--card); }\n  .kpi b { display:block; font-size:24px; }\n  .kpi.on { outline:2px solid var(--pri); }\n  .kpi.zero { opacity:.55; }\n  .filtros { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:12px 0; }\n  select, input { padding:7px 9px; border:1px solid var(--bd); border-radius:6px; background:var(--card); color:var(--tx); font:inherit; }\n  .wrap { overflow:auto; max-height:68vh; border:1px solid var(--bd); border-radius:8px; background:var(--card); }\n  table { border-collapse:collapse; width:100%; }\n  th, td { padding:8px 9px; border-bottom:1px solid var(--bd); text-align:left; vertical-align:middle; }\n  th { position:sticky; top:0; z-index:2; background:var(--card); font-size:11px; font-weight:bold; color:var(--mut); text-transform:uppercase; letter-spacing:.02em; }\n  thead tr.grupo th { top:0; text-align:center; border-bottom:none; color:var(--pri); }\n  thead tr.grupo + tr th { top:29px; }\n  tr.clic { cursor:pointer; } tr.clic:hover td { background:var(--pri2); }\n  tr.sel td { background:var(--pri2); }\n  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }\n  .nome { font-weight:bold; }\n  .cod { color:var(--fraco); font-size:12px; }\n  .sub { color:var(--mut); font-size:12px; }\n  .chip { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; white-space:nowrap; font-weight:bold; }\n  .c-Operacional { background:var(--redbg); color:var(--op); } .c-Funcional { background:var(--ambbg); color:var(--fu); } .c-Administrativo { background:var(--grnbg); color:var(--ad); }\n  .s-r { background:var(--redbg); color:var(--red); } .s-a { background:var(--ambbg); color:var(--amb); } .s-g { background:var(--grnbg); color:var(--grn); } .s-c { background:var(--cinbg); color:var(--cin); }\n  .num-r { color:var(--red); font-weight:bold; } .num-a { color:var(--amb); font-weight:bold; }\n  details summary { cursor:pointer; color:var(--pri); font-size:12px; }\n  details p { margin:6px 0 0; font-size:12px; color:var(--mut); max-width:520px; }\n  td input, td select { width:100%; min-width:70px; padding:5px 6px; font-size:13px; background:var(--edit); }\n  td select { min-width:112px; }\n  td input.padrao, td select.padrao { color:var(--pad); font-style:italic; background:transparent; }\n  td input.mudou, td select.mudou { outline:2px solid var(--amb); }\n  .fixa { position:sticky; left:0; z-index:1; background:var(--card); min-width:240px; max-width:300px; }\n  th.fixa { z-index:3; }\n  .barra { position:fixed; left:0; right:0; bottom:0; background:var(--card); border-top:1px solid var(--bd); padding:10px 20px; display:none; gap:12px; align-items:center; z-index:5; }\n  .barra.on { display:flex; }\n  .card { background:var(--card); border:1px solid var(--bd); border-radius:10px; padding:18px; max-width:440px; }\n  .card input { width:100%; margin:4px 0 12px; }\n  .aviso { background:var(--ambbg); color:var(--amb); border-radius:8px; padding:10px 12px; margin-bottom:12px; }\n  .erro { background:var(--redbg); color:var(--red); border-radius:8px; padding:10px 12px; margin-bottom:12px; }\n  .oculto { display:none !important; }\n  .pag { display:flex; gap:8px; align-items:center; margin-top:8px; }\n</style>\n</head>\n<body>\n<header>\n  <div class=\"topo\">\n    <div><h1>Estoque mínimo e lógica de compra</h1><div class=\"mut\" id=\"estado\">Carregando…</div></div>\n    <div class=\"acoes\"><a id=\"lkPlanilha\" class=\"bt sec oculto\" target=\"_blank\">Planilha de dados</a><button id=\"btAtualizar\" class=\"oculto\">Atualizar do CPELOG</button></div>\n  </div>\n  <nav class=\"abas\" id=\"abas\"></nav>\n</header>\n\n<main>\n  <div id=\"msg\"></div>\n\n  <div id=\"login\" class=\"card oculto\">\n    <h2>Acesso ao CPELOG</h2>\n    <p class=\"mut\">O sistema lê os dados do inventário (inventario.cpelog.com.br) com o seu login. A senha fica guardada só nas propriedades deste script.</p>\n    <label>Número de polícia<input id=\"lgUsuario\" autocomplete=\"username\"></label>\n    <label>Senha<input id=\"lgSenha\" type=\"password\" autocomplete=\"current-password\"></label>\n    <button id=\"btLogin\">Entrar e importar</button>\n  </div>\n\n  <div id=\"app\" class=\"oculto\">\n\n    <section data-aba=\"diag\">\n      <div class=\"bloco\">\n        <h2>1. O que falta preencher</h2>\n        <div class=\"mut\" style=\"margin-bottom:10px\">O cálculo de estoque mínimo e da data de compra só sai para itens com consumo. Os prazos funcionam com o padrão do sistema, mas ficam mais precisos com o dado real.</div>\n        <div class=\"grade\" id=\"passos\"></div>\n      </div>\n\n      <div class=\"bloco\">\n        <h2>2. Situação dos itens</h2>\n        <div class=\"mut\" style=\"margin-bottom:10px\">Clique num quadro para filtrar a lista abaixo.</div>\n        <div class=\"kpis\" id=\"kpis\"></div>\n      </div>\n\n      <div class=\"bloco\">\n        <h2>3. Por família de criticidade</h2>\n        <div class=\"mut\">Clique numa família para ver os itens dela.</div>\n        <div class=\"filtros\">\n          <select id=\"fClasse\"><option value=\"\">Todas as classes</option><option>Operacional</option><option>Funcional</option><option>Administrativo</option></select>\n          <select id=\"fTipo\"><option value=\"\">Consumo e permanentes</option><option value=\"CONSUMO\">Consumo</option><option value=\"PERMANENTE\">Permanentes</option></select>\n        </div>\n        <div class=\"wrap\" style=\"max-height:46vh\"><table id=\"tFam\"></table></div>\n      </div>\n\n      <div class=\"bloco\" id=\"blItens\">\n        <h2 id=\"tituloItens\">4. Itens</h2>\n        <div class=\"filtros\">\n          <input id=\"fBusca\" placeholder=\"Buscar item ou código…\" style=\"min-width:260px\">\n          <button class=\"sec\" id=\"btLimpar\">Limpar filtros</button>\n        </div>\n        <div class=\"wrap\"><table id=\"tItensDiag\"></table></div>\n        <div class=\"pag mut\" id=\"pagDiag\"></div>\n      </div>\n    </section>\n\n    <section data-aba=\"itens\">\n      <div class=\"bloco\">\n        <h2>Dados de cada item</h2>\n        <div class=\"mut\">Preencha o consumo (taxa ou histórico) e, quando souber, os prazos reais. <span style=\"color:var(--pad);font-style:italic\">Cinza = padrão do sistema</span>; o que você digitar fica preto e passa a valer.</div>\n        <div class=\"filtros\">\n          <select id=\"iFamilia\" class=\"selFam\"><option value=\"\">Todas as famílias</option></select>\n          <select id=\"iTipo\"><option value=\"\">Consumo e permanentes</option><option value=\"CONSUMO\">Consumo</option><option value=\"PERMANENTE\">Permanentes</option></select>\n          <select id=\"iFalta\"><option value=\"\">Todos</option><option value=\"consumo\">Só itens sem consumo</option><option value=\"prazo\">Só prazos no padrão</option></select>\n          <input id=\"iBusca\" placeholder=\"Buscar item ou código…\" style=\"min-width:240px\">\n        </div>\n        <div class=\"wrap\"><table id=\"tItens\"></table></div>\n        <div class=\"pag mut\" id=\"pagItens\"></div>\n      </div>\n    </section>\n\n    <section data-aba=\"familias\">\n      <div class=\"bloco\">\n        <h2>Famílias e notas dos critérios</h2>\n        <div class=\"mut\">Notas de 1 (baixo) a 5 (alto). A nota final (0-100) e a classe usam os pesos da aba Pesos e parâmetros. Tempo de compra padrão = dias da demanda até a entrega, sem a distribuição.</div>\n        <div class=\"wrap\" style=\"margin-top:12px\"><table id=\"tFamilias\"></table></div>\n      </div>\n    </section>\n\n    <section data-aba=\"parametros\">\n      <div class=\"bloco\"><h2>Pesos e parâmetros</h2><div class=\"mut\">Pesos de 0 a 10 para cada critério, limites de nota das classes e parâmetros do cálculo.</div>\n        <div class=\"wrap\" style=\"margin-top:12px\"><table id=\"tParametros\"></table></div></div>\n    </section>\n\n    <section data-aba=\"unidades\">\n      <div class=\"bloco\"><h2>Unidades e efetivo</h2><div class=\"mut\">Viaturas e frações vêm do CPELOG. O <b>efetivo (nº de policiais)</b> precisa ser informado: ele multiplica a taxa dos itens com base \"por policial\".</div>\n        <div class=\"wrap\" style=\"margin-top:12px\"><table id=\"tUnidades\"></table></div></div>\n    </section>\n\n    <section data-aba=\"processos\">\n      <div class=\"bloco\"><h2>Processos de compra</h2><div class=\"mut\">Com as datas de processos reais, o prazo médio da família substitui o padrão do sistema. Para incluir processos, use a <a id=\"lkProc\" target=\"_blank\">planilha de dados</a> (aba PROCESSOS). As linhas EXEMPLO são fictícias.</div>\n        <div class=\"wrap\" style=\"margin-top:12px\"><table id=\"tProcessos\"></table></div></div>\n    </section>\n  </div>\n</main>\n\n<div class=\"barra\" id=\"barra\"><b id=\"nAlt\"></b><button id=\"btSalvar\">Salvar e recalcular</button><button class=\"sec\" id=\"btDescartar\">Descartar</button></div>\n\n<script>\nvar D = null, alt = {}, abaAtual = 'diag', filtro = { kpi: null, fam: null }, pagDiag = 0, pagItens = 0, POR_PAG = 50;\nvar ABAS_UI = [['diag', 'Diagnóstico'], ['itens', 'Itens'], ['familias', 'Famílias e notas'], ['parametros', 'Pesos e parâmetros'], ['unidades', 'Unidades e efetivo'], ['processos', 'Processos de compra']];\nvar R = { cod: 0, desc: 1, fam: 2, tipo: 3, classe: 4, nota: 5, dem: 6, fonte: 7, lt: 8, origem: 9, ss: 10, min: 11, max: 12, pos: 13, cob: 14, sit: 15, data: 16, sug: 17, just: 18 };\nvar SIT = {\n  'INICIAR COMPRA': ['Iniciar compra', 's-r'], 'RESERVA INSUFICIENTE': ['Reserva abaixo do necessário', 's-r'],\n  'EXCESSO': ['Acima do máximo', 's-a'], 'Dentro da faixa': ['OK', 's-g'], 'Sem reserva exigida': ['Sem reserva necessária', 's-c'],\n  'Sem demanda informada': ['Falta consumo', 's-c'], 'FAMÍLIA INEXISTENTE': ['Família inválida', 's-r']\n};\nfunction $(id) { return document.getElementById(id); }\nfunction esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); }\nfunction fmt(n) { return n === '' || n === null || n === undefined ? '' : (isNaN(n) ? esc(n) : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })); }\nfunction dt(s) { return !s ? '' : s === 'IMEDIATO' ? '<b class=\"num-r\">Agora</b>' : new Date(s + 'T12:00').toLocaleDateString('pt-BR'); }\nfunction quando(s) { return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'; }\n/** Nome curto do material: sem o código do catálogo e só até o primeiro \" - \". */\nfunction curto(d) { d = String(d || '').replace(/^\\d{6,9}\\s*-\\s*/, ''); var i = d.indexOf(' - '); d = i > 0 ? d.slice(0, i) : d; d = d.split(' › ').pop(); return d.length > 70 ? d.slice(0, 68) + '…' : d; }\nfunction chipClasse(c) { return c ? '<span class=\"chip c-' + esc(c) + '\">' + esc(c) + '</span>' : ''; }\nfunction chipSit(s) { var x = SIT[s] || [s, 's-c']; return s ? '<span class=\"chip ' + x[1] + '\">' + esc(x[0]) + '</span>' : ''; }\nfunction diasAte(s) { if (!s) return Infinity; if (s === 'IMEDIATO') return -1; return (new Date(s) - new Date()) / 864e5; }\n\nfunction chama(fn, args, ok, txt) {\n  ocupado(true, txt);\n  var r = google.script.run.withSuccessHandler(function (x) { ocupado(false); ok(x); })\n    .withFailureHandler(function (e) { ocupado(false); $('msg').innerHTML = '<div class=\"erro\">Erro: ' + esc(e.message) + '</div>'; });\n  r[fn].apply(r, args || []);\n}\nfunction ocupado(on, txt) {\n  ['btAtualizar', 'btLogin', 'btSalvar'].forEach(function (b) { $(b).disabled = on; });\n  if (on) $('msg').innerHTML = '<div class=\"aviso\">' + esc(txt || 'Processando…') + '</div>'; else if (!$('msg').querySelector('.erro')) $('msg').innerHTML = '';\n}\n\n/* ---------- carga ---------- */\nfunction mostrarEstado(e) {\n  $('estado').textContent = (e.acesso ? 'Conectado ao CPELOG como ' + e.usuario : 'Sem acesso ao CPELOG') + ' · dados de ' + quando(e.ultimoImport) + ' · ' + e.itens + ' itens';\n  $('lkPlanilha').href = $('lkProc').href = e.planilha; $('lkPlanilha').classList.toggle('oculto', !e.acesso);\n  $('btAtualizar').classList.toggle('oculto', !e.acesso);\n  $('login').classList.toggle('oculto', e.acesso); $('app').classList.toggle('oculto', !e.acesso);\n}\nfunction receber(d) {\n  D = d; alt = {}; mostrarEstado(d.estado); barra();\n  D.res = {}; d.resultados.linhas.forEach(function (r) { D.res[String(r.v[0])] = r.v; });\n  D.fam = {}; d.familias.linhas.forEach(function (r) { D.fam[r.v[0]] = { nome: r.v[1], tipo: r.v[2], classe: r.v[15], nota: r.v[14], lt: r.v[11] }; });\n  document.querySelectorAll('.selFam').forEach(function (s) {\n    var v = s.value; s.length = 1;\n    Object.keys(D.fam).sort().forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = id + ' · ' + D.fam[id].nome; s.appendChild(o); });\n    s.value = v;\n  });\n  render();\n}\nfunction iniciar() {\n  $('abas').innerHTML = ABAS_UI.map(function (a) { return '<div class=\"aba\" data-a=\"' + a[0] + '\">' + a[1] + '</div>'; }).join('');\n  $('abas').onclick = function (e) { var a = e.target.dataset.a; if (a) irPara(a); };\n  chama('estadoWeb', [], function (e) { mostrarEstado(e); if (e.acesso) chama('dadosWeb', [], receber, 'Carregando dados…'); }, 'Verificando acesso…');\n}\nfunction irPara(a, extra) { abaAtual = a; if (extra) extra(); render(); window.scrollTo(0, 0); }\n$('btLogin').onclick = function () {\n  chama('salvarAcesso', [$('lgUsuario').value, $('lgSenha').value], function (e) {\n    mostrarEstado(e); $('lgSenha').value = '';\n    chama('atualizarDoCpelog', [], receber, 'Importando todos os dados do CPELOG (cerca de 1 minuto)…');\n  }, 'Validando login…');\n};\n$('btAtualizar').onclick = function () { chama('atualizarDoCpelog', [], receber, 'Importando os dados do CPELOG e recalculando (cerca de 1 minuto)…'); };\n\n/* ---------- edição ---------- */\nfunction campo(aba, linha, col, valor, opts) {\n  opts = opts || {};\n  var k = aba + '|' + linha.l + '|' + (col + 1), v = alt[k] !== undefined ? alt[k] : valor;\n  var cls = (opts.padrao && alt[k] === undefined ? 'padrao' : '') + (alt[k] !== undefined ? ' mudou' : '');\n  var data = ' data-k=\"' + esc(k) + '\" data-o=\"' + esc(valor) + '\"' + (opts.dica ? ' title=\"' + esc(opts.dica) + '\"' : '');\n  if (opts.lista) return '<select class=\"' + cls + '\"' + data + '>' + opts.lista.map(function (o) { var val = o.v !== undefined ? o.v : o; return '<option value=\"' + esc(val) + '\"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(o.t || o) + '</option>'; }).join('') + '</select>';\n  return '<input class=\"' + cls + '\"' + data + ' value=\"' + esc(v) + '\" inputmode=\"decimal\">';\n}\ndocument.addEventListener('change', function (e) {\n  var el = e.target; if (!el.dataset || !el.dataset.k) return;\n  if (String(el.value) === String(el.dataset.o) && !el.classList.contains('padrao')) delete alt[el.dataset.k]; else alt[el.dataset.k] = el.value;\n  el.classList.remove('padrao'); el.classList.toggle('mudou', alt[el.dataset.k] !== undefined); barra();\n});\nfunction barra() { var n = Object.keys(alt).length; $('barra').classList.toggle('on', n > 0); $('nAlt').textContent = n + ' alteração(ões) não salva(s)'; }\n$('btDescartar').onclick = function () { alt = {}; barra(); render(); };\n$('btSalvar').onclick = function () {\n  var lista = Object.keys(alt).map(function (k) { var p = k.split('|'); return { aba: p[0], linha: Number(p[1]), coluna: Number(p[2]), valor: alt[k] }; });\n  chama('salvarAlteracoes', [lista], receber, 'Salvando e recalculando…');\n};\n\n/* ---------- diagnóstico ---------- */\nvar KPIS = [\n  { id: 'iniciar', nome: 'Iniciar compra agora', dica: 'Saldo já está no mínimo', f: function (x) { return x[R.sit] === 'INICIAR COMPRA'; }, c: 'num-r' },\n  { id: '90', nome: 'Iniciar compra em até 90 dias', dica: 'Data limite nos próximos 3 meses', f: function (x) { var d = diasAte(x[R.data]); return d >= 0 && d <= 90; }, c: 'num-a' },\n  { id: 'reserva', nome: 'Reserva técnica insuficiente', dica: 'Permanentes: estocado abaixo da reserva', f: function (x) { return x[R.sit] === 'RESERVA INSUFICIENTE'; }, c: 'num-r' },\n  { id: 'excesso', nome: 'Acima do máximo', dica: 'Estoque maior que o teto calculado', f: function (x) { return x[R.sit] === 'EXCESSO'; }, c: 'num-a' },\n  { id: 'ok', nome: 'Dentro da faixa', dica: 'Entre o mínimo e o máximo', f: function (x) { return x[R.sit] === 'Dentro da faixa'; }, c: '' },\n  { id: 'sem', nome: 'Falta consumo', dica: 'Informe taxa ou consumo histórico', f: function (x) { return x[R.sit] === 'Sem demanda informada'; }, c: '' }\n];\nfunction resultados() {\n  var cl = $('fClasse').value, tp = $('fTipo').value;\n  return D.resultados.linhas.map(function (r) { return r.v; }).filter(function (x) { return (!cl || x[R.classe] === cl) && (!tp || x[R.tipo] === tp); });\n}\nfunction renderPassos() {\n  var C = D.col;\n  var uni = D.unidades.linhas, comEf = uni.filter(function (r) { return Number(r.v[2]) > 0; }).length;\n  var cons = D.resultados.linhas.filter(function (r) { return r.v[R.tipo] === 'CONSUMO'; });\n  var comDem = cons.filter(function (r) { return Number(r.v[R.dem]) > 0; }).length;\n  var prazoReal = D.itens.linhas.filter(function (r) { return [C.FASE_INTERNA, C.LICITACAO, C.CONTRATACAO, C.ENTREGA].some(function (k) { return r.p.indexOf(k) < 0 && r.v[k] !== ''; }) || String(r.v[C.ATA]).toUpperCase() === 'S'; }).length;\n  var proc = D.processos.linhas.filter(function (r) { return !/^EX/i.test(String(r.v[0])); }).length;\n  var passos = [\n    { t: 'Efetivo das unidades', v: comEf, de: uni.length, txt: 'Nº de policiais por UEOp. Necessário para itens consumidos por policial.', ir: 'unidades' },\n    { t: 'Itens de consumo com consumo', v: comDem, de: cons.length, txt: 'Taxa por policial/viatura/fração ou consumo histórico mensal.', ir: 'itens', extra: function () { $('iFalta').value = 'consumo'; $('iTipo').value = 'CONSUMO'; } },\n    { t: 'Itens com prazo real ou ata', v: prazoReal, de: D.itens.linhas.length, txt: 'Os demais usam o prazo padrão da família (em cinza).', ir: 'itens', extra: function () { $('iFalta').value = 'prazo'; } },\n    { t: 'Processos de compra registrados', v: proc, de: null, txt: 'Com histórico, o prazo médio real substitui o padrão.', ir: 'processos' }\n  ];\n  $('passos').innerHTML = passos.map(function (p, i) {\n    var pct = p.de ? Math.round(p.v / p.de * 100) : (p.v ? 100 : 0);\n    return '<div class=\"passo ' + (pct < 100 ? 'falta' : '') + '\"><div class=\"mut\">' + esc(p.t) + '</div><b>' + fmt(p.v) + '</b>' + (p.de ? ' <span class=\"mut\">de ' + fmt(p.de) + '</span>' : '') +\n      '<div class=\"prog\"><i style=\"width:' + pct + '%\"></i></div><div class=\"mut\">' + esc(p.txt) + '</div><div style=\"margin-top:6px\"><a href=\"#\" data-passo=\"' + i + '\">Preencher →</a></div></div>';\n  }).join('');\n  $('passos').onclick = function (e) { var i = e.target.dataset.passo; if (i === undefined) return; e.preventDefault(); irPara(passos[i].ir, passos[i].extra); };\n}\nfunction renderKpis(base) {\n  $('kpis').innerHTML = KPIS.map(function (k) { var n = base.filter(k.f).length; return '<div class=\"kpi ' + (filtro.kpi === k.id ? 'on ' : '') + (n ? '' : 'zero') + '\" data-id=\"' + k.id + '\" title=\"' + esc(k.dica) + '\"><b class=\"' + k.c + '\">' + fmt(n) + '</b>' + esc(k.nome) + '<div class=\"mut\">' + esc(k.dica) + '</div></div>'; }).join('');\n}\nfunction renderFam(base) {\n  var g = {};\n  base.forEach(function (x) {\n    var f = g[x[R.fam]] || (g[x[R.fam]] = { n: 0, agora: 0, d90: 0, res: 0, exc: 0, sem: 0, ok: 0 });\n    f.n++; if (x[R.sit] === 'INICIAR COMPRA') f.agora++; var d = diasAte(x[R.data]); if (d >= 0 && d <= 90) f.d90++;\n    if (x[R.sit] === 'RESERVA INSUFICIENTE') f.res++; if (x[R.sit] === 'EXCESSO') f.exc++; if (x[R.sit] === 'Sem demanda informada') f.sem++; if (x[R.sit] === 'Dentro da faixa') f.ok++;\n  });\n  var ordem = { Operacional: 0, Funcional: 1, Administrativo: 2 };\n  var ids = Object.keys(g).sort(function (a, b) { var fa = D.fam[a] || {}, fb = D.fam[b] || {}; return (ordem[fa.classe] - ordem[fb.classe]) || (g[b].agora + g[b].res - g[a].agora - g[a].res) || (a > b ? 1 : -1); });\n  function n(v, c) { return v ? '<span class=\"' + (c || '') + '\">' + fmt(v) + '</span>' : '<span class=\"mut\">–</span>'; }\n  $('tFam').innerHTML = '<thead><tr><th>Família</th><th>Classe</th><th class=\"n\">Nota</th><th class=\"n\">Itens</th><th class=\"n\">Comprar agora</th><th class=\"n\">Em até 90 dias</th><th class=\"n\">Reserva insuf.</th><th class=\"n\">Acima do máx.</th><th class=\"n\">OK</th><th class=\"n\">Falta consumo</th><th class=\"n\">Prazo padrão (dias)</th></tr></thead><tbody>' +\n    ids.map(function (id) {\n      var f = D.fam[id] || {}, x = g[id];\n      return '<tr class=\"clic ' + (filtro.fam === id ? 'sel' : '') + '\" data-fam=\"' + esc(id) + '\"><td><span class=\"nome\">' + esc(f.nome || id) + '</span> <span class=\"cod\">' + esc(id) + '</span></td><td>' + chipClasse(f.classe) + '</td><td class=\"n\">' + fmt(f.nota) + '</td><td class=\"n\">' + fmt(x.n) + '</td>' +\n        '<td class=\"n\">' + n(x.agora, 'num-r') + '</td><td class=\"n\">' + n(x.d90, 'num-a') + '</td><td class=\"n\">' + n(x.res, 'num-r') + '</td><td class=\"n\">' + n(x.exc, 'num-a') + '</td><td class=\"n\">' + n(x.ok) + '</td><td class=\"n\">' + n(x.sem) + '</td><td class=\"n\">' + fmt(f.lt) + '</td></tr>';\n    }).join('') + '</tbody>';\n}\nfunction renderItensDiag(base) {\n  var q = $('fBusca').value.toLowerCase(), k = KPIS.filter(function (k) { return k.id === filtro.kpi; })[0];\n  var lista = base.filter(function (x) { return (!filtro.fam || x[R.fam] === filtro.fam) && (!k || k.f(x)) && (!q || (x[R.desc] + ' ' + x[R.cod]).toLowerCase().indexOf(q) >= 0); });\n  lista.sort(function (a, b) { return diasAte(a[R.data]) - diasAte(b[R.data]) || ((SIT[a[R.sit]] || [])[1] === 's-r' ? -1 : 0) - ((SIT[b[R.sit]] || [])[1] === 's-r' ? -1 : 0) || (b[R.nota] - a[R.nota]); });\n  var partes = [];\n  if (filtro.fam) partes.push((D.fam[filtro.fam] || {}).nome || filtro.fam);\n  if (k) partes.push(k.nome.toLowerCase());\n  $('tituloItens').textContent = '4. Itens' + (partes.length ? ': ' + partes.join(' · ') : '') + ' (' + fmt(lista.length) + ')';\n  var tot = lista.length; pagDiag = Math.min(pagDiag, Math.max(Math.ceil(tot / POR_PAG) - 1, 0));\n  var pg = lista.slice(pagDiag * POR_PAG, (pagDiag + 1) * POR_PAG);\n  $('tItensDiag').innerHTML = '<thead><tr><th>Item</th><th>Situação</th><th>Iniciar compra até</th><th class=\"n\">Consumo/mês</th><th class=\"n\">Prazo (dias)</th><th class=\"n\">Saldo</th><th class=\"n\">Mínimo</th><th class=\"n\">Máximo</th><th class=\"n\">Comprar</th><th>Por quê</th></tr></thead><tbody>' +\n    pg.map(function (x) {\n      var perm = x[R.tipo] === 'PERMANENTE';\n      return '<tr><td title=\"' + esc(x[R.desc]) + '\"><div class=\"nome\">' + esc(curto(x[R.desc])) + '</div><div class=\"sub\">' + esc(x[R.cod]) + ' · ' + chipClasse(x[R.classe]) + '</div></td>' +\n        '<td>' + chipSit(x[R.sit]) + '</td><td>' + dt(x[R.data]) + '</td><td class=\"n\">' + (perm ? '<span class=\"mut\">–</span>' : fmt(x[R.dem])) + '</td><td class=\"n\">' + fmt(x[R.lt]) + '</td>' +\n        '<td class=\"n\">' + fmt(x[R.pos]) + '</td><td class=\"n\">' + fmt(x[R.min]) + (perm ? ' <span class=\"mut\">(reserva)</span>' : '') + '</td><td class=\"n\">' + fmt(x[R.max]) + '</td><td class=\"n\">' + (Number(x[R.sug]) > 0 && /INICIAR|RESERVA/.test(x[R.sit]) ? '<b>' + fmt(x[R.sug]) + '</b>' : '<span class=\"mut\">–</span>') + '</td>' +\n        '<td><details><summary>ver</summary><p>' + esc(x[R.just]) + '</p></details></td></tr>';\n    }).join('') + '</tbody>';\n  paginar('pagDiag', tot, pagDiag, function (p) { pagDiag = p; renderDiag(); });\n}\nfunction paginar(id, tot, pag, ir) {\n  var np = Math.max(Math.ceil(tot / POR_PAG), 1);\n  $(id).innerHTML = 'Página ' + (pag + 1) + ' de ' + np + ' ' + (pag > 0 ? '<button class=\"sec\" data-p=\"' + (pag - 1) + '\">‹ anterior</button>' : '') + (pag < np - 1 ? '<button class=\"sec\" data-p=\"' + (pag + 1) + '\">próxima ›</button>' : '');\n  $(id).onclick = function (e) { if (e.target.dataset.p !== undefined) { ir(Number(e.target.dataset.p)); } };\n}\nfunction renderDiag() { var base = resultados(); renderPassos(); renderKpis(base); renderFam(base); renderItensDiag(base); }\n$('kpis').onclick = function (e) { var el = e.target.closest('.kpi'); if (!el) return; filtro.kpi = filtro.kpi === el.dataset.id ? null : el.dataset.id; pagDiag = 0; renderDiag(); };\n$('tFam').onclick = function (e) { var tr = e.target.closest('tr[data-fam]'); if (!tr) return; filtro.fam = filtro.fam === tr.dataset.fam ? null : tr.dataset.fam; pagDiag = 0; renderDiag(); $('blItens').scrollIntoView({ behavior: 'smooth' }); };\n$('btLimpar').onclick = function () { filtro = { kpi: null, fam: null }; $('fBusca').value = ''; $('fClasse').value = ''; $('fTipo').value = ''; pagDiag = 0; renderDiag(); };\n['fClasse', 'fTipo'].forEach(function (id) { $(id).onchange = function () { pagDiag = 0; renderDiag(); }; });\n$('fBusca').oninput = function () { pagDiag = 0; renderItensDiag(resultados()); };\n\n/* ---------- itens (edição) ---------- */\nvar BASES = [{ v: 'POLICIAL', t: 'Por policial' }, { v: 'VIATURA', t: 'Por viatura' }, { v: 'UNIDADE', t: 'Por fração' }, { v: 'HISTORICO', t: 'Histórico' }];\nfunction renderItens() {\n  var C = D.col, fa = $('iFamilia').value, tp = $('iTipo').value, falta = $('iFalta').value, q = $('iBusca').value.toLowerCase();\n  var lista = D.itens.linhas.filter(function (r) {\n    var v = r.v, res = D.res[String(v[C.CODIGO])] || [];\n    if (falta === 'consumo' && !(v[C.TIPO] === 'CONSUMO' && !(Number(res[R.dem]) > 0))) return false;\n    if (falta === 'prazo' && r.p.indexOf(C.LICITACAO) < 0) return false;\n    return (!fa || v[C.FAMILIA] === fa) && (!tp || v[C.TIPO] === tp) && (!q || (v[C.DESCRICAO] + ' ' + v[C.CODIGO]).toLowerCase().indexOf(q) >= 0);\n  });\n  var tot = lista.length; pagItens = Math.min(pagItens, Math.max(Math.ceil(tot / POR_PAG) - 1, 0));\n  lista = lista.slice(pagItens * POR_PAG, (pagItens + 1) * POR_PAG);\n  $('tItens').innerHTML = '<thead><tr class=\"grupo\"><th class=\"fixa\"></th><th colspan=\"3\"></th><th colspan=\"4\">Consumo</th><th colspan=\"3\">Compra</th><th colspan=\"5\">Prazo do processo (dias)</th><th colspan=\"2\">Resultado</th></tr>' +\n    '<tr><th class=\"fixa\">Item</th><th>Família</th><th class=\"n\">Saldo</th><th class=\"n\">Parque</th><th>Base</th><th>Taxa/mês</th><th>Histórico/mês</th><th>Desvio</th><th>Em trânsito</th><th>Ata vigente</th><th>Prazo da ata</th><th>Fase interna</th><th>Licitação</th><th>Contratação</th><th>Entrega</th><th>Distribuição</th><th>Situação</th><th class=\"n\">Mínimo</th></tr></thead><tbody>' +\n    lista.map(function (r) {\n      var v = r.v, perm = v[C.TIPO] === 'PERMANENTE', res = D.res[String(v[C.CODIGO])] || [];\n      function f(col, o) { o = o || {}; o.padrao = r.p.indexOf(col) >= 0; return '<td>' + campo('ITENS', r, col, v[col], o) + '</td>'; }\n      var nada = '<td class=\"mut\">–</td>';\n      return '<tr><td class=\"fixa\" title=\"' + esc(v[C.DESCRICAO]) + '\"><div class=\"nome\">' + esc(curto(v[C.DESCRICAO])) + '</div><div class=\"sub\">' + esc(v[C.CODIGO]) + ' · ' + (perm ? 'Permanente' : 'Consumo') + '</div></td>' +\n        f(C.FAMILIA, { lista: Object.keys(D.fam).sort().map(function (id) { return { v: id, t: id + ' · ' + D.fam[id].nome }; }) }) +\n        '<td class=\"n\">' + fmt(v[C.SALDO]) + '</td><td class=\"n\">' + (perm ? fmt(v[C.PARQUE]) : '<span class=\"mut\">–</span>') + '</td>' +\n        (perm ? nada + nada + nada + nada : f(C.BASE, { lista: BASES }) + f(C.TAXA, { dica: 'Unidades consumidas por mês para cada policial, viatura ou fração' }) + f(C.HIST, { dica: 'Consumo médio mensal observado' }) + f(C.DESVIO, { dica: 'Desvio padrão do consumo mensal (opcional)' })) +\n        f(C.TRANSITO) + f(C.ATA, { lista: [{ v: '', t: '—' }, { v: 'S', t: 'Sim' }, { v: 'N', t: 'Não' }] }) + f(C.PRAZO_ATA) +\n        f(C.FASE_INTERNA, { dica: 'Da demanda à abertura do processo' }) + f(C.LICITACAO, { dica: 'Da abertura à homologação' }) + f(C.CONTRATACAO, { dica: 'Da homologação ao empenho' }) + f(C.ENTREGA, { dica: 'Do empenho à entrega no almoxarifado' }) + f(C.DISTRIBUICAO, { dica: 'Do almoxarifado à ponta' }) +\n        '<td>' + chipSit(res[R.sit]) + '</td><td class=\"n\">' + fmt(res[R.min]) + '</td></tr>';\n    }).join('') + '</tbody>';\n  paginar('pagItens', tot, pagItens, function (p) { pagItens = p; renderItens(); });\n}\n['iFamilia', 'iTipo', 'iFalta'].forEach(function (id) { $(id).onchange = function () { pagItens = 0; renderItens(); }; });\n$('iBusca').oninput = function () { pagItens = 0; renderItens(); };\n\n/* ---------- tabelas de configuração ---------- */\nvar NOTA = ['', 1, 2, 3, 4, 5];\nfunction renderTabela(id, aba, t, cols) {\n  // cols: [{i, t, edit, lista, n}] - colunas a mostrar, na ordem\n  $(id).innerHTML = '<thead><tr>' + cols.map(function (c) { return '<th' + (c.n ? ' class=\"n\"' : '') + '>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' + t.linhas.map(function (r) {\n    return '<tr>' + cols.map(function (c) {\n      var x = r.v[c.i];\n      if (c.edit) return '<td>' + campo(aba, r, c.i, x, { lista: c.lista }) + '</td>';\n      if (c.fmt) return '<td>' + c.fmt(x, r.v) + '</td>';\n      return '<td class=\"' + (c.n ? 'n' : '') + (c.mut ? ' mut' : '') + '\">' + (c.n ? fmt(x) : esc(x)) + '</td>';\n    }).join('') + '</tr>';\n  }).join('') + '</tbody>';\n}\nfunction render() {\n  if (!D) return;\n  document.querySelectorAll('.aba').forEach(function (a) { a.classList.toggle('on', a.dataset.a === abaAtual); });\n  document.querySelectorAll('section[data-aba]').forEach(function (s) { s.classList.toggle('oculto', s.dataset.aba !== abaAtual); });\n  if (abaAtual === 'diag') renderDiag();\n  if (abaAtual === 'itens') renderItens();\n  if (abaAtual === 'familias') renderTabela('tFamilias', 'FAMILIAS', D.familias, [\n    { i: 0, t: 'ID' }, { i: 1, t: 'Família', fmt: function (x, v) { return '<div class=\"nome\">' + esc(x) + '</div><div class=\"sub\">' + esc(v[3]) + '</div>'; } }, { i: 2, t: 'Tipo', mut: true },\n    { i: 4, t: 'Essencialidade', edit: true, lista: NOTA }, { i: 5, t: 'Risco à segurança', edit: true, lista: NOTA }, { i: 6, t: 'Substituição', edit: true, lista: NOTA },\n    { i: 7, t: 'Controle', edit: true, lista: NOTA }, { i: 8, t: 'Variabilidade', edit: true, lista: NOTA }, { i: 9, t: 'Duração reposição', edit: true, lista: NOTA },\n    { i: 10, t: 'Incerteza reposição', edit: true, lista: NOTA }, { i: 11, t: 'Prazo padrão (dias)', edit: true }, { i: 12, t: 'Base padrão', edit: true, lista: [{ v: '', t: '—' }].concat(BASES) },\n    { i: 13, t: 'Indisp. anual (perm.)', edit: true }, { i: 14, t: 'Nota', n: true }, { i: 15, t: 'Classe', fmt: function (x) { return chipClasse(x); } }]);\n  if (abaAtual === 'parametros') renderTabela('tParametros', 'PARAMETROS', D.parametros, [{ i: 0, t: 'Parâmetro', mut: true }, { i: 1, t: 'Valor', edit: true }, { i: 2, t: 'O que é' }]);\n  if (abaAtual === 'unidades') renderTabela('tUnidades', 'UNIDADES', D.unidades, [{ i: 0, t: 'UEOp' }, { i: 2, t: 'Policiais (efetivo)', edit: true }, { i: 3, t: 'Viaturas', edit: true }, { i: 4, t: 'Frações', edit: true }, { i: 5, t: 'Considerar', edit: true, lista: [{ v: 'S', t: 'Sim' }, { v: 'N', t: 'Não' }] }]);\n  if (abaAtual === 'processos') renderTabela('tProcessos', 'PROCESSOS', D.processos, [{ i: 0, t: 'Processo' }, { i: 1, t: 'Código do item', edit: true }, { i: 2, t: 'Família', edit: true },\n    { i: 3, t: 'Demanda', edit: true }, { i: 4, t: 'Abertura', edit: true }, { i: 5, t: 'Homologação', edit: true }, { i: 6, t: 'Empenho', edit: true }, { i: 7, t: 'Entrega', edit: true },\n    { i: 8, t: 'Fase interna', n: true }, { i: 9, t: 'Licitação', n: true }, { i: 10, t: 'Contratação', n: true }, { i: 11, t: 'Entrega', n: true }, { i: 12, t: 'Total (dias)', n: true }]);\n}\niniciar();\n</script>\n</body>\n</html>\n";
