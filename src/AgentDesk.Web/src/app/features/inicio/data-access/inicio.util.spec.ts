import { estadoDoLimite, nivelDaJanela, passosIniciais, resumirAoVivo, ultimosDias, diaCurto } from './inicio.util';

const sala = (nome: string, ...status: string[]) => ({ chave: nome, nome, sessoes: status.map((s, i) => ({ sessaoId: `${nome}${i}`, status: s })) });

describe('Início · util', () => {
  it('conta trabalhando, esperando e ativas; encerrada não conta; lista as salas que esperam', () => {
    const r = resumirAoVivo({ projetos: [sala('api', 'TRABALHANDO', 'ESPERANDO_VOCE', 'ENCERRADA'), sala('web', 'OCIOSA', 'TRABALHANDO')] });
    expect(r).toEqual({ trabalhando: 2, esperando: 1, ativas: 4, salasEsperando: ['api'] });
  });

  it('sem dados do ao vivo, tudo zero', () => {
    expect(resumirAoVivo(null)).toEqual({ trabalhando: 0, esperando: 0, ativas: 0, salasEsperando: [] });
  });

  it('limite: alerta a partir de 80%, estourado a partir de 100%', () => {
    expect([undefined, 79, 80, 99, 100, 130].map(estadoDoLimite)).toEqual(['ok', 'ok', 'alerta', 'alerta', 'estourado', 'estourado']);
  });

  it('assinatura: laranja a partir de 70%, vermelho a partir de 90%', () => {
    expect([10, 69, 70, 89, 90, 100].map(nivelDaJanela)).toEqual(['ok', 'ok', 'atencao', 'atencao', 'critico', 'critico']);
  });

  it('primeiros passos: cada passo reflete o estado', () => {
    const passos = passosIniciais({ chave: true, claudeCodeConectado: false, rodouAutomacao: false });
    expect(passos.map((p) => [p.id, p.feito])).toEqual([['chave', true], ['claude-code', false], ['automacao', false]]);
    expect(passosIniciais({ chave: true, claudeCodeConectado: true, rodouAutomacao: true }).every((p) => p.feito)).toBe(true);
  });

  it('últimos dias e dia curto', () => {
    expect(ultimosDias([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(ultimosDias([1], 5)).toEqual([1]);
    expect(diaCurto('2026-11-11')).toBe('11/11');
  });
});
