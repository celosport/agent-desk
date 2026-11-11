import { LIBERAR_MS, RESULTADO_MS, avancar, descreverFase, novoAgente } from './agente';
import { MAXIMO_AGENTES, apelidoDeSessao, lugarDe, paletaDe, personagemDe } from './personagens';
import { sincronizarSessao } from './sessao';
import { LUGAR_AGUA, LUGAR_CAFE } from './vida';

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

  it('esperando você (aprovação): vai à cozinha tomar um café ou uma água, com o alerta no balão, e volta à mesa quando responde', () => {
    let a = sincronizarSessao(parado(), 'TRABALHANDO', '💻 Rodando npm test', 0, false);
    a = rodar(a, 0, 6000);
    expect(a.fase).toBe('PENSANDO');

    a = sincronizarSessao(a, 'ESPERANDO_VOCE', '✋ Precisa de você: aprovar permissão', 6000, false);
    expect(a.fase).toBe('PAUSA_INDO');
    expect(a.pausa === 'CAFE' || a.pausa === 'AGUA').toBe(true);
    expect(a.balao?.tipo).toBe('alerta');
    a = rodar(a, 6000, 20000);
    expect(a.fase).toBe('PAUSA');
    expect(a.posicao).toEqual(a.pausa === 'CAFE' ? LUGAR_CAFE : LUGAR_AGUA);
    expect(descreverFase(a)).toContain('esperando você');
    expect(sincronizarSessao(a, 'ESPERANDO_VOCE', '✋ Precisa de você: aprovar permissão', 20100, false)).toBe(a); // continua lá

    a = sincronizarSessao(a, 'TRABALHANDO', '✏️ Editando app.ts', 21000, false);
    expect(a.fase).toBe('INDO');
    expect(a.pausa).toBeNull();
    a = rodar(a, 21000, 40000);
    expect(a.fase).toBe('PENSANDO');
    expect(a.posicao).toEqual(lugar.mesa);
  });

  it('terminou enquanto esperava na cozinha: mostra "terminou" e vai embora pelo elevador', () => {
    let a = sincronizarSessao(parado(), 'ESPERANDO_VOCE', '✋ Precisa de você', 0, false);
    a = rodar(a, 0, 20000);
    expect(a.fase).toBe('PAUSA');
    a = sincronizarSessao(a, 'OCIOSA', '✅ Terminou', 21000, false);
    expect(a.fase).toBe('RESULTADO');
    a = rodar(a, 21000, 21000 + LIBERAR_MS + 100);
    expect(a.fase).toBe('INDO_EMBORA');
  });

  it('esperando você: balão de alerta na mesa', () => {
    const a = sincronizarSessao(parado(), 'ESPERANDO_VOCE', '✋ Precisa de você: aprovar permissão', 0, true);
    expect(a.posicao).toEqual(lugar.mesa);
    expect(a.balao?.tipo).toBe('alerta');
  });

  it('ociosa: mostra "terminou" por alguns segundos e vai embora pelo elevador (sem andar: some direto)', () => {
    let a = sincronizarSessao(parado(), 'TRABALHANDO', undefined, 0, true);
    a = sincronizarSessao(a, 'OCIOSA', '✅ Terminou', 1000, true);
    expect(a.fase).toBe('RESULTADO');
    expect(a.balao).toEqual({ tipo: 'resultado', texto: '✅ Terminou' });

    a = avancar(a, 1000 + LIBERAR_MS - 100, 50, true);
    expect(a.fase).toBe('RESULTADO');
    a = avancar(a, 1000 + LIBERAR_MS, 50, true);
    expect(a.fase).toBe('AUSENTE');
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
