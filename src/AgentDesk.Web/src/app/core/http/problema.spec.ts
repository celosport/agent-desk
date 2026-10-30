import { HttpErrorResponse } from '@angular/common/http';
import { codigoDeErro, mensagemDeErro } from './problema';

describe('problema (problem+json → tela)', () => {
  const resposta = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

  it('usa a primeira mensagem de validação por campo', () => {
    expect(mensagemDeErro(resposta(400, { title: 'Dados inválidos.', errors: { titulo: ['Informe o título.'] } }))).toBe('Informe o título.');
  });

  it('usa o título do erro de negócio e expõe o code estável', () => {
    const erro = resposta(409, { title: 'Já existe um modelo com este id.', code: 'Modelos.JaExiste' });
    expect(mensagemDeErro(erro)).toBe('Já existe um modelo com este id.');
    expect(codigoDeErro(erro)).toBe('Modelos.JaExiste');
  });

  it('sem conexão e erro interno viram frases claras (nunca o texto técnico)', () => {
    expect(mensagemDeErro(resposta(0))).toContain('Sem conexão');
    expect(mensagemDeErro(resposta(500, { title: 'Internal Server Error' }))).toContain('problema no servidor');
    expect(mensagemDeErro(new Error('x'))).toBe('Algo deu errado. Tente de novo.');
  });

  it('503 com code (serviço externo fora) mostra o texto da API; sem code, a frase genérica', () => {
    const fora = resposta(503, { title: 'A API da Anthropic não respondeu.', code: 'Anthropic.Indisponivel' });
    expect(mensagemDeErro(fora)).toBe('A API da Anthropic não respondeu.');
    expect(mensagemDeErro(resposta(503, { title: 'Service Unavailable' }))).toContain('problema no servidor');
  });
});
