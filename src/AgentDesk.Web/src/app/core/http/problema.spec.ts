import { HttpErrorResponse } from '@angular/common/http';
import { codigoDeErro, mensagemDeErro } from './problema';

describe('problema (problem+json → tela)', () => {
  const resposta = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

  it('usa a primeira mensagem de validação por campo', () => {
    expect(mensagemDeErro(resposta(400, { title: 'Dados inválidos.', errors: { titulo: ['Informe o título.'] } }))).toBe('Informe o título.');
  });

  it('usa o título do erro de negócio e expõe o code estável', () => {
    const erro = resposta(409, { title: 'Esta tarefa já foi concluída.', code: 'Tarefas.JaConcluida' });
    expect(mensagemDeErro(erro)).toBe('Esta tarefa já foi concluída.');
    expect(codigoDeErro(erro)).toBe('Tarefas.JaConcluida');
  });

  it('sem conexão e erro interno viram frases claras (nunca o texto técnico)', () => {
    expect(mensagemDeErro(resposta(0))).toContain('Sem conexão');
    expect(mensagemDeErro(resposta(500, { title: 'Internal Server Error' }))).toContain('problema no servidor');
    expect(mensagemDeErro(new Error('x'))).toBe('Algo deu errado. Tente de novo.');
  });
});
