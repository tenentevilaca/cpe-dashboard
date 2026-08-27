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
4. Em "Quem pode acessar": escolha **"Qualquer pessoa"** (link público, requer login Google) ou **"Qualquer pessoa na [seu domínio]"** se quiser restringir à sua organização
5. Clique em **Implantar** → autorize as permissões pedidas (é o próprio script acessando a planilha)
6. Copie a **URL do app da Web** gerada — é o link da agenda

**Pronto!** ✅ Cada lançamento, conclusão ou exclusão de tarefa grava direto numa aba `Agenda` criada automaticamente na planilha.

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

---

## 🤖 Avisos automáticos para o RESPONSÁVEL (WhatsApp Cloud API — Meta, oficial e gratuita)

O CallMeBot acima só avisa **você** (o dono da agenda). Pra avisar automaticamente o **responsável de cada tarefa**, direto no WhatsApp dele, **sem ele precisar instalar ou ativar nada**, dá pra usar a **WhatsApp Cloud API oficial da Meta** — é gratuita dentro do limite de uso desta agenda.

**Limitação do modo gratuito (Desenvolvimento):** sem passar pela verificação de empresa da Meta, só é possível mandar mensagem pra **até 5 números de telefone**, e esses números precisam ser cadastrados manualmente por você no painel da Meta (é o suficiente pra "até 5 pessoas" — se um dia precisar de mais responsáveis, aí sim vale considerar a verificação de empresa).

### A. Criar o app na Meta e pegar um número de teste

1. Acesse https://developers.facebook.com/apps e crie uma conta de desenvolvedor (se ainda não tiver)
2. Clique em **Criar app** → tipo **"Outro"** → finalidade **"Empresa"** → dê um nome (ex: `Agenda CPE`)
3. Dentro do app criado, adicione o produto **WhatsApp** (procure no catálogo de produtos e clique em "Configurar")
4. Na página do produto WhatsApp → **Introdução (Getting Started)**, a Meta já te dá de graça:
   - Um **número de teste** (`Test Number`) — é o número que vai aparecer enviando as mensagens
   - O **Phone Number ID** desse número (uma sequência de dígitos — guarde)
   - Um **token de acesso temporário** (válido por 24h — não é o que vamos usar de vez, veja o passo C)

### B. Cadastrar os números que vão RECEBER mensagem (até 5)

1. Ainda em **WhatsApp → Introdução**, na seção **"Para" (To)**, clique em **Manage phone number list**
2. Adicione o número de WhatsApp de cada responsável (formato internacional, ex: `+55 31 99999-9999`) — a Meta manda um código de verificação por WhatsApp pro próprio número, a pessoa só precisa informar esse código pra você (uma única vez, por mensagem/ligação — sem instalar nada, sem ativar nada de forma contínua)
3. Repita para até 5 números — esse é o limite do modo Desenvolvimento

### C. Gerar um token de acesso permanente (System User)

O token que aparece no passo A expira em 24h. Pra não precisar renovar toda hora:

1. Acesse https://business.facebook.com/settings/system-users
2. Crie um **Usuário do sistema** (System User), papel **Administrador**
3. Clique em **Adicionar ativos** → selecione o seu app da Meta → dê permissão total
4. Clique em **Gerar novo token** → selecione o app → marque a permissão `whatsapp_business_messaging` (e `whatsapp_business_management`) → **sem data de expiração**
5. Copie o token gerado (só aparece uma vez — guarde num lugar seguro antes de configurar no Apps Script)

### D. Criar o template de mensagem (obrigatório — mensagens automáticas só podem usar templates aprovados)

1. No painel da Meta, vá em **WhatsApp Manager → Modelos de mensagem (Message Templates)** → **Criar modelo**
2. Categoria: **Utilidade (Utility)**
3. Nome do modelo: `agenda_cpe_status` (se usar outro nome, configure em `META_TEMPLATE_NAME` no passo E)
4. Idioma: **Português (BR)**
5. Corpo do modelo (cole exatamente, com as 3 variáveis):
   ```
   ⚠️ Atualização de tarefa — Agenda CPE

   Tarefa: {{1}}
   Responsável: {{2}}
   Status: {{3}}
   ```
6. Envie pra aprovação — normalmente é aprovado em minutos a poucas horas

### E. Configurar o Apps Script

1. No editor do Apps Script, **Configurações do projeto ⚙️ → Script Properties** → adicione:

   | Propriedade | Valor |
   |---|---|
   | `META_PHONE_NUMBER_ID` | o Phone Number ID do passo A |
   | `META_ACCESS_TOKEN` | o token permanente do passo C |
   | `META_TEMPLATE_NAME` | `agenda_cpe_status` (só precisa se usou outro nome no passo D) |
   | `META_TEMPLATE_LANG` | `pt_BR` (só precisa se usou outro idioma) |

2. Copie o `Code.gs` atualizado deste repositório pro editor e salve
3. No menu de funções, edite a linha `const telefoneDeTeste = '5531999999999';` dentro de `testarWhatsAppMeta` pra usar um dos números cadastrados no passo B, selecione **`testarWhatsAppMeta`** e clique em **Executar** — confira se a mensagem chegou
4. Crie uma **nova versão** da implantação (Implantar → Gerenciar implantações → ✏️ → Nova versão → Implantar)

### Como funciona no painel

- Ao lançar uma tarefa com "WhatsApp do Responsável" preenchido, o aviso automático "🤖 Auto p/ Responsável" já vem ligado
- Na tabela, a coluna **WhatsApp Resp.** mostra o botão **🤖 Auto: Ativo/Mudo** — clique pra ligar/desligar o aviso automático daquela tarefa específica, sem mexer no botão manual (📲 Enviar, que continua existindo como alternativa/reforço)
- Sempre que o farol mudar de cor (inclusive dia a dia enquanto atrasada), a tarefa for concluída, ou o prazo for prorrogado por uma observação, o responsável recebe a mensagem automaticamente — igual acontece com você via CallMeBot

**Observações:**
- Nunca cole o token de acesso diretamente no código — sempre em Script Properties
- Se `META_PHONE_NUMBER_ID`/`META_ACCESS_TOKEN` não estiverem configurados, o aviso automático ao responsável simplesmente não é enviado (sem quebrar o resto da agenda) — o CallMeBot pro seu número continua funcionando normalmente
