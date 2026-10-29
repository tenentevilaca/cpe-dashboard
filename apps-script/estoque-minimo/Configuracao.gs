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
