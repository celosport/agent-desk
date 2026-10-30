-- =============================================================================
-- AgentDesk — schema PostgreSQL 16. IDEMPOTENTE: roda a cada deploy (Banco__AplicarScripts=true) e nos testes.
-- Regras: CREATE TABLE IF NOT EXISTS · colunas novas com ALTER TABLE ... ADD COLUMN IF NOT EXISTS ·
--         constraints novas dentro de DO $$ ... EXCEPTION WHEN duplicate_object ... · dados de uma vez só em migracoes_dados.
-- Nomes em snake_case e português; enums como texto + CHECK; TIMESTAMPTZ sempre em UTC.
-- =============================================================================
BEGIN;

-- 1. Usuários
CREATE TABLE IF NOT EXISTS usuarios (
    usuario_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome         VARCHAR(150) NOT NULL,
    email        VARCHAR(150) NOT NULL,
    senha_hash   VARCHAR(255),  -- NULL = conta sem senha (ex.: criada por convite)
    tipo_perfil  VARCHAR(20)  NOT NULL CHECK (tipo_perfil IN ('USUARIO', 'ADMIN')),
    criado_em    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- E-mail único sem diferenciar maiúsculas
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email_lower ON usuarios (LOWER(email));

-- 2. (removida) Tarefas era o módulo de exemplo do esqueleto; saiu na Fase 2. A tabela some dos bancos que ainda a têm.
DROP TABLE IF EXISTS tarefas;

-- Migrações de dados de uma vez só (o schema roda a cada deploy)
CREATE TABLE IF NOT EXISTS migracoes_dados (
    nome         VARCHAR(80) PRIMARY KEY,
    aplicada_em  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Anel de chaves do ASP.NET Data Protection (cifra as API keys) — [[ADR-005 - Chave da API Criptografada (Data Protection no Postgres)]]
--    NUNCA apague: sem estas chaves, as API keys salvas ficam ilegíveis.
CREATE TABLE IF NOT EXISTS chaves_protecao_dados (
    nome       VARCHAR(200) PRIMARY KEY,
    xml        TEXT         NOT NULL,
    criada_em  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Modelos da Claude e preços por milhão de tokens (US$) — editável pelo ADMIN · [[ADR-007 - Custo pela Tabela de Preços (Preço Congelado e Limite Mensal)]]
CREATE TABLE IF NOT EXISTS modelos_claude (
    modelo_id                 VARCHAR(80)   PRIMARY KEY,  -- id da API da Anthropic (ex.: claude-opus-5-5)
    nome_exibicao             VARCHAR(80)   NOT NULL,
    preco_entrada_mtok        NUMERIC(12,4) NOT NULL CHECK (preco_entrada_mtok >= 0),
    preco_saida_mtok          NUMERIC(12,4) NOT NULL CHECK (preco_saida_mtok >= 0),
    preco_cache_leitura_mtok  NUMERIC(12,4) CHECK (preco_cache_leitura_mtok >= 0),  -- NULL = cobra como entrada
    preco_cache_escrita_mtok  NUMERIC(12,4) CHECK (preco_cache_escrita_mtok >= 0),  -- NULL = cobra como entrada
    ativo                     BOOLEAN       NOT NULL DEFAULT TRUE,  -- modelo não se apaga: desativa (o histórico aponta para ele)
    atualizado_em             TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Configurações de cada usuário (módulo Configuracoes)
CREATE TABLE IF NOT EXISTS configuracoes_usuario (
    usuario_id                  UUID          PRIMARY KEY REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
    chave_api_cifrada           TEXT,          -- Data Protection; nunca em claro
    chave_api_final             VARCHAR(4),    -- 4 últimos caracteres, só para mostrar "sk-ant-...abcd"
    modelo_padrao_id            VARCHAR(80)   REFERENCES modelos_claude(modelo_id),
    limite_mensal_usd           NUMERIC(12,2) CHECK (limite_mensal_usd > 0),  -- NULL = sem limite
    bloquear_ao_atingir_limite  BOOLEAN       NOT NULL DEFAULT TRUE,
    atualizado_em               TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_config_chave_completa CHECK ((chave_api_cifrada IS NULL) = (chave_api_final IS NULL))
);

-- Fallback de recusa (fallbacks: "default" da Anthropic): por modelo, para não fixar nome de modelo no código — ADR-006
ALTER TABLE modelos_claude ADD COLUMN IF NOT EXISTS fallback_recusa BOOLEAN NOT NULL DEFAULT FALSE;

-- Carga inicial dos modelos (preços de 2026-10). Uma vez só: depois disso, o ADMIN mantém a tabela pela tela.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM migracoes_dados WHERE nome = '2026-10-30-modelos-claude-iniciais') THEN
        INSERT INTO modelos_claude (modelo_id, nome_exibicao, preco_entrada_mtok, preco_saida_mtok, preco_cache_leitura_mtok, preco_cache_escrita_mtok)
        VALUES ('claude-fable-5-1',  'Claude Fable 5.1',  10.00, 50.00, 0.25, 12.50),
               ('claude-opus-5-5',   'Claude Opus 5.5',    4.00, 20.00, 0.20,  5.00),
               ('claude-sonnet-5-5', 'Claude Sonnet 5.5',  2.00, 10.00, 0.20,  2.50),
               ('claude-haiku-5-5',  'Claude Haiku 5.5',   0.10,  0.50, 0.01,  0.125)
        ON CONFLICT (modelo_id) DO NOTHING;
        INSERT INTO migracoes_dados (nome) VALUES ('2026-10-30-modelos-claude-iniciais');
    END IF;
END $$;

-- Fallback ligado onde a Anthropic tem fallback no servidor (Fable 5.1, Opus 5.5, Sonnet 5.5; o Haiku 5.5 não tem). Uma vez só.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM migracoes_dados WHERE nome = '2026-10-30-modelos-fallback-recusa') THEN
        UPDATE modelos_claude SET fallback_recusa = TRUE
         WHERE modelo_id IN ('claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5');
        INSERT INTO migracoes_dados (nome) VALUES ('2026-10-30-modelos-fallback-recusa');
    END IF;
END $$;

-- 6. Automações em 1 clique (módulo Automacoes) — prompt-modelo editável pelo ADMIN
CREATE TABLE IF NOT EXISTS automacoes (
    automacao_id     UUID          PRIMARY KEY,
    codigo           VARCHAR(40)   NOT NULL UNIQUE,   -- estável (personagem do Escritório, testes): relatorio-executivo
    nome             VARCHAR(80)   NOT NULL,
    descricao        VARCHAR(300)  NOT NULL,
    prompt_sistema   TEXT          NOT NULL,
    modelo_mensagem  TEXT          NOT NULL CHECK (POSITION('{{entrada}}' IN modelo_mensagem) > 0),
    modelo_id        VARCHAR(80)   REFERENCES modelos_claude(modelo_id),  -- NULL = modelo padrão do usuário
    max_tokens       INTEGER       NOT NULL CHECK (max_tokens BETWEEN 1 AND 64000),
    ativa            BOOLEAN       NOT NULL DEFAULT TRUE,
    ordem            INTEGER       NOT NULL DEFAULT 0,
    atualizada_em    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Log de cada chamada à API da Claude (módulo Consumo). O preço usado fica congelado na linha — ADR-007
CREATE TABLE IF NOT EXISTS consumo_chamadas (
    chamada_id                UUID          PRIMARY KEY,
    usuario_id                UUID          NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
    automacao_id              UUID          REFERENCES automacoes(automacao_id),
    automacao_nome            VARCHAR(80),  -- nome na época (o ranking não muda se o fluxo for renomeado)
    modelo_id                 VARCHAR(80)   NOT NULL,  -- pedido
    modelo_usado              VARCHAR(80),             -- o que respondeu (pode ser o fallback)
    tokens_entrada            INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_entrada >= 0),
    tokens_saida              INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_saida >= 0),
    tokens_cache_leitura      INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_cache_leitura >= 0),
    tokens_cache_escrita      INTEGER       NOT NULL DEFAULT 0 CHECK (tokens_cache_escrita >= 0),
    tokens_total              INTEGER       GENERATED ALWAYS AS
                                  (tokens_entrada + tokens_saida + tokens_cache_leitura + tokens_cache_escrita) STORED,
    preco_entrada_mtok        NUMERIC(12,4),
    preco_saida_mtok          NUMERIC(12,4),
    preco_cache_leitura_mtok  NUMERIC(12,4),
    preco_cache_escrita_mtok  NUMERIC(12,4),
    custo_usd                 NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK (custo_usd >= 0),
    duracao_ms                INTEGER       NOT NULL CHECK (duracao_ms >= 0),
    status                    VARCHAR(20)   NOT NULL CHECK (status IN ('SUCESSO', 'ERRO', 'RECUSADA')),
    erro_codigo               VARCHAR(60),
    motivo_parada             VARCHAR(30),  -- stop_reason da Anthropic (end_turn, max_tokens, refusal...)
    nome_arquivo              VARCHAR(200),
    resultado                 TEXT,         -- a resposta (para reabrir no histórico); a entrada NÃO é guardada
    iniciada_em               TIMESTAMPTZ   NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_consumo_usuario_data ON consumo_chamadas (usuario_id, iniciada_em DESC);

-- Carga inicial das automações. Uma vez só: depois, o ADMIN edita pela tela.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM migracoes_dados WHERE nome = '2026-10-30-automacoes-iniciais') THEN
        INSERT INTO automacoes (automacao_id, codigo, nome, descricao, prompt_sistema, modelo_mensagem, modelo_id, max_tokens, ordem)
        VALUES
        ('a1e5c1a0-0000-4000-8000-000000000001', 'relatorio-executivo', 'Gerar Relatório Executivo',
         'Transforma anotações, dados ou um texto longo em um relatório executivo claro para a diretoria.',
         'Você é um analista sênior que escreve relatórios executivos em português do Brasil para diretores ocupados. '
         || 'Seja objetivo, use números quando o material tiver, aponte riscos e recomende próximos passos. '
         || 'Não invente dados que não estejam no material; quando faltar informação, diga o que falta. Responda em Markdown.',
         E'Escreva um relatório executivo a partir do material abaixo, com as seções: Resumo (até 5 linhas), Principais pontos, '
         || E'Riscos e pendências, Recomendações e Próximos passos.\n\n<material>\n{{entrada}}\n</material>',
         'claude-opus-5-5', 8000, 1),
        ('a1e5c1a0-0000-4000-8000-000000000002', 'analisar-codigo', 'Analisar Código',
         'Revisa um trecho de código: bugs, segurança, legibilidade e sugestões de melhoria.',
         'Você é um engenheiro de software sênior fazendo revisão de código. Escreva em português do Brasil. '
         || 'Priorize problemas reais (bugs, falhas de segurança, condições de corrida, tratamento de erro) antes de estilo. '
         || 'Para cada achado, cite o trecho, explique o impacto e mostre a correção. Responda em Markdown.',
         E'Revise o código abaixo. Comece com um resumo do que ele faz e uma nota geral; depois liste os achados do mais grave '
         || E'para o menos grave e termine com melhorias opcionais.\n\n<codigo>\n{{entrada}}\n</codigo>',
         'claude-opus-5-5', 8000, 2),
        ('a1e5c1a0-0000-4000-8000-000000000003', 'resumir-documento', 'Resumir Documento',
         'Resume um documento longo em tópicos, com as decisões e os números importantes.',
         'Você resume documentos em português do Brasil com fidelidade: não acrescente opiniões nem fatos que não estejam no texto. '
         || 'Responda em Markdown.',
         E'Resuma o documento abaixo com: uma frase que diga do que ele trata, os pontos principais em tópicos, '
         || E'as decisões e os números importantes e as dúvidas que ficaram em aberto.\n\n<documento>\n{{entrada}}\n</documento>',
         'claude-haiku-5-5', 4000, 3)
        ON CONFLICT (codigo) DO NOTHING;
        INSERT INTO migracoes_dados (nome) VALUES ('2026-10-30-automacoes-iniciais');
    END IF;
END $$;

COMMIT;
