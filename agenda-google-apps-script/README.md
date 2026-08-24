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

- **Lançar tarefa:** preencha Tarefa, Responsável, Data de Início e Prazo, clique em "+ Lançar"
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
