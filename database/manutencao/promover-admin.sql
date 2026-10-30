-- Transforma uma conta em ADMIN (rode no DBeaver; troque o e-mail).
UPDATE usuarios SET tipo_perfil = 'ADMIN' WHERE lower(email) = lower('troque-aqui@exemplo.com');
SELECT usuario_id, nome, email, tipo_perfil FROM usuarios WHERE tipo_perfil = 'ADMIN';
