import { lerPreferencia, resolverTema } from './tema';

describe('tema', () => {
  it('valor salvo desconhecido vira "Automático"', () => {
    expect(lerPreferencia('escuro')).toBe('escuro');
    expect(lerPreferencia('roxo')).toBe('sistema');
    expect(lerPreferencia(null)).toBe('sistema');
  });

  it('"Automático" segue o aparelho; escolha explícita vence', () => {
    expect(resolverTema('sistema', true)).toBe('escuro');
    expect(resolverTema('sistema', false)).toBe('claro');
    expect(resolverTema('claro', true)).toBe('claro');
  });
});
