# Conferência das melhorias — outubro/2026

Conferência automatizada executada antes da entrega (versão `2026-10-10`).

## 1. Cálculos validados preservados
Os campos de cálculo de cada ordem (35 ordens × 37 campos: bases, recalculados, diferenças, líquido, regras, chave do RAD) foram gravados
**antes** das alterações e comparados **depois**: **idênticos**.

## 2. Totais × rodapé oficial do RAD (Ticket Log)
Rodapés lidos de forma independente do painel (script próprio) e comparados com: soma das ordens, quadros NF-e/NFS-e, cards, gráfico
"Total por tributo" (valor e nº de NFs distintas) e "Valor por alíquota" (soma de cada tributo).

| RAD | ICMS desonerado | IRRF Peça | ISSQN retido | IRRF Serviço | Aprovado | Líquido | Taxa adm. | Resultado |
|---|---|---|---|---|---|---|---|---|
| 09/2026-2 BPMAMB (27 OS) | 5.337,35 | 375,66 | 326,53 | 532,73 | 98.725,95 | 92.153,68 | 7.799,35 | ✓ |
| 09/2026-2 BPGD (4 OS) | 320,00 | 21,33 | 117,06 | 0,00 | 10.519,99 | 10.061,60 | 831,07 | ✓ |
| 09/2026-1 BPGD (teste) | 320,00 | 21,33 | 117,06 | 0,00 | 10.519,99 | 10.061,60 | 831,07 | ✓ |

Resultado: **186 conferências, 0 falhas** (inclui Status de Pagamento, consulta, ficha do RAD, exportação e permissões).

Com o arquivo **UNIAO RAD 2ª quinzena/set** (81 ordens; BPGD, BPMAMB e BPMRV): totais, nº de NFs distintas por tributo e
ISSQN por alíquota de cada unidade conferidos com somas feitas fora do painel — **66 conferências, 0 falhas**. O BPMAMB e o BPGD do UNIAO
coincidem com os rodapés dos RADs originais.

## 3. Pendências
Teste com um RAD adulterado (IRRF Peça de uma NF alterado de 21,33 para 25,00): o painel apontou **RAD 09/2026-2 · BPGD · OS 21194602 ·
NF 298849 · IRRF Peça** — RAD R$ 25,00 × recalculado R$ 21,38 (base 1.781,45 × 1,2%), o reflexo no valor líquido e a divergência com o rodapé.
Nos RADs reais: nenhuma pendência.

## 4. Permissões do Status de Pagamento
SOFI altera (A PAGAR/PAGO + data); Frota/P4 e Almoxarifado só consultam — testado na tela e no servidor (o servidor recusa a alteração).
