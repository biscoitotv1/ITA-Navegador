/**
 * =========================================================
 * ITA Browser
 * AI Provider Manager
 * =========================================================
 *
 * Responsável por:
 * - Detectar Ollama
 * - Listar modelos instalados
 * - Escolher modelo automaticamente
 * - Enviar mensagens para o Ollama
 * - Controlar timeout
 * - Informar erros reais
 * =========================================================
 */

"use strict";

class AIProviderManager {

    constructor(options = {}) {

        this.config = {

            ollamaBaseUrl:
                options.ollamaBaseUrl ||
                "http://localhost:11434",

            preferredModel:
                options.preferredModel ||
                "llama3.1:8b",

            timeout:
                Number(options.timeout) > 0
                    ? Number(options.timeout)
                    : 120000,

            temperature:
                typeof options.temperature === "number"
                    ? options.temperature
                    : 0.2

        };

        this.connected = false;

        this.models = [];

        this.activeModel = null;

        this.lastError = null;

        console.log(
            "🤖 ITA AI Provider Manager inicializado."
        );

    }


    /**
     * =====================================================
     * URL DA API
     * =====================================================
     */

    getApiUrl(endpoint) {

        const base =
            this.config.ollamaBaseUrl
                .replace(/\/+$/, "");

        const path =
            endpoint.startsWith("/")
                ? endpoint
                : `/${endpoint}`;

        return `${base}${path}`;

    }


    /**
     * =====================================================
     * TIMEOUT
     * =====================================================
     */

    createTimeout(ms) {

        const controller =
            new AbortController();

        const timer =
            setTimeout(() => {

                controller.abort();

            }, ms);

        return {
            controller,
            timer
        };

    }


    /**
     * =====================================================
     * VERIFICAR OLLAMA
     * =====================================================
     */

    async checkConnection() {

        this.lastError = null;

        const {
            controller,
            timer
        } =
            this.createTimeout(10000);

        try {

            const response =
                await fetch(
                    this.getApiUrl("/api/tags"),
                    {
                        method: "GET",
                        signal: controller.signal
                    }
                );

            clearTimeout(timer);

            if (!response.ok) {

                throw new Error(
                    `Ollama respondeu HTTP ${response.status}.`
                );

            }

            const data =
                await response.json();

            this.connected = true;

            if (
                data &&
                Array.isArray(data.models)
            ) {

                this.models =
                    data.models;

            } else {

                this.models = [];

            }

            return {

                connected: true,

                models:
                    this.models,

                modelCount:
                    this.models.length

            };

        } catch (error) {

            clearTimeout(timer);

            this.connected = false;

            this.lastError =
                this.normalizeError(error);

            return {

                connected: false,

                models: [],

                modelCount: 0,

                error:
                    this.lastError

            };

        }

    }


    /**
     * =====================================================
     * LISTAR MODELOS
     * =====================================================
     */

    async getInstalledModels() {

        const result =
            await this.checkConnection();

        if (!result.connected) {

            throw new Error(
                result.error ||
                "Não foi possível conectar ao Ollama."
            );

        }

        return this.models;

    }


    /**
     * =====================================================
     * RESOLVER MODELO
     * =====================================================
     */

    async resolveModel(preferredModel = null) {

        const models =
            await this.getInstalledModels();

        if (!models.length) {

            throw new Error(
                "Nenhum modelo Ollama está instalado. Use 'ollama list' no terminal para verificar."
            );

        }

        const preferred =
            (
                preferredModel ||
                this.config.preferredModel ||
                ""
            )
                .trim()
                .toLowerCase();

        /**
         * Correspondência exata
         */

        const exact =
            models.find(model => {

                return (
                    typeof model.name === "string" &&
                    model.name.toLowerCase() === preferred
                );

            });

        if (exact) {

            this.activeModel =
                exact.name;

            return exact.name;

        }


        /**
         * Correspondência por família
         *
         * Exemplo:
         *
         * llama3
         * ↓
         * llama3.1:8b
         */

        const family =
            models.find(model => {

                if (
                    !model ||
                    typeof model.name !== "string"
                ) {
                    return false;
                }

                return model.name
                    .toLowerCase()
                    .startsWith(preferred);

            });

        if (family) {

            this.activeModel =
                family.name;

            console.warn(
                "🤖 Modelo preferido não encontrado.",
                "Usando:",
                family.name
            );

            return family.name;

        }


        /**
         * Caso nenhum modelo corresponda,
         * usar o primeiro disponível.
         */

        this.activeModel =
            models[0].name;

        console.warn(
            "🤖 Modelo preferido não encontrado.",
            "Usando primeiro modelo disponível:",
            this.activeModel
        );

        return this.activeModel;

    }


    /**
     * =====================================================
     * ENVIAR CHAT
     * =====================================================
     */

    async chat(messages, options = {}) {

        if (!Array.isArray(messages)) {

            throw new Error(
                "messages precisa ser um array."
            );

        }

        if (!messages.length) {

            throw new Error(
                "Nenhuma mensagem foi fornecida."
            );

        }


        /**
         * Garantir conexão
         */

        if (!this.connected) {

            const connection =
                await this.checkConnection();

            if (!connection.connected) {

                throw new Error(
                    connection.error ||
                    "Ollama não está disponível."
                );

            }

        }


        /**
         * Garantir modelo
         */

        let model =
            options.model ||
            this.activeModel;

        if (!model) {

            model =
                await this.resolveModel();

        }


        const payload = {

            model,

            messages,

            stream: false,

            options: {

                temperature:
                    typeof options.temperature === "number"
                        ? options.temperature
                        : this.config.temperature

            }

        };


        /**
         * Timeout configurável
         */

        const timeout =
            Number(options.timeout) > 0
                ? Number(options.timeout)
                : this.config.timeout;


        const {
            controller,
            timer
        } =
            this.createTimeout(timeout);


        try {

            const response =
                await fetch(
                    this.getApiUrl("/api/chat"),
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify(payload),

                        signal:
                            controller.signal

                    }
                );


            clearTimeout(timer);


            /**
             * Erro HTTP
             */

            if (!response.ok) {

                let details = "";

                try {

                    details =
                        await response.text();

                } catch {}

                throw new Error(
                    `Ollama retornou HTTP ${response.status}. ${details}`
                );

            }


            /**
             * JSON
             */

            const data =
                await response.json();


            /**
             * Resposta padrão /api/chat
             */

            if (
                data &&
                data.message &&
                typeof data.message.content === "string"
            ) {

                return {

                    success: true,

                    model:
                        data.model ||
                        model,

                    content:
                        data.message.content,

                    raw:
                        data

                };

            }


            /**
             * Compatibilidade com /api/generate
             */

            if (
                data &&
                typeof data.response === "string"
            ) {

                return {

                    success: true,

                    model:
                        data.model ||
                        model,

                    content:
                        data.response,

                    raw:
                        data

                };

            }


            throw new Error(
                "Ollama respondeu, mas o formato da resposta não foi reconhecido."
            );

        } catch (error) {

            clearTimeout(timer);

            this.lastError =
                this.normalizeError(error);

            throw new Error(
                this.lastError
            );

        }

    }


    /**
     * =====================================================
     * PERGUNTAR
     * =====================================================
     */

    async ask(prompt, context = {}, options = {}) {

        if (
            typeof prompt !== "string" ||
            !prompt.trim()
        ) {

            throw new Error(
                "A pergunta da IA está vazia."
            );

        }


        let contextText = "";


        if (context && typeof context === "object") {

            contextText = `

CONTEXTO DO ITA BROWSER

URL:
${context.url || "desconhecida"}

Título:
${context.title || "desconhecido"}

Aba:
${context.tabId ?? "desconhecida"}

Quantidade de abas:
${context.tabsCount ?? "desconhecida"}

`;

        }


        const messages = [

            {

                role: "system",

                content: `
Você é a ITA AI, inteligência artificial oficial do ITA Browser.

O ITA Browser é um navegador desenvolvido pela ITA Games Studios.

Você deve:

- ajudar a desenvolver o navegador;
- analisar problemas;
- explicar código;
- corrigir código;
- criar funcionalidades;
- melhorar arquitetura;
- melhorar desempenho;
- melhorar segurança;
- analisar erros;
- planejar melhorias;
- ajudar no desenvolvimento de sistemas.

Responda sempre em português do Brasil.

Não invente resultados de comandos.

Não diga que executou um comando se ele não foi realmente executado.

Quando uma operação precisar ser executada no computador, informe que ela precisa passar pelo Command Runner ou terminal autorizado.

Priorize respostas práticas.
`

            },

            {

                role: "user",

                content:
                    contextText +
                    "\nPERGUNTA DO USUÁRIO:\n" +
                    prompt.trim()

            }

        ];


        return this.chat(
            messages,
            options
        );

    }


    /**
     * =====================================================
     * STATUS
     * =====================================================
     */

    getStatus() {

        return {

            connected:
                this.connected,

            models:
                [...this.models],

            modelCount:
                this.models.length,

            activeModel:
                this.activeModel,

            preferredModel:
                this.config.preferredModel,

            timeout:
                this.config.timeout,

            temperature:
                this.config.temperature,

            lastError:
                this.lastError

        };

    }


    /**
     * =====================================================
     * CONFIGURAÇÃO
     * =====================================================
     */

    setModel(modelName) {

        if (
            typeof modelName !== "string" ||
            !modelName.trim()
        ) {

            return false;

        }

        this.config.preferredModel =
            modelName.trim();

        this.activeModel =
            null;

        return true;

    }


    /**
     * =====================================================
     * NORMALIZAR ERROS
     * =====================================================
     */

    normalizeError(error) {

        if (!error) {

            return "Erro desconhecido.";

        }


        if (
            error.name === "AbortError"
        ) {

            return (
                `O Ollama demorou mais de ` +
                `${this.config.timeout / 1000} segundos ` +
                `para responder.`
            );

        }


        if (
            error instanceof TypeError
        ) {

            return (
                "Falha de conexão com o Ollama. " +
                "Verifique se o Ollama está executando em " +
                "http://localhost:11434."
            );

        }


        return (
            error.message ||
            String(error)
        );

    }

}


/**
 * =========================================================
 * EXPORTAÇÃO
 * =========================================================
 */

if (typeof module !== "undefined" && module.exports) {

    module.exports =
        AIProviderManager;

}


/**
 * =========================================================
 * BROWSER
 * =========================================================
 */

if (typeof window !== "undefined") {

    window.AIProviderManager =
        AIProviderManager;

}


console.log(
    "🤖 ITA AI Provider Manager carregado."
);