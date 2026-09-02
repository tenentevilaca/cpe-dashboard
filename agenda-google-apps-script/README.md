# 🗓️ Agenda de Tarefas — CPE 2026

Agenda com farol de prazo, rodando 100% no Google (Google Sheets + Google Apps Script), sem depender do Render.

## ⚡ Setup Rápido (3 passos)

### PASSO 1️⃣ — Cria a planilha

1. Acesse https://sheets.new — isso cria uma planilha Google nova
2. Renomeie para `Agenda CPE 2026` (opcional)

### PASSO 2️⃣ — Cola o código no Apps Script

1. Na planilha, vá em **Extensões → Apps Script**
2. Apague o conteúdo do arquivo `Código.gs` que abrir e cole o conteúdo de `Code.gs` deste repositório
3. Clique no ícone **+** ao lado de "Arquivos" → **HTML** → nomeie exatamente `Index` → cole o conteúdo de `Index.html` deste repositório
4. Clique no ícone de engrenagem **⚙️ Configurações do projeto** → marque **"Mostrar arquivo de manifesto 'appsscript.json' no editor"**
5. Abra o arquivo `appsscript.json` que aparecer e substitua o conteúdo pelo `appsscript.json` deste repositório
6. Salve o projeto (ícone de disquete ou Ctrl+S)

### PASSO 3️⃣ — Publica como Web App

1. Clique em **Implantar → Nova implantação**
2. Clique no ícone de engrenagem ao lado de "Selecionar tipo" → **App da Web**
3. Em "Executar como": **Eu (sua conta)**
4. Em "Quem pode acessar": escolha **"Qualquer pessoa"** (link público, requer login Google — obrigatório pra tela inicial reconhecer quem está entrando) ou **"Qualquer pessoa na [seu domínio]"** se quiser restringir à sua organização
5. Clique em **Implantar** → autorize as permissões pedidas (é o próprio script acessando a planilha, mandando e-mail e identificando quem está logado)
6. Copie a **URL do app da Web** gerada — é o link da agenda

### PASSO 4️⃣ — Configura você como dono (obrigatório)

1. No editor do Apps Script, **Configurações do projeto ⚙️ → Script Properties** → adicione:

   | Propriedade | Valor |
   |---|---|
   | `OWNER_EMAIL` | o e-mail da sua conta Google (a mesma que você usa pra abrir a planilha), ex: `voce@gmail.com` |

2. Sem isso, ninguém — nem você — consegue entrar na Agenda (o sistema não saberia quem é o dono).

**Pronto!** ✅ Cada lançamento, conclusão ou exclusão de tarefa grava direto numa aba `Agenda` criada automaticamente na planilha.

---

## 🔐 Tela inicial e controle de acesso

Ao abrir o link, aparece primeiro uma tela com o escudo do CPE e um card **"Agenda de Tarefas"**. Não existe usuário/senha digitados — o acesso é controlado pela própria **conta Google** de quem abriu o link (o Apps Script não tem como guardar senha com segurança, então reaproveitar o login do Google é a forma correta e simples de fazer isso).

- **Você (dono)**, configurado via `OWNER_EMAIL`, sempre entra direto ao clicar no card
- **Qualquer outra conta Google**, ao clicar no card pela primeira vez, vê um formulário de **"Solicitar acesso"** (nome + motivo opcional)
- Isso dispara um **e-mail automático pra você**, com um link de aprovação — o link só funciona se você abrir logado com a mesma conta do `OWNER_EMAIL`
- Depois de aprovado, a pessoa clica no card de novo e já entra direto — não precisa reenviar nada
- Todos os pedidos (pendentes e aprovados) ficam registrados numa aba `Acesso`, criada automaticamente na planilha — dá pra ver e editar manualmente por lá também, se precisar

---

## 🎯 Como usar

- **Lançar tarefa:** preencha Tarefa, Responsável, Data de Início e o número de dias de Prazo (ex: 30) — a data final é calculada automaticamente somando os dias à data de início — marque ou desmarque "🔔 Avisar no WhatsApp" e clique em "+ Lançar"
- **Ligar/desligar aviso de uma tarefa já lançada:** clique no botão da coluna "Aviso" (🔔 Ativo / 🔕 Mudo) na linha da tarefa — tarefas sem acompanhamento próximo podem ficar mudas sem precisar excluir
- **Concluir:** clique em "✓ Concluir" na linha da tarefa — ela para de contar prazo (o farol congela na data de conclusão)
- **Reabrir:** clique em "↺ Reabrir" para voltar a contar o prazo
- **Excluir:** clique em "🗑 Excluir" (pede confirmação)
- **Atualizar código depois:** edite `Code.gs` / `Index.html` no editor do Apps Script (ou cole a versão atualizada deste repositório) e clique em **Implantar → Gerenciar implantações → editar (✏️) → Nova versão → Implantar**

---

## 🚦 Critérios do Farol de Prazo

O farol compara **quanto tempo já passou** desde a data de início com o **prazo total estipulado** (data de início → prazo):

| Farol | % do prazo decorrido | Significado |
|---|---|---|
| 🟢 Verde | até 70% | Tranquilo |
| 🟠 Laranja | 70% a 90% | Atenção |
| 🔴 Vermelho | 91% a 99% | Urgente |
| ⚫ Preto | 100% ou mais | Atrasado — mostra o número de dias que já passaram do prazo |

Cálculo: `% decorrido = (dias desde o início) / (dias entre início e prazo) × 100`.

---

## 📊 Onde ficam os dados

Todos os lançamentos ficam na aba **`Agenda`** da planilha do Google Sheets criada no Passo 1 — dá para abrir, filtrar e exportar os dados normalmente pela própria planilha, além de usar o painel web.

---

## 📲 Avisos de WhatsApp quando o farol muda (CallMeBot)

Sempre que o farol de uma tarefa mudar de cor (ex: verde → laranja) ou uma tarefa for concluída, o sistema manda um aviso por WhatsApp pro seu número, usando o **CallMeBot** (serviço gratuito de terceiros — se você já tem uma API key ativada, é só reaproveitar).

### A. Ativar a API key (pule se já tiver uma)

1. Salve o contato **+34 621 71 85 21** no seu WhatsApp
2. Mande a mensagem: `I allow callmebot to send me messages`
3. Em alguns minutos você recebe de volta sua **API key** (um número)

### B. Configurar o Apps Script

1. No editor do Apps Script, clique no ícone de **engrenagem ⚙️ (Configurações do projeto)**
2. Role até **Script Properties** → **Add script property** e adicione, uma por uma:

   | Propriedade | Valor |
   |---|---|
   | `CALLMEBOT_PHONE` | seu número no formato internacional sem símbolos, ex: `5531999999999` |
   | `CALLMEBOT_API_KEY` | a API key do Passo A |

3. Copie o `Code.gs` atualizado deste repositório para o editor (substitui o antigo) e salve
4. No menu de funções (topo do editor, ao lado do ▶ Executar), selecione **`testarWhatsApp`** e clique em **Executar** — autorize se pedir, e confira se a mensagem chegou no seu WhatsApp
5. Se deu certo, selecione **`instalarGatilhoDiario`** no mesmo menu e clique em **Executar** uma única vez — isso liga o monitoramento automático (roda todo dia por volta das 8h e avisa quando o farol de alguma tarefa mudar)
6. Crie uma **nova versão** da implantação (Implantar → Gerenciar implantações → ✏️ → Nova versão → Implantar) pra tudo entrar em vigor

**Observações:**
- O CallMeBot é um serviço não-oficial mantido por terceiros (não é da Meta/WhatsApp) — de vez em quando pode ficar instável, mas pra avisos pessoais funciona bem e é o mais simples que existe
- Ele manda mensagem só pro número que ativou a API key (o seu) — não dá pra usar pra avisar vários responsáveis diferentes com essa mesma chave
- Nunca cole a API key diretamente no código — sempre em Script Properties, senão ela vai pro histórico do GitHub
