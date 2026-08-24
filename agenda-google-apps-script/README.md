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

- **Lançar tarefa:** preencha Tarefa, Responsável, Data de Início e o número de dias de Prazo (ex: 30) — a data final é calculada automaticamente somando os dias à data de início — clique em "+ Lançar"
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

## 📲 Avisos de WhatsApp quando o farol muda (Meta Cloud API)

Sempre que o farol de uma tarefa mudar de cor (ex: verde → laranja) ou uma tarefa for concluída, o sistema pode mandar um aviso por WhatsApp. Isso usa a **Meta WhatsApp Cloud API** (gratuita até 1000 conversas/mês), que exige uma configuração única do seu lado.

### A. Criar o app e o número de teste na Meta

1. Acesse https://developers.facebook.com e crie/entre com uma conta de desenvolvedor
2. Clique em **Meus Apps → Criar App**, escolha o tipo **"Outro" → "Negócios"**
3. Dentro do app criado, adicione o produto **WhatsApp**
4. Na página **WhatsApp → Introdução**, a Meta te dá um **número de teste grátis**. Nessa mesma página:
   - Copie o **Phone Number ID** (Id do número de telefone)
   - Em "Para", clique em **Gerenciar lista de números** e adicione **o seu número de WhatsApp** (formato internacional, ex: +55 31 99999-9999) — em modo de teste, só números cadastrados aqui recebem mensagem
   - Você vai receber um código no WhatsApp pra confirmar o número

### B. Gerar um token permanente

O token que aparece na tela de "Introdução" expira em 24h — só serve pra teste manual. Para o aviso automático funcionar todo dia, você precisa de um token permanente:

1. Vá em https://business.facebook.com → **Configurações do Negócio → Usuários → Usuários do sistema**
2. Crie um usuário do sistema (papel: Admin)
3. Clique em **Adicionar ativos** → selecione seu app do WhatsApp → dê permissão total
4. Clique em **Gerar novo token** para esse usuário do sistema, marque a permissão **`whatsapp_business_messaging`**, e copie o token gerado (só aparece uma vez — guarde num lugar seguro)

### C. Criar o modelo de mensagem (template)

Mensagens iniciadas pelo sistema (não é resposta a uma mensagem sua) exigem um **template aprovado pela Meta**:

1. Vá em https://business.facebook.com/wa/manage/message-templates
2. Clique em **Criar modelo**
3. Preencha:
   - **Nome:** `alerta_prazo_agenda`
   - **Categoria:** Utilidade (Utility)
   - **Idioma:** Português (BR)
   - **Corpo do texto:**
     ```
     ⚠️ Alerta de prazo — Agenda CPE

     Tarefa: {{1}}
     Responsável: {{2}}
     Novo status: {{3}}
     ```
4. Envie para aprovação — normalmente leva minutos, pode levar até 24h

### D. Configurar o Apps Script

1. No editor do Apps Script, clique no ícone de **engrenagem ⚙️ (Configurações do projeto)**
2. Role até **Script Properties** → **Add script property** e adicione, uma por uma:

   | Propriedade | Valor |
   |---|---|
   | `WHATSAPP_TOKEN` | o token permanente do Passo B |
   | `WHATSAPP_PHONE_NUMBER_ID` | o Phone Number ID do Passo A |
   | `WHATSAPP_DESTINATARIO` | seu número no formato internacional sem símbolos, ex: `5531999999999` |
   | `WHATSAPP_TEMPLATE_NAME` | `alerta_prazo_agenda` (opcional — já é o padrão) |
   | `WHATSAPP_TEMPLATE_LANG` | `pt_BR` (opcional — já é o padrão) |

3. Copie o `Code.gs` atualizado deste repositório para o editor (substitui o antigo) e salve
4. No menu de funções (topo do editor, ao lado do ▶ Executar), selecione **`testarWhatsApp`** e clique em **Executar** — autorize se pedir, e confira se a mensagem chegou no seu WhatsApp
5. Se deu certo, selecione **`instalarGatilhoDiario`** no mesmo menu e clique em **Executar** uma única vez — isso liga o monitoramento automático (roda todo dia por volta das 8h e avisa quando o farol de alguma tarefa mudar)
6. Crie uma **nova versão** da implantação (Implantar → Gerenciar implantações → ✏️ → Nova versão → Implantar) pra tudo entrar em vigor

**Importante:** enquanto o app estiver em "modo de Desenvolvimento" na Meta, só o número cadastrado no Passo A recebe mensagens. Para uso mais amplo (vários responsáveis, por exemplo), a Meta exige verificação do negócio.
