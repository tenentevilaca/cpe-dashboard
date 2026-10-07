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

## RADs
- Fonte única: pasta `PASTA_FONTES` do Drive (com subpastas), junto com as notas em PDF. Subpastas no padrão "RAD MMAAAA-Q".
- Período: cabeçalho do RAD → nome da subpasta ("RAD 052026-1" = maio/2026, 1ª quinzena) → data de aprovação.
- O quadro "📂 Arquivos lidos da pasta" mostra, arquivo a arquivo, o que foi computado, duplicado ou com erro.
- RAD duplicado pelo **conteúdo** (mesma Unidade, período, ordens e valores) é desconsiderado.
- Arquivos "UNIAO RAD" são ignorados.
