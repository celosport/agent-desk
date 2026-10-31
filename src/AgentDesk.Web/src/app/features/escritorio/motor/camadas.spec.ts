import { ACESSORIOS, ANTENAS, EXPRESSOES, SPRITES, SPRITE_A, SPRITE_L, montarSprite, paletaDeCores, personagemDe } from './personagens';

const padrao = { antena: 'RETA', expressao: 'NORMAL', acessorio: 'NENHUM' } as const;

describe('robô em camadas', () => {
  it('a aparência padrão monta exatamente o sprite original', () => {
    expect(montarSprite(padrao, 'parado')).toEqual(SPRITES.parado);
    expect(montarSprite(padrao, 'andando')).toEqual(SPRITES.andando);
    expect(montarSprite(padrao, 'piscando')).toEqual(SPRITES.piscando);
  });

  it('toda combinação tem o tamanho certo e só usa letras da paleta', () => {
    const letras = Object.keys(paletaDeCores('#000000', '#000000', '#000000', '#000000'));
    for (const antena of ANTENAS)
      for (const expressao of EXPRESSOES)
        for (const acessorio of ACESSORIOS)
          for (const quadro of ['parado', 'andando', 'piscando'] as const) {
            const sprite = montarSprite({ antena, expressao, acessorio }, quadro);
            expect(sprite).toHaveLength(SPRITE_A);
            for (const linha of sprite) {
              expect(linha).toHaveLength(SPRITE_L);
              for (const c of linha) if (c !== '.') expect(letras).toContain(c);
            }
          }
  });

  it('cada opção muda o desenho', () => {
    const base = montarSprite(padrao, 'parado').join();
    for (const antena of ANTENAS.filter((a) => a !== 'RETA')) expect(montarSprite({ ...padrao, antena }, 'parado').join()).not.toBe(base);
    for (const expressao of EXPRESSOES.filter((e) => e !== 'NORMAL')) expect(montarSprite({ ...padrao, expressao }, 'parado').join()).not.toBe(base);
    for (const acessorio of ACESSORIOS.filter((a) => a !== 'NENHUM')) expect(montarSprite({ ...padrao, acessorio }, 'parado').join()).not.toBe(base);
  });

  it('piscar fecha os olhos em qualquer expressão', () => {
    for (const expressao of EXPRESSOES) {
      const olhos = montarSprite({ ...padrao, expressao }, 'piscando').slice(3, 6).join('');
      expect(olhos).not.toContain('d');
    }
  });

  it('automações da carga inicial seguem sem acessório, com antena reta e expressão normal', () => {
    const { antena, expressao, acessorio } = personagemDe('relatorio-executivo');
    expect({ antena, expressao, acessorio }).toEqual(padrao);
  });
});
