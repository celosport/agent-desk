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
import { ELEVADOR_PE, LUGAR_CAFE, rotaPelaAvenida } from './vida';
import { PERSONAGENS, QUADROS, SPRITE_A, SPRITE_L, lugarDe, montarSprite, personagemDe } from './personagens';

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

  it('depois do resultado, vai ao elevador, bate o crachá e vai embora; segue disponível para a próxima tarefa', () => {
    let a = concluirTarefa(iniciarTarefa(parado(), 0, true), resultado, 5000);
    expect(a.fase).toBe('RESULTADO');
    a = rodar(a, 5000, 5000 + RESULTADO_MS);
    expect(a.fase).toBe('INDO_EMBORA');
    expect(a.balao).toBeNull();
    let t = 5000 + RESULTADO_MS;
    const fases: string[] = [a.fase];
    while (a.fase !== 'AUSENTE' && t < 60000) {
      t += 50;
      a = avancar(a, t, 50, false);
      if (fases[fases.length - 1] !== a.fase) fases.push(a.fase);
    }
    expect(fases).toEqual(['INDO_EMBORA', 'CRACHA', 'ELEVADOR', 'AUSENTE']);
    expect(a.posicao).toEqual(ELEVADOR_PE);
    expect(ocupado(a)).toBe(false);
    expect(descreverFase(a)).toBe('foi embora (ponto batido)');
  });

  it('quem foi embora volta pelo elevador quando chega tarefa e anda até a mesa', () => {
    const embora = { ...parado(), fase: 'AUSENTE' as const, posicao: { ...ELEVADOR_PE } };
    let a = iniciarTarefa(embora, 20000, false);
    expect(a.fase).toBe('INDO');
    expect(a.chegouEm).toBe(20000);
    expect(a.posicao).toEqual(ELEVADOR_PE);
    a = rodar(a, 20000, 40000);
    expect(a.fase).toBe('PENSANDO');
    expect(a.posicao).toEqual(lugar.mesa);
    expect(iniciarTarefa(embora, 20000, true)).toMatchObject({ fase: 'PENSANDO', chegouEm: null }); // reduzido: aparece na mesa
  });

  it('a rota pela avenida nunca atravessa as mesas: desce pela coluna até a fileira de baixo', () => {
    const r = rotaPelaAvenida({ x: 3, y: 2 }, ELEVADOR_PE);
    expect(r.slice(0, 3)).toEqual([{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 }]);
    expect(r[r.length - 1]).toEqual(ELEVADOR_PE);
    // quem já está na frente da sala usa a rota normal
    expect(rotaPelaAvenida({ x: 5, y: 6 }, ELEVADOR_PE)).toEqual(rota({ x: 5, y: 6 }, ELEVADOR_PE));
    // da cozinha de volta para uma mesa: desce à avenida, segue e sobe pela coluna da mesa
    const volta = rotaPelaAvenida(LUGAR_CAFE, { x: 1, y: 2 });
    expect(volta[0]).toEqual({ x: 6, y: 5 });
    expect(volta[volta.length - 1]).toEqual({ x: 1, y: 2 });
  });

  it('com movimento reduzido não anda: aparece na mesa e some direto ao terminar', () => {
    let a = iniciarTarefa(parado(), 0, true);
    expect(a.fase).toBe('PENSANDO');
    expect(a.posicao).toEqual(lugar.mesa);
    a = concluirTarefa(a, { tipo: 'erro', texto: 'A Anthropic recusou a chave.' }, 1000);
    expect(descreverFase(a)).toBe('erro: A Anthropic recusou a chave.');
    a = avancar(a, 1000 + RESULTADO_MS, 50, true);
    expect(a.fase).toBe('AUSENTE');
  });

  it('sem mudança, avancar devolve o mesmo objeto', () => {
    const a = avancar(parado(), 100, 50, false); // o 1º quadro só agenda a próxima vontade do robô
    expect(avancar(a, 150, 50, false)).toBe(a);
  });
});

describe('personagens', () => {
  it('sprites têm o tamanho declarado e só usam cores da paleta', () => {
    const letras = [...Object.keys(PERSONAGENS['analisar-codigo'].paleta), 'B', 'v', 'F', 'w', 'o'];
    for (const quadro of QUADROS) {
      const sprite = montarSprite(personagemDe('analisar-codigo'), quadro);
      expect(sprite).toHaveLength(SPRITE_A);
      for (const linha of sprite) {
        expect(linha).toHaveLength(SPRITE_L);
        for (const c of linha) if (c !== '.') expect(letras).toContain(c);
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
