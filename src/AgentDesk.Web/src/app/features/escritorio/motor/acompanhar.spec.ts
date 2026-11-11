import { avancar, iniciarTarefa, novoAgente } from './agente';
import { acompanhar } from './acompanhar';
import { FOCOS, LUGARES, regiaoDoFoco } from './mapa';
import { CENA_A, CENA_L } from './iso';
import { ELEVADOR_PE } from './vida';
import { lugarDe } from './personagens';

const lugar = lugarDe(0);
const novo = () => novoAgente('robo', lugar.canto, lugar.mesa);

describe('acompanhar: quem está onde e fazendo o quê', () => {
  it('disponível no escritório, no canto', () => {
    expect(acompanhar(novo())).toMatchObject({ onde: 'Escritório', oque: 'disponível' });
  });

  it('indo para a mesa e trabalhando nela', () => {
    let a = iniciarTarefa(novo(), 0, false);
    expect(acompanhar(a).oque).toBe('indo para a mesa');
    for (let t = 50; t <= 8000; t += 50) a = avancar(a, t, 50, false);
    expect(acompanhar(a)).toMatchObject({ onde: 'Escritório', oque: 'trabalhando na mesa' });
  });

  it('em cada ambiente do andar, com o que faz', () => {
    const parado = (motivo: 'CAFE' | 'PIA' | 'SOFA' | 'BANHEIRO', posicao: { x: number; y: number }) =>
      acompanhar({ ...novo(), posicao, vida: { acao: 'PARADO', motivo, desde: 0, ate: 1, parado: 1, contador: 1 } });
    expect(parado('CAFE', LUGARES.cafe)).toMatchObject({ onde: 'Cozinha', oque: 'tomando um café' });
    expect(parado('PIA', LUGARES.pia)).toMatchObject({ onde: 'Banheiro', oque: 'lavando as mãos' });
    expect(parado('BANHEIRO', LUGARES.cabine)).toMatchObject({ onde: 'Banheiro', oque: 'no banheiro' });
    expect(parado('SOFA', LUGARES.sofa[1])).toMatchObject({ onde: 'Sala de descanso', oque: 'assistindo TV no sofá' });
    const indo = acompanhar({ ...novo(), posicao: { x: 9, y: 3 }, vida: { acao: 'INDO', motivo: 'SOFA', desde: 0, ate: 0, parado: 1, contador: 1 } });
    expect(indo).toMatchObject({ onde: 'Corredor', oque: 'indo descansar no sofá' });
  });

  it('esperando uma aprovação e depois que foi embora pelo elevador', () => {
    const pausa = acompanhar({ ...novo(), fase: 'PAUSA', pausa: 'SOFA', posicao: { ...LUGARES.sofa[0] } });
    expect(pausa).toMatchObject({ onde: 'Sala de descanso', oque: 'no sofá, esperando você' });
    expect(acompanhar({ ...novo(), fase: 'AUSENTE', posicao: { ...ELEVADOR_PE } })).toMatchObject({ onde: 'Fora do andar', ambiente: null });
    expect(acompanhar({ ...novo(), fase: 'CRACHA', posicao: { ...ELEVADOR_PE } }).oque).toBe('batendo o crachá');
  });
});

describe('câmera por ambiente', () => {
  it('o andar todo é a cena inteira; cada ambiente é um recorte que cabe nela e é menor', () => {
    expect(regiaoDoFoco('TUDO')).toEqual({ x: 0, y: 0, l: CENA_L, a: CENA_A });
    for (const { foco } of FOCOS.filter((f) => f.foco !== 'TUDO')) {
      const r = regiaoDoFoco(foco);
      expect(r.x, foco).toBeGreaterThanOrEqual(0);
      expect(r.y, foco).toBeGreaterThanOrEqual(0);
      expect(r.x + r.l, foco).toBeLessThanOrEqual(CENA_L);
      expect(r.y + r.a, foco).toBeLessThanOrEqual(CENA_A);
      expect(r.l * r.a, foco).toBeLessThan(CENA_L * CENA_A);
    }
  });
});
