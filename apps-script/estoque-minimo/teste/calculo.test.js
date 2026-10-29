// Testes do motor de cálculo fora do Google: node apps-script/estoque-minimo/teste/calculo.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const vm = require('vm');
const ctx = { module: { exports: {} }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'Configuracao.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'Calculo.gs'), 'utf8'), ctx);
const C = ctx.module.exports;
const p = vm.runInContext('lerParametros_(PARAMETROS_PADRAO)', ctx);
const fam = Object.fromEntries(vm.runInContext('FAMILIAS_PADRAO', ctx).map(r => [r[0], { id: r[0], tipo: r[2], ESS: r[4], SEG: r[5], SUB: r[6], CTL: r[7], VAR: r[8], TR: r[9], TRV: r[10], leadTimeDias: r[11], base: r[12], taxaIndisponibilidade: r[13] }]));
const hoje = new Date('2026-10-29T12:00:00');
const ef = { policiais: 200, viaturas: 25, unidades: 2 };

// Prazo -> nota
assert.strictEqual(C.notaPorPrazo(25, p.faixasPrazo), 1);
assert.strictEqual(C.notaPorPrazo(150, p.faixasPrazo), 4);
assert.strictEqual(C.notaPorPrazo(400, p.faixasPrazo), 5);

// Processos: média e desvio por família
const est = C.estatisticaProcessos([{ familia: 'C43', dias: 172 }, { familia: 'C43', dias: 137 }]);
assert.strictEqual(est.C43.n, 2); assert.strictEqual(est.C43.media, 154.5);

// Papel toalha: 0,5 pacote/policial/mês x 200 policiais = 100/mês; prazo = média dos processos + 7 dias
const papel = { codigo: 'EX-001', familia: 'C43', base: 'POLICIAL', taxa: 0.5, consumoHistorico: 110, desvioHistorico: 20, saldo: 300, emTransito: 0, fases: { distribuicao: 7 }, fasesReais: {} };
const r1 = C.calcularItem(papel, fam.C43, ef, est, p, hoje);
assert.strictEqual(r1.demanda, 100);
assert.strictEqual(Math.round(r1.leadTime), 162);
assert.ok(Math.abs(r1.divergencia - 0.1) < 1e-9);
// mínimo = d*LT + z*sqrt(LT*σ² + (d*σLT)²); LT em meses
const ltM = 161.5 / 30.4, sLt = est.C43.desvio / 30.4, z = p.classes[r1.classe].z;
assert.strictEqual(r1.minimo, Math.ceil(100 * ltM + z * Math.sqrt(ltM * 400 + Math.pow(100 * sLt, 2))));
assert.strictEqual(r1.status, 'INICIAR COMPRA');
assert.strictEqual(r1.dataLimite, null);

// Pneu com ata vigente: prazo cai para o da ata
const pneu = { codigo: 'EX-002', familia: 'C13', base: 'VIATURA', taxa: 0.15, saldo: 12, ataVigente: true, prazoAta: 30, fases: { distribuicao: 10 }, fasesReais: {} };
const r2 = C.calcularItem(pneu, fam.C13, ef, {}, p, hoje);
assert.strictEqual(r2.leadTime, 40);
assert.strictEqual(r2.origemLeadTime, 'ata de registro de preços');
assert.strictEqual(r2.classe, 'Operacional');
assert.ok(Object.prototype.toString.call(r2.dataLimite) === '[object Date]' && r2.dataLimite > hoje, 'saldo acima do mínimo gera data futura');

// Essencialidade 5 força Operacional mesmo com nota baixa
const c = C.criticidade({ ESS: 5, SEG: 1, SUB: 1, CTL: 1, VAR: 1, TR: 1, TRV: 1 }, p.pesos, p);
assert.strictEqual(c.classe, 'Operacional');

// Permanente: reserva técnica
const radio = { codigo: 'EX-003', familia: 'P07', parque: 200, saldo: 4, taxaIndisponibilidade: 0.10, fases: { distribuicao: 15 }, fasesReais: {} };
const r3 = C.calcularItem(radio, fam.P07, ef, {}, p, hoje);
assert.strictEqual(r3.minimo, Math.round(200 * 0.10 * (375 / 365) * 1.5));
assert.strictEqual(r3.status, 'RESERVA INSUFICIENTE');

// Fases: padrão do sistema x valores reais digitados
const fp = C.fasesPadrao(180, { interna: 0.2, licitacao: 0.45, contratacao: 0.1, entrega: 0.25 }, 10);
assert.deepStrictEqual(JSON.parse(JSON.stringify(fp)), { interna: 36, licitacao: 81, contratacao: 18, entrega: 45, distribuicao: 10 });
const ltPadrao = C.tempoReposicao({ fases: fp, fasesReais: {} }, fam.C43, est.C43);
assert.strictEqual(ltPadrao.origem, 'histórico de 2 processo(s)', 'histórico vence o padrão do sistema');
const ltReal = C.tempoReposicao({ fases: Object.assign({}, fp, { licitacao: 150 }), fasesReais: { licitacao: true } }, fam.C43, est.C43);
assert.strictEqual(ltReal.dias, 36 + 150 + 18 + 45 + 10); assert.strictEqual(ltReal.origem, 'fases informadas no item');
assert.strictEqual(C.tempoReposicao({ fases: fp, fasesReais: {} }, fam.C43, null).origem, 'padrão do sistema');

// Sem dado de consumo
const r4 = C.calcularItem({ codigo: 'X', familia: 'C42', base: 'HISTORICO' }, fam.C42, ef, {}, p, hoje);
assert.strictEqual(r4.status, 'Sem demanda informada');

console.log('ok - todos os testes passaram');
console.log(JSON.stringify({ papel: [r1.classe, r1.minimo, r1.maximo, r1.justificativa], pneu: [r2.minimo, r2.maximo, r2.dataLimite.toISOString().slice(0, 10)], radio: r3.justificativa }, null, 1));
