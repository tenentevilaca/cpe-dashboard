# Regras fiscais do painel (orientações do CPE)

Base de conhecimento do painel. Toda orientação nova do CPE entra aqui **e** em `REGRAS_FISCAIS` no `Index.html`
(função `conferirRegras`), que confere cada ordem do RAD e mostra o resultado na coluna **Regras fiscais**
e nos filtros de Situação **Fora das regras fiscais** / **Regras: verificar**.

## Nota fiscal de PEÇA
- Pode ter **IRRF de peça** e **desoneração de ICMS**, só quando a empresa **não** é optante pelo Simples.
- **Não tem tomador** nem ISSQN. O filtro "Responsável ISSQN" nunca traz notas de peça.

## Nota fiscal de SERVIÇO
- Pode ter **IRRF de serviço**, só quando a empresa **não** é optante pelo Simples.
- Tem **ISSQN**. O responsável (**prestador** ou **tomador**) depende da legislação do município e vem na NF de serviço.
- Se o responsável for o **tomador**, pode haver **ou não** retenção ("Tomador · com retenção" / "sem retenção").
- Tomadores e prestadores são contados por **CNPJ distinto**.

## Como o painel aplica
| Regra | Nível |
|---|---|
| ICMS desonerado, IRRF de peça ou IRRF de serviço em empresa do Simples | erro |
| ISSQN/tomador informado em ordem sem NF de serviço | erro |
| ICMS/IRRF de peça em ordem sem NF de peça | erro |
| Empresa fora do Simples sem IRRF de peça / sem desoneração de ICMS / sem IRRF de serviço | aviso (verificar) |
| NF de serviço sem responsável ISSQN informado | aviso (verificar) |
| ISSQN informado como retido com responsável Prestador | aviso (verificar) |
| Soma das ordens de um arquivo ≠ rodapé do RAD (Ticket Log) | erro (pendência "Rodapé do RAD") |

## Definições usadas nos quadros e gráficos (validadas com a base Ticket Log — set/2026)
- **ICMS desonerado**: coluna "Valor ICMS Deduzido" do RAD. **Não é retenção na fonte**: aparece separado e fora do total das retenções.
- **ISSQN retido**: coluna "Valor ISSQN Retido" do RAD (igual ao rodapé da Ticket Log).
- **Retenções efetivas** = IRRF Peça + IRRF Serviço + ISSQN retido.
- **Valor total movimentado** = Valor Total Aprovado do RAD.
- **NFs distintas**: CNPJ + tipo (NF-e peça / NFS-e serviço) + número; a mesma NF em várias OS conta uma vez.
- Os cálculos de conferência (base × alíquota, líquido) não foram alterados; tolerância de arredondamento R$ 0,05.

## Status de Pagamento dos RADs
- Registrado **somente pela SOFI** (A PAGAR / PAGO + data efetiva do pagamento). A Frota/P4 e o Almoxarifado consultam.
- O simples envio do RAD à SOFI não é pagamento: isso é a **Etapa de tramitação** (Frota/P4 → Almoxarifado → SOFI), campo separado.
- Nº do título e NF da Ticket Log: informados pela SOFI ou Frota/P4 (não constam no RAD exportado).

## RADs
- Fonte única: pasta `PASTA_FONTES` do Drive (com subpastas), junto com as notas em PDF. Subpastas no padrão "RAD MMAAAA-Q".
- Período: cabeçalho do RAD → nome da subpasta ("RAD 052026-1" = maio/2026, 1ª quinzena) → data de aprovação.
- O quadro "📂 Arquivos lidos da pasta" mostra, arquivo a arquivo, o que foi computado, duplicado ou com erro.
- RAD duplicado pelo **conteúdo** (mesma Unidade, período, ordens e valores) é desconsiderado.
- Arquivos "UNIAO RAD" são ignorados.
