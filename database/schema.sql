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

-- 2. Tarefas (módulo de exemplo)
CREATE TABLE IF NOT EXISTS tarefas (
    tarefa_id     UUID PRIMARY KEY,
    usuario_id    UUID NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
    titulo        VARCHAR(120) NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDA')),
    criada_em     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluida_em  TIMESTAMPTZ,
    CONSTRAINT ck_tarefa_concluida_tem_data CHECK (status <> 'CONCLUIDA' OR concluida_em IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_tarefas_usuario ON tarefas (usuario_id, criada_em DESC);

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

COMMIT;
