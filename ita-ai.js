/* =========================================================
   ITA AI
   Inteligência Artificial do ITA Browser
   Ollama Local
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       CONFIGURAÇÃO
       ===================================================== */

    const CONFIG = {
        ollamaUrl: "http://localhost:11434/api/chat",

        modelsUrl: "http://localhost:11434/api/tags",

        // Modelo principal
        model: "llama3",

        // 2 minutos
        timeout: 120000,

        // Timeout da verificação do Ollama
        connectionTimeout: 10000,

        temperature: 0.2,

        maxHistory: 12
    };


    /* =====================================================
       MEMÓRIA
       ===================================================== */

    let conversationHistory = [];


    /* =====================================================
       SYSTEM PROMPT
       ===================================================== */

    const SYSTEM_PROMPT = `
Você é a ITA AI, a inteligência artificial oficial e Engenheira de Software Sênior do ITA Browser (ITA Games Studios).

Você atua como Engenheira de Software Sênior e Arquiteta de Sistemas Especialista em:
- Arquitetura profunda de Electron (processos Main/Preload/Renderer, Webviews, sessões persistentes, isolamento de contexto e IPC seguro);
- Automações avançadas com n8n (orquestração de fluxos autônomos, nodes customizados, webhooks, pipelines de dados resilientes e APIs REST/GraphQL);
- Engenharia de software moderna, JavaScript/TypeScript de alta performance e CSS Vanilla (Padrão visual FORGE: preto profundo, laranja vibrante e branco);
- Tratamento rigoroso de erros assíncronos (try/catch, AbortController, retries com backoff exponencial, graceful fallbacks e validações completas);
- Código limpo, modular, pronto para produção (sem stubs, sem placeholders vazios, sem respostas genéricas ou evasivas).

Você NÃO é BrowserGenie e NÃO deve inventar outros nomes.
Você deve responder sempre em português do Brasil, com clareza técnica, precisão e blocos de código completos e drop-in.

=========================================================
IDENTIDADE & DIRETRIZES TÉCNICAS
=========================================================

Seu nome é ITA AI.

Ao responder dúvidas ou criar funcionalidades:
1. Entregue código modular, testado e pronto para produção com tratamento de exceções.
2. Foque em produtividade autônoma máxima: resolva o problema de ponta a ponta.
3. Se o usuário pedir automações, forneça a estrutura completa do fluxo n8n ou integração com APIs.
4. Mantenha os padrões de arquitetura do ITA Browser (sessões isoladas, aceleração de hardware e UI limpa sem poluentes estáticos).

=========================================================
O QUE VOCÊ DOMINA E PODE FAZER
=========================================================

- Arquitetura de navegadores Chromium/Electron;
- Automações completas com n8n e IA;
- Desenvolvimento Web Fullstack (HTML5, CSS3, JavaScript ESNext, TypeScript);
- Motores de Jogos 2D/3D (Pixi.js, Three.js, Canvas, WebGL);
- Comunicação IPC bidirecional segura;
- Otimização de performance, gerenciamento de memória e profiling V8;
- Diagnóstico e correção profunda de bugs assíncronos e concorrência;
- Design Systems profissionais (Padrão FORGE).

=========================================================
REGRA IMPORTANTE SOBRE OLLAMA
=========================================================

O Ollama é apenas o mecanismo local usado para executar você.

URLs como:

http://localhost:11434
http://localhost:11434/api
http://localhost:11434/api/tags
http://localhost:11434/api/chat

são infraestrutura interna.

Não trate essas URLs como conteúdo da conversa.

Comandos como:

ollama list
ollama run llama3
ollama pull llama3
curl.exe http://localhost:11434/api/tags

são comandos técnicos.

NÃO transforme automaticamente esses comandos em perguntas.

NÃO invente o resultado de um comando.

NÃO diga que /api/tags contém "tags do BrowserGenie".

NÃO invente uma lista de tags quando o usuário mencionar
/api/tags.

Se o usuário perguntar sobre um comando, explique o que ele faz
de forma objetiva.

Se o usuário simplesmente fornecer um comando, não invente
uma resposta sobre o resultado.

=========================================================
COMANDOS
=========================================================

Quando o usuário escrever algo como:

ollama list

entenda que isso é um comando do Ollama.

Explique:

"Esse comando lista os modelos instalados no Ollama."

Não invente quais modelos estão instalados.

Quando o usuário escrever:

curl.exe http://localhost:11434/api/tags

entenda que esse comando consulta a API local do Ollama e retorna
informações sobre os modelos disponíveis.

Não invente o JSON retornado.

Só mostre resultados reais se eles forem fornecidos pelo navegador.

=========================================================
EXECUÇÃO DE COMANDOS
=========================================================

Você NÃO executa comandos no computador do usuário.

Você NÃO executa comandos automaticamente.

Você NÃO simula ou inventa a saída de um comando.

Quando um comando precisar ser executado, diga claramente
que é necessário usar o terminal ou o Command Runner.

Exemplo de orientação:

"Para ver o resultado real, execute esse comando no
terminal ou no Command Runner do ITA Browser."

Nunca apresente a saída de um comando como se você
tivesse executado.

=========================================================
CÓDIGO
=========================================================

Quando o usuário pedir código:

- entregue código funcional;
- preserve a arquitetura existente quando possível;
- não remova funcionalidades existentes sem motivo;
- explique erros de forma prática;
- entregue código completo quando solicitado.

=========================================================
CONTEXTO DO NAVEGADOR
=========================================================

Quando o navegador fornecer contexto, você poderá receber:

URL atual;
título;
ID da aba;
quantidade de abas.

Use essas informações para ajudar o usuário.

Não invente informações que não foram fornecidas.

=========================================================
REGRAS DE RESPOSTA
=========================================================

Responda diretamente.

Não fique repetindo a pergunta.

Não diga "Another curl command!".

Não diga "Another ollama list!".

Não invente BrowserGenie.

Não invente APIs.

Não invente resultados de comandos.

Não finja que executou comandos se não executou.

Nunca mencione o nome BrowserGenie em nenhuma resposta.

Não execute comandos automaticamente.

Quando um comando precisar ser executado, diga que é
necessário usar o terminal ou o Command Runner.

Mantenha o foco no ITA Browser, não em extensões de terceiros.

Se não souber alguma informação, diga claramente que não possui
essa informação.

Priorize soluções práticas.

Você é a ITA AI do ITA Browser.
`;


    /* =====================================================
       TIMEOUT
       ===================================================== */

    function createTimeoutController(ms) {

        const controller = new AbortController();

        const timer = setTimeout(() => {
            controller.abort();
        }, ms);

        return {
            controller,
            timer
        };
    }


    /* =====================================================
       VERIFICAR OLLAMA
       ===================================================== */

    async function checkConnection() {

        const {
            controller,
            timer
        } = createTimeoutController(
            CONFIG.connectionTimeout
        );

        try {

            const response = await fetch(
                CONFIG.modelsUrl,
                {
                    method: "GET",
                    signal: controller.signal,
                    cache: "no-store"
                }
            );

            clearTimeout(timer);

            if (!response.ok) {
                return false;
            }

            const data = await response.json();

            return !!(
                data &&
                Array.isArray(data.models)
            );

        } catch (error) {

            clearTimeout(timer);

            console.error(
                "ITA AI - erro ao verificar Ollama:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       OBTER MODELOS
       ===================================================== */

    async function getInstalledModels() {

        const {
            controller,
            timer
        } = createTimeoutController(
            CONFIG.connectionTimeout
        );

        try {

            const response = await fetch(
                CONFIG.modelsUrl,
                {
                    method: "GET",
                    signal: controller.signal,
                    cache: "no-store"
                }
            );

            clearTimeout(timer);

            if (!response.ok) {
                return [];
            }

            const data = await response.json();

            if (
                !data ||
                !Array.isArray(data.models)
            ) {
                return [];
            }

            return data.models;

        } catch (error) {

            clearTimeout(timer);

            console.error(
                "ITA AI - erro ao obter modelos:",
                error
            );

            return [];
        }
    }


    /* =====================================================
       RESOLVER MODELO
       ===================================================== */

    async function resolveModel() {

        const models =
            await getInstalledModels();

        if (!models.length) {

            throw new Error(
                "Nenhum modelo foi encontrado no Ollama. Execute 'ollama list' no terminal para verificar os modelos instalados."
            );
        }

        /* ---------------------------------------------
           TENTA ENCONTRAR O MODELO EXATO
           --------------------------------------------- */

        const exact = models.find(
            model =>
                model &&
                model.name === CONFIG.model
        );

        if (exact) {
            return exact.name;
        }


        /* ---------------------------------------------
           TENTA ENCONTRAR A MESMA FAMÍLIA
           --------------------------------------------- */

        const family = models.find(
            model =>
                model &&
                typeof model.name === "string" &&
                model.name
                    .toLowerCase()
                    .startsWith(
                        CONFIG.model.toLowerCase()
                    )
        );

        if (family) {

            console.warn(
                "Modelo configurado não encontrado. Usando:",
                family.name
            );

            return family.name;
        }


        /* ---------------------------------------------
           USA PRIMEIRO MODELO DISPONÍVEL
           --------------------------------------------- */

        if (
            models[0] &&
            models[0].name
        ) {

            console.warn(
                "Modelo",
                CONFIG.model,
                "não encontrado. Usando:",
                models[0].name
            );

            return models[0].name;
        }

        throw new Error(
            "Não foi possível identificar um modelo do Ollama."
        );
    }


    /* =====================================================
       LIMPAR HISTÓRICO
       ===================================================== */

    function trimHistory() {

        if (
            conversationHistory.length >
            CONFIG.maxHistory
        ) {

            conversationHistory =
                conversationHistory.slice(
                    -CONFIG.maxHistory
                );
        }
    }


    /* =====================================================
       CONTEXTO DO NAVEGADOR
       ===================================================== */

    function buildBrowserContext(context) {

        if (!context) {
            return "";
        }

        const url =
            typeof context.url === "string"
                ? context.url
                : "desconhecida";

        const title =
            typeof context.title === "string"
                ? context.title
                : "desconhecido";

        const tabId =
            context.tabId !== undefined &&
            context.tabId !== null
                ? context.tabId
                : "desconhecido";

        const tabsCount =
            context.tabsCount !== undefined &&
            context.tabsCount !== null
                ? context.tabsCount
                : "desconhecido";

        return `
CONTEXTO DO ITA BROWSER

URL atual:
${url}

Título:
${title}

ID da aba:
${tabId}

Quantidade de abas:
${tabsCount}

`;
    }


    /* =====================================================
       NORMALIZAR PROMPT
       ===================================================== */

    function normalizePrompt(prompt) {

        if (
            typeof prompt !== "string"
        ) {
            return "";
        }

        return prompt
            .replace(/\r\n/g, "\n")
            .trim();
    }


    /* =====================================================
       DETECTAR COMANDOS DO OLLAMA
       ===================================================== */

    function isOllamaCommand(prompt) {

        const value =
            normalizePrompt(prompt)
                .toLowerCase();

        return (
            value === "ollama list" ||
            value === "ollama ps" ||
            value === "ollama version" ||
            value.startsWith("ollama run ") ||
            value.startsWith("ollama pull ") ||
            value.startsWith("ollama show ") ||
            value.startsWith("curl.exe http://localhost:11434") ||
            value.startsWith("curl http://localhost:11434")
        );
    }


    /* =====================================================
       RESPOSTA DIRETA PARA COMANDOS
       ===================================================== */

    function explainOllamaCommand(prompt) {

        const value =
            normalizePrompt(prompt)
                .toLowerCase();

        if (value === "ollama list") {

            return (
                "O comando `ollama list` lista os modelos de IA instalados no Ollama. " +
                "Eu não executo comandos automaticamente e não invento a saída. " +
                "Para ver o resultado real, execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (value === "ollama ps") {

            return (
                "O comando `ollama ps` mostra os modelos do Ollama que estão carregados ou em execução. " +
                "Para ver o resultado real, execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (value === "ollama version") {

            return (
                "O comando `ollama version` mostra a versão instalada do Ollama. " +
                "Para ver o resultado real, execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (
            value.startsWith("ollama run ")
        ) {

            return (
                "Esse comando solicita que o Ollama execute o modelo informado. " +
                "Eu não executo comandos automaticamente; se desejar rodar o modelo, " +
                "execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (
            value.startsWith("ollama pull ")
        ) {

            return (
                "Esse comando solicita ao Ollama o download do modelo informado. " +
                "Eu não executo comandos automaticamente; para baixar o modelo, " +
                "execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (
            value.startsWith("ollama show ")
        ) {

            return (
                "Esse comando solicita informações sobre um modelo específico do Ollama. " +
                "Para ver o resultado real, execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        if (
            value.startsWith("curl.exe http://localhost:11434") ||
            value.startsWith("curl http://localhost:11434")
        ) {

            return (
                "Esse comando é usado para testar a API local do Ollama. " +
                "O endpoint `/api/tags` lista os modelos disponíveis. " +
                "Eu não executo comandos automaticamente e não invento o JSON retornado. " +
                "Para ver o resultado real, execute-o no terminal ou no Command Runner do ITA Browser."
            );
        }

        return null;
    }


    /* =====================================================
       ENVIAR PARA O OLLAMA
       ===================================================== */

    async function ask(
        prompt,
        browserContext = {}
    ) {

        const cleanPrompt =
            normalizePrompt(prompt);

        if (!cleanPrompt) {

            throw new Error(
                "A mensagem da IA está vazia."
            );
        }


        console.log(
            "🤖 ITA AI:",
            cleanPrompt
        );


        /* =================================================
           COMANDOS SIMPLES
           ================================================= */

        if (
            isOllamaCommand(cleanPrompt)
        ) {

            const directAnswer =
                explainOllamaCommand(
                    cleanPrompt
                );

            if (directAnswer) {

                conversationHistory.push({
                    role: "user",
                    content: cleanPrompt
                });

                conversationHistory.push({
                    role: "assistant",
                    content: directAnswer
                });

                trimHistory();

                return directAnswer;
            }
        }


        /* =================================================
           VERIFICAR CONEXÃO
           ================================================= */

        const connected =
            await checkConnection();

        if (!connected) {

            throw new Error(
                "Não foi possível conectar ao Ollama. Verifique se o Ollama está aberto e acessível em http://localhost:11434."
            );
        }


        /* =================================================
           MODELO
           ================================================= */

        const model =
            await resolveModel();

        console.log(
            "🤖 Modelo utilizado:",
            model
        );


        /* =================================================
           CONTEXTO
           ================================================= */

        const context =
            buildBrowserContext(
                browserContext
            );


        /* =================================================
           MENSAGEM DO USUÁRIO
           ================================================= */

        const userMessage = {

            role: "user",

            content:
                context +
                "\nPERGUNTA DO USUÁRIO:\n" +
                cleanPrompt
        };


        conversationHistory.push(
            userMessage
        );

        trimHistory();


        /* =================================================
           PAYLOAD
           ================================================= */

        const payload = {

            model,

            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },

                ...conversationHistory
            ],

            stream: false,

            options: {

                temperature:
                    CONFIG.temperature

            }
        };


        /* =================================================
           TIMEOUT
           ================================================= */

        const {
            controller,
            timer
        } = createTimeoutController(
            CONFIG.timeout
        );


        try {

            const response =
                await fetch(
                    CONFIG.ollamaUrl,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(
                                payload
                            ),

                        signal:
                            controller.signal
                    }
                );


            clearTimeout(timer);


            /* =================================================
               ERRO HTTP
               ================================================= */

            if (!response.ok) {

                let errorText = "";

                try {

                    errorText =
                        await response.text();

                } catch {
                    // ignorar
                }

                throw new Error(
                    `Ollama retornou HTTP ${response.status}. ${errorText}`
                );
            }


            /* =================================================
               JSON
               ================================================= */

            const data =
                await response.json();


            console.log(
                "🤖 Resposta do Ollama:",
                data
            );


            /* =================================================
               EXTRAIR RESPOSTA
               ================================================= */

            let answer = "";


            if (
                data &&
                data.message &&
                typeof data.message.content ===
                    "string"
            ) {

                answer =
                    data.message.content;

            } else if (
                data &&
                typeof data.response ===
                    "string"
            ) {

                answer =
                    data.response;

            } else {

                console.error(
                    "Resposta inesperada:",
                    data
                );

                throw new Error(
                    "O Ollama respondeu, mas não foi possível encontrar o texto da resposta."
                );
            }


            answer =
                answer.trim();


            if (!answer) {

                throw new Error(
                    "A ITA AI recebeu uma resposta vazia do Ollama."
                );
            }


            /* =================================================
               SALVAR RESPOSTA
               ================================================= */

            conversationHistory.push({

                role: "assistant",

                content: answer

            });

            trimHistory();


            return answer;


        } catch (error) {

            clearTimeout(timer);

            console.error(
                "❌ ITA AI:",
                error
            );


            /* =================================================
               TIMEOUT
               ================================================= */

            if (
                error &&
                error.name ===
                    "AbortError"
            ) {

                throw new Error(
                    `A ITA AI demorou mais de ${CONFIG.timeout / 1000} segundos para responder. O modelo pode estar carregando ou processando uma solicitação pesada.`
                );
            }


            /* =================================================
               FALHA DE FETCH
               ================================================= */

            if (
                error instanceof TypeError
            ) {

                throw new Error(
                    "Falha de conexão com o Ollama. Verifique se ele está executando em http://localhost:11434."
                );
            }


            throw error;
        }
    }


    /* =====================================================
       LIMPAR CONVERSA
       ===================================================== */

    function clearConversation() {

        conversationHistory = [];

        console.log(
            "🤖 Histórico da ITA AI limpo."
        );
    }


    /* =====================================================
       ALTERAR MODELO
       ===================================================== */

    function setModel(
        modelName
    ) {

        if (
            typeof modelName !== "string" ||
            !modelName.trim()
        ) {

            return false;
        }

        CONFIG.model =
            modelName.trim();

        console.log(
            "🤖 Modelo alterado para:",
            CONFIG.model
        );

        return true;
    }


    /* =====================================================
       CONFIGURAÇÃO
       ===================================================== */

    function getConfig() {

        return {

            ...CONFIG,

            historyLength:
                conversationHistory.length

        };
    }


    /* =====================================================
       API PÚBLICA
       ===================================================== */

    window.itaAI = {

        ask,

        checkConnection,

        getInstalledModels,

        resolveModel,

        clearConversation,

        setModel,

        getConfig

    };


    /* =====================================================
       INICIALIZAÇÃO
       ===================================================== */

    console.log(
        "========================================"
    );

    console.log(
        "🤖 ITA AI inicializada"
    );

    console.log(
        "🌐 ITA Browser"
    );

    console.log(
        "🧠 Modelo:",
        CONFIG.model
    );

    console.log(
        "🔗 Ollama:",
        CONFIG.ollamaUrl
    );

    console.log(
        "⏱️ Timeout:",
        CONFIG.timeout + "ms"
    );

    console.log(
        "========================================"
    );

})();