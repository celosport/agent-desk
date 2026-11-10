import { ACESSORIOS, ANTENAS, EXPRESSOES, QUADROS, SPRITE_A, SPRITE_L, coresDoSprite, montarSprite, paletaDeCores, personagemDe } from './personagens';

const padrao = { antena: 'RETA', expressao: 'NORMAL', acessorio: 'NENHUM' } as const;
const LETRAS = new Set([...Object.keys(paletaDeCores('#000000', '#000000', '#000000', '#000000')), 'B', 'v', 'F', 'w', 'o']);

describe('robô HD em camadas', () => {
  it('toda combinação, quadro e vista tem o tamanho certo e só usa letras conhecidas', () => {
    const erros: string[] = [];
    for (const antena of ANTENAS)
      for (const expressao of EXPRESSOES)
        for (const acessorio of ACESSORIOS)
          for (const quadro of QUADROS)
            for (const cara of ['FRENTE', 'COSTAS'] as const) {
              const sprite = montarSprite({ antena, expressao, acessorio }, quadro, cara);
              const ok = sprite.length === SPRITE_A && sprite.every((l) => l.length === SPRITE_L && [...l].every((c) => c === '.' || LETRAS.has(c)));
              if (!ok) erros.push([antena, expressao, acessorio, quadro, cara].join('/'));
            }
    expect(erros).toEqual([]);
  });

  it('tem contorno escuro em volta do desenho', () => {
    const s = montarSprite(padrao, 'parado').join('');
    expect(s).toContain('o');
    expect(montarSprite(padrao, 'parado')[0].replaceAll('.', '').replaceAll('o', '')).toBe(''); // a linha de cima só tem o contorno da antena
    expect(montarSprite({ ...padrao, antena: 'NENHUMA' }, 'parado')[0]).toBe('.'.repeat(SPRITE_L));
  });

  it('cada opção muda o desenho', () => {
    const base = montarSprite(padrao, 'parado').join();
    for (const antena of ANTENAS.filter((a) => a !== 'RETA')) expect(montarSprite({ ...padrao, antena }, 'parado').join()).not.toBe(base);
    for (const expressao of EXPRESSOES.filter((e) => e !== 'NORMAL')) expect(montarSprite({ ...padrao, expressao }, 'parado').join()).not.toBe(base);
    for (const acessorio of ACESSORIOS.filter((a) => a !== 'NENHUM')) expect(montarSprite({ ...padrao, acessorio }, 'parado').join()).not.toBe(base);
  });

  it('o ciclo de caminhada tem 4 quadros distintos (pés e braços trocam) e a comemoração levanta os braços', () => {
    const passos = (['passo0', 'passo1', 'passo2', 'passo3'] as const).map((q) => montarSprite(padrao, q).join());
    expect(passos[0]).not.toBe(passos[2]);
    expect(passos[0]).not.toBe(passos[1]);
    expect(passos[1]).toBe(passos[3]); // passagem de pernas: igual dos dois lados
    expect(montarSprite(padrao, 'digita0').join()).not.toBe(montarSprite(padrao, 'digita1').join());
    expect(montarSprite(padrao, 'parado', 'FRENTE', 0, true).join()).not.toBe(montarSprite(padrao, 'parado').join());
  });

  it('de costas não mostra o rosto, e o olhar desloca os olhos', () => {
    const frente = montarSprite(padrao, 'parado', 'FRENTE').join('');
    const costas = montarSprite(padrao, 'parado', 'COSTAS').join('');
    expect(frente).toContain('d');
    expect(costas).not.toContain('d');
    expect(montarSprite(padrao, 'parado', 'FRENTE', 1).join()).not.toBe(montarSprite(padrao, 'parado', 'FRENTE', -1).join());
  });

  it('piscar fecha os olhos em qualquer expressão', () => {
    for (const expressao of EXPRESSOES) {
      const aberto = montarSprite({ ...padrao, expressao }, 'parado').join();
      const fechado = montarSprite({ ...padrao, expressao }, 'piscando').join();
      expect(fechado).not.toBe(aberto);
      // nas linhas dos olhos abertos (8 e 9) não sobra olho
      expect(montarSprite({ ...padrao, expressao }, 'piscando').slice(8, 10).join('')).not.toContain('d');
    }
  });

  it('luz e sombra derivam da cor do personagem', () => {
    const c = coresDoSprite(paletaDeCores('#3366cc', '#224488', '#ffcc00', '#ffffff'));
    expect(c['b']).toBe('#3366cc');
    expect(c['B']).not.toBe(c['b']);
    expect(c['v']).not.toBe(c['b']);
    expect(c['o']).toMatch(/^#/);
  });

  it('automações da carga inicial seguem sem acessório, com antena reta e expressão normal', () => {
    const { antena, expressao, acessorio } = personagemDe('relatorio-executivo');
    expect({ antena, expressao, acessorio }).toEqual(padrao);
  });
});
