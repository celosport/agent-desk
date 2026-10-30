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

COMMIT;
