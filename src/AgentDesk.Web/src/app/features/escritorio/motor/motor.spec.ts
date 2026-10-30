import {
  BALAO_PENSANDO,
  PENSANDO_MINIMO_MS,
  RESULTADO_MS,
  avancar,
  concluirTarefa,
  descreverFase,
  iniciarTarefa,
  novoAgente,
  ocupado,
} from './agente';
import { andar, escalaPara, paraTela, profundidade, rota } from './iso';
import { PERSONAGENS, SPRITES, SPRITE_A, SPRITE_L, lugarDe, personagemDe } from './personagens';

describe('iso', () => {
  it('projeção isométrica: x anda para baixo-direita, y para baixo-esquerda', () => {
    const o = paraTela({ x: 0, y: 0 });
    expect(paraTela({ x: 1, y: 0 })).toEqual({ x: o.x + 16, y: o.y + 8 });
    expect(paraTela({ x: 0, y: 1 })).toEqual({ x: o.x - 16, y: o.y + 8 });
    expect(profundidade({ x: 2, y: 3 })).toBeGreaterThan(profundidade({ x: 3, y: 1 }));
  });

  it('rota em L, ladrilho a ladrilho, sem o ponto de partida', () => {
    expect(rota({ x: 5, y: 6 }, { x: 3, y: 2 })).toEqual([
      { x: 4, y: 6 },
      { x: 3, y: 6 },
      { x: 3, y: 5 },
      { x: 3, y: 4 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ]);
    expect(rota({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('andar consome a distância sobre a rota, atravessando ladrilhos', () => {
    const r = andar({ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 1, y: 1 }], 1.5);
    expect(r.posicao).toEqual({ x: 1, y: 0.5 });
    expect(r.caminho).toEqual([{ x: 1, y: 1 }]);
  });

  it('escala inteira (pixel art nítida), no mínimo 1', () => {
    expect(escalaPara(100)).toBe(1);
    expect(escalaPara(900)).toBe(3);
  });
});

describe('agente', () => {
  const lugar = lugarDe(0);
  const parado = () => novoAgente('relatorio-executivo', lugar.canto, lugar.mesa);
  const resultado = { tipo: 'resultado' as const, texto: '1.800 tokens · US$ 0,0145' };

  /** Avança o tempo em passos de 50 ms (como os quadros da animação). */
  function rodar(a: ReturnType<typeof parado>, de: number, ate: number, reduzido = false) {
    let atual = a;
    for (let t = de + 50; t <= ate; t += 50) atual = avancar(atual, t, 50, reduzido);
    return atual;
  }

  it('anda até a mesa, pensa e mostra o resultado que chegou no caminho', () => {
    let a = iniciarTarefa(parado(), 0, false);
    expect(a.fase).toBe('INDO');
    expect(ocupado(a)).toBe(true);
    a = concluirTarefa(a, resultado, 300); // a API respondeu antes de ele sentar
    expect(a.fase).toBe('INDO');

    a = rodar(a, 0, 3000); // do canto (5,6) à mesa (1,2): 8 ladrilhos a 3/s ≈ 2,7 s
    expect(a.posicao).toEqual(lugar.mesa);
    expect(a.fase).toBe('PENSANDO');
    expect(a.balao).toEqual(BALAO_PENSANDO);

    a = rodar(a, 3000, 3000 + PENSANDO_MINIMO_MS + 50);
    expect(a.fase).toBe('RESULTADO');
    expect(a.balao).toEqual(resultado);
    expect(descreverFase(a)).toBe('terminou: 1.800 tokens · US$ 0,0145');
  });

  it('o balão "pensando…" fica pelo menos o mínimo, mesmo com resposta rápida', () => {
    let a = iniciarTarefa({ ...parado(), posicao: lugar.mesa }, 1000, false); // já está na mesa
    expect(a.fase).toBe('PENSANDO');
    a = concluirTarefa(a, resultado, 1100);
    expect(a.fase).toBe('PENSANDO');
    a = rodar(a, 1100, 1000 + PENSANDO_MINIMO_MS);
    expect(a.fase).toBe('RESULTADO');
  });

  it('depois do resultado, volta para o canto e fica disponível', () => {
    let a = concluirTarefa(iniciarTarefa(parado(), 0, true), resultado, 5000);
    expect(a.fase).toBe('RESULTADO');
    a = rodar(a, 5000, 5000 + RESULTADO_MS);
    expect(a.fase).toBe('VOLTANDO');
    a = rodar(a, 5000 + RESULTADO_MS, 5000 + RESULTADO_MS + 3000);
    expect(a.fase).toBe('OCIOSO');
    expect(a.posicao).toEqual(lugar.canto);
    expect(ocupado(a)).toBe(false);
  });

  it('com movimento reduzido não anda: aparece na mesa e volta direto para o canto', () => {
    let a = iniciarTarefa(parado(), 0, true);
    expect(a.fase).toBe('PENSANDO');
    expect(a.posicao).toEqual(lugar.mesa);
    a = concluirTarefa(a, { tipo: 'erro', texto: 'A Anthropic recusou a chave.' }, 1000);
    expect(descreverFase(a)).toBe('erro: A Anthropic recusou a chave.');
    a = avancar(a, 1000 + RESULTADO_MS, 50, true);
    expect(a.fase).toBe('OCIOSO');
    expect(a.posicao).toEqual(lugar.canto);
  });

  it('sem mudança, avancar devolve o mesmo objeto', () => {
    const a = parado();
    expect(avancar(a, 100, 50, false)).toBe(a);
  });
});

describe('personagens', () => {
  it('sprites têm o tamanho declarado e só usam cores da paleta', () => {
    for (const sprite of Object.values(SPRITES)) {
      expect(sprite).toHaveLength(SPRITE_A);
      for (const linha of sprite) {
        expect(linha).toHaveLength(SPRITE_L);
        for (const c of linha) if (c !== '.') expect(Object.keys(PERSONAGENS['analisar-codigo'].paleta)).toContain(c);
      }
    }
  });

  it('cada automação da carga inicial tem o seu robô; código novo usa o padrão', () => {
    expect(personagemDe('relatorio-executivo').apelido).toBe('Rel');
    expect(personagemDe('codigo-que-nao-existe').apelido).toBe('Agente');
  });

  it('mesas e cantos diferentes para os três primeiros', () => {
    const lugares = [0, 1, 2].map(lugarDe);
    expect(new Set(lugares.map((l) => `${l.mesa.x},${l.mesa.y}`)).size).toBe(3);
    expect(new Set(lugares.map((l) => `${l.canto.x},${l.canto.y}`)).size).toBe(3);
  });
});
