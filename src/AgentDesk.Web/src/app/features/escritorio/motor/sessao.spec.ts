import { LIBERAR_MS, RESULTADO_MS, avancar, novoAgente } from './agente';
import { MAXIMO_AGENTES, apelidoDeSessao, lugarDe, paletaDe, personagemDe } from './personagens';
import { sincronizarSessao } from './sessao';

describe('sessão do Claude Code → robô', () => {
  const lugar = lugarDe(4);
  const parado = () => novoAgente('sessao-1', lugar.canto, lugar.mesa);

  function rodar(a: ReturnType<typeof parado>, de: number, ate: number, reduzido = false) {
    let atual = a;
    for (let t = de + 50; t <= ate; t += 50) atual = avancar(atual, t, 50, reduzido);
    return atual;
  }

  it('trabalhando: vai para a mesa e mostra a atividade (não "pensando…")', () => {
    let a = sincronizarSessao(parado(), 'TRABALHANDO', '📖 Lendo api.ts', 0, false);
    expect(a.fase).toBe('INDO');
    a = rodar(a, 0, 4000);
    expect(a.fase).toBe('PENSANDO');
    expect(a.posicao).toEqual(lugar.mesa);
    expect(a.balao).toEqual({ tipo: 'atividade', texto: '📖 Lendo api.ts' });

    const igual = sincronizarSessao(a, 'TRABALHANDO', '📖 Lendo api.ts', 4100, false);
    expect(igual).toBe(a); // nada mudou, mesmo objeto
    expect(sincronizarSessao(a, 'TRABALHANDO', '💻 Rodando npm test', 4200, false).balao?.texto).toBe('💻 Rodando npm test');
  });

  it('esperando você: balão de alerta na mesa', () => {
    const a = sincronizarSessao(parado(), 'ESPERANDO_VOCE', '✋ Precisa de você: aprovar permissão', 0, true);
    expect(a.posicao).toEqual(lugar.mesa);
    expect(a.balao?.tipo).toBe('alerta');
  });

  it('ociosa: mostra "terminou" por alguns segundos e volta para o canto', () => {
    let a = sincronizarSessao(parado(), 'TRABALHANDO', undefined, 0, true);
    a = sincronizarSessao(a, 'OCIOSA', '✅ Terminou', 1000, true);
    expect(a.fase).toBe('RESULTADO');
    expect(a.balao).toEqual({ tipo: 'resultado', texto: '✅ Terminou' });

    a = avancar(a, 1000 + LIBERAR_MS - 100, 50, true);
    expect(a.fase).toBe('RESULTADO');
    a = avancar(a, 1000 + LIBERAR_MS, 50, true);
    expect(a.fase).toBe('OCIOSO');
    expect(a.posicao).toEqual(lugar.canto);
    expect(LIBERAR_MS).toBeLessThan(RESULTADO_MS);
  });

  it('voltou a trabalhar enquanto mostrava o "terminou": volta para a mesa', () => {
    let a = sincronizarSessao(parado(), 'TRABALHANDO', undefined, 0, true);
    a = sincronizarSessao(a, 'OCIOSA', undefined, 1000, true);
    a = sincronizarSessao(a, 'TRABALHANDO', '✏️ Editando app.ts', 1500, true);
    expect(a.fase).toBe('PENSANDO');
    expect(a.balao?.texto).toBe('✏️ Editando app.ts');
  });

  it('robôs das sessões: 8 lugares, apelido e cor estáveis pelo id', () => {
    expect(MAXIMO_AGENTES).toBe(8);
    const mesas = new Set(Array.from({ length: 8 }, (_, i) => `${lugarDe(i).mesa.x},${lugarDe(i).mesa.y}`));
    expect(mesas.size).toBe(8);
    expect(apelidoDeSessao('abc')).toBe(apelidoDeSessao('abc'));
    expect(paletaDe('abc')).toEqual(paletaDe('abc'));
    expect(personagemDe('sessao-qualquer').paleta).toEqual(paletaDe('sessao-qualquer'));
  });
});
