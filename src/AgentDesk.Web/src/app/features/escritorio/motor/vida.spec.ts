import { Agente, avancar, concluirTarefa, iniciarTarefa, novoAgente } from './agente';
import { lugarDe } from './personagens';
import { ACORDAR_MS, COMEMORAR_MS, andandoAgora, desvios, estadoDoElevador, poseDe } from './pose';
import { ELEVADOR_PE, escolherPasseio, esperaOciosa, fatorDeVelocidade, restante, sorteio } from './vida';

const lugar = lugarDe(0);
const novo = (codigo = 'relatorio-executivo') => novoAgente(codigo, lugar.canto, lugar.mesa);

/** Avança em passos de 50 ms, como os quadros da animação. */
function rodar(a: Agente, de: number, ate: number, reduzido = false): Agente {
  let atual = a;
  for (let t = de + 50; t <= ate; t += 50) atual = avancar(atual, t, 50, reduzido);
  return atual;
}

describe('vida do robô ocioso', () => {
  it('o sorteio é determinístico e a espera fica entre 6 e 14 s', () => {
    expect(sorteio('a', 1)).toBe(sorteio('a', 1));
    expect(sorteio('a', 1)).not.toBe(sorteio('a', 2));
    for (let n = 0; n < 50; n++) {
      const e = esperaOciosa('robo', n);
      expect(e).toBeGreaterThanOrEqual(6000);
      expect(e).toBeLessThan(14000);
    }
  });

  it('os passeios cobrem janela, bebedouro, espreguiçar e olhar ao redor, sempre em ladrilhos livres do salão', () => {
    const motivos = new Set<string>();
    for (let n = 0; n < 200; n++) {
      const p = escolherPasseio('qualquer', n);
      motivos.add(p.motivo);
      if (p.destino) {
        expect(p.destino.y).toBeGreaterThanOrEqual(5);
        expect(p.destino.y).toBeLessThanOrEqual(7);
        expect(p.destino.x).toBeGreaterThanOrEqual(0);
        expect(p.destino.x).toBeLessThanOrEqual(7);
      }
    }
    expect([...motivos].sort()).toEqual(['BEBEDOURO', 'ESPREGUICAR', 'JANELA', 'OLHAR_AO_REDOR']);
  });

  it('depois da espera sai para passear, fica um tempo no lugar e volta para o canto', () => {
    let a = avancar(novo(), 0, 50, false); // agenda
    expect(a.vida.ate).toBeGreaterThan(5000);
    expect(a.fase).toBe('OCIOSO');

    a = rodar(a, 50, a.vida.ate + 50);
    expect(['INDO', 'PARADO']).toContain(a.vida.acao);

    // anda até o lugar, fica e volta: para no 1º retorno ao canto (antes da vontade seguinte)
    let t = a.vida.ate + 50;
    while (t < 120000 && !(a.vida.acao === 'NENHUMA' && a.vida.contador > 0)) {
      t += 50;
      a = avancar(a, t, 50, false);
    }
    expect(a.vida.acao).toBe('NENHUMA');
    expect(a.posicao).toEqual(lugar.canto);
    expect(a.fase).toBe('OCIOSO');
    expect(a.vida.contador).toBe(1);
  });

  it('com movimento reduzido o robô não passeia', () => {
    const a = rodar(novo(), 0, 60000, true);
    expect(a.posicao).toEqual(lugar.canto);
    expect(a.vida.acao).toBe('NENHUMA');
  });

  it('uma tarefa nova interrompe o passeio e ele vai direto para a mesa', () => {
    let a = avancar(novo(), 0, 50, false);
    a = rodar(a, 50, a.vida.ate + 1500); // no meio do passeio (ou já parado)
    a = iniciarTarefa(a, 20000, false);
    expect(a.fase).toBe('INDO');
    expect(a.vida.acao).toBe('NENHUMA');
    a = rodar(a, 20000, 30000);
    expect(a.posicao).toEqual(lugar.mesa);
    expect(a.fase).toBe('PENSANDO');
  });

  it('a aceleração e a freada nunca zeram a velocidade e ficam entre 0,4 e 1', () => {
    expect(fatorDeVelocidade(0, 5)).toBeCloseTo(0.4);
    expect(fatorDeVelocidade(5000, 0)).toBeCloseTo(0.4);
    expect(fatorDeVelocidade(5000, 5)).toBe(1);
    expect(fatorDeVelocidade(175, 5)).toBeCloseTo(0.9);
  });

  it('restante soma as pernas da rota', () => {
    expect(restante({ x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 1, y: 2 }])).toBe(3);
    expect(restante({ x: 0, y: 0 }, [])).toBe(0);
  });
});

describe('pose', () => {
  it('movimento reduzido: pose parada, sem efeitos', () => {
    const a = iniciarTarefa(novo(), 0, false);
    expect(poseDe(a, 100, true)).toMatchObject({ dx: 0, dy: 0, andando: false, efeito: 'NENHUM' });
  });

  it('andando: balança para cima e para baixo e inclina para o lado em que vai', () => {
    const a = { ...iniciarTarefa(novo(), 0, false), desde: 0 };
    const alturas = new Set<number>();
    for (let t = 1000; t < 1300; t += 20) alturas.add(poseDe(a, t, false).dy);
    expect(alturas.size).toBeGreaterThan(1);
    expect(andandoAgora(a)).toBe(true);
    expect(poseDe(a, 1000, false).andando).toBe(true);
    expect([-1, 1]).toContain(poseDe(a, 1000, false).inclinar);
  });

  it('acorda ao sair: pulinho e onda só nos primeiros ms', () => {
    const a = iniciarTarefa(novo(), 1000, false);
    expect(poseDe(a, 1000 + ACORDAR_MS / 2, false).efeito).toBe('ACORDAR');
    expect(poseDe(a, 1000 + ACORDAR_MS / 2, false).dy).toBeLessThan(-2);
    expect(poseDe(a, 1000 + ACORDAR_MS + 100, false).efeito).toBe('NENHUM');
  });

  it('pensando: digita', () => {
    let a = iniciarTarefa(novo(), 0, true);
    a = rodar(a, 0, 100);
    expect(a.fase).toBe('PENSANDO');
    expect(poseDe(a, 200, false).efeito).toBe('DIGITAR');
  });

  it('terminou com sucesso: comemora com os braços para cima e depois sossega; com erro: balança a cabeça', () => {
    const base = iniciarTarefa(novo(), 0, true);
    const ok = concluirTarefa(base, { tipo: 'resultado', texto: 'ok' }, 1000);
    expect(ok.fase).toBe('RESULTADO');
    const comemorando = poseDe(ok, 1000 + 250, false);
    expect(comemorando).toMatchObject({ efeito: 'COMEMORAR', bracosParaCima: true });
    expect(comemorando.dy).toBeLessThan(0);
    expect(poseDe(ok, 1000 + COMEMORAR_MS + 10, false).efeito).toBe('NENHUM');

    const erro = concluirTarefa(base, { tipo: 'erro', texto: 'falhou' }, 1000);
    expect(poseDe(erro, 1000 + 100, false).efeito).toBe('ERRO');
    expect(poseDe(erro, 1000 + 5000, false).efeito).toBe('NENHUM');
  });

  it('parado no passeio: cada vontade tem a sua pose', () => {
    const parado = (motivo: 'JANELA' | 'BEBEDOURO' | 'ESPREGUICAR' | 'OLHAR_AO_REDOR'): Agente => ({
      ...novo(),
      vida: { acao: 'PARADO', motivo, desde: 0, ate: 3000, parado: 3000, contador: 1 },
    });
    expect(poseDe(parado('BEBEDOURO'), 500, false).efeito).toBe('BEBER');
    expect(poseDe(parado('JANELA'), 500, false).efeito).toBe('JANELA');
    const estica = poseDe(parado('ESPREGUICAR'), 1500, false);
    expect(estica).toMatchObject({ efeito: 'ESPREGUICAR', bracosParaCima: true });
    expect(estica.dy).toBeLessThan(0);
  });
});

describe('desvios', () => {
  it('dois robôs andando um sobre o outro se desviam para lados opostos; quem está longe ou parado não muda', () => {
    const a = { ...iniciarTarefa(novoAgente('a', { x: 1, y: 6 }, { x: 1, y: 2 }), 0, false), posicao: { x: 2, y: 4 } };
    const b = { ...iniciarTarefa(novoAgente('b', { x: 3, y: 7 }, { x: 3, y: 2 }), 0, false), posicao: { x: 2.4, y: 4 } };
    const longe = { ...iniciarTarefa(novoAgente('c', { x: 5, y: 6 }, { x: 5, y: 2 }), 0, false), posicao: { x: 5, y: 5 } };
    const parado = novoAgente('d', { x: 2, y: 4 }, { x: 7, y: 2 });
    const mapa = desvios([a, b, longe, parado]);
    expect(mapa.get('a')).toBe(5);
    expect(mapa.get('b')).toBe(-5);
    expect(mapa.has('c')).toBe(false);
    expect(mapa.has('d')).toBe(false);
  });
});

describe('pose: vista, olhar e quadros do sprite', () => {
  it('andando para o fundo da sala (rumo à mesa) aparece de costas; voltando, de frente olhando para o lado', () => {
    const indo = iniciarTarefa(novo(), 0, false); // canto (5,6) → mesa (1,2): primeiro x diminui (esquerda-cima), depois y
    expect(poseDe(indo, 1000, false).cara).toBe('COSTAS');
    const voltando: Agente = { ...novo(), fase: 'VOLTANDO', posicao: { x: 1, y: 2 }, caminho: [{ x: 1, y: 3 }] }; // y aumenta: desce para a esquerda
    const p = poseDe(voltando, 1000, false);
    expect(p.cara).toBe('FRENTE');
    expect(p.olhar).toBe(-1);
  });

  it('o ciclo de caminhada percorre os 4 passos', () => {
    const a = iniciarTarefa(novo(), 0, false);
    const quadros = new Set([0, 120, 240, 360].map((t) => poseDe(a, 5000 + t, false).quadro));
    expect([...quadros].sort()).toEqual(['passo0', 'passo1', 'passo2', 'passo3']);
  });

  it('digitando fica de costas para o monitor e alterna os braços; parado pisca de tempos em tempos', () => {
    const a = rodar(iniciarTarefa(novo(), 0, true), 0, 100);
    const p0 = poseDe(a, 0, false);
    const p1 = poseDe(a, 150, false);
    expect(p0.cara).toBe('COSTAS');
    expect(new Set([p0.quadro, p1.quadro])).toEqual(new Set(['digita0', 'digita1']));
    expect(poseDe(novo(), 3200 * 2 + 50, false).quadro).toBe('piscando');
    expect(poseDe(novo(), 3200 * 2 + 1000, false).quadro).toBe('parado');
  });

  it('janela: de costas olhando para a esquerda; bebedouro: de frente olhando para a direita', () => {
    const parado = (motivo: 'JANELA' | 'BEBEDOURO'): Agente => ({ ...novo(), vida: { acao: 'PARADO', motivo, desde: 0, ate: 3000, parado: 3000, contador: 1 } });
    expect(poseDe(parado('JANELA'), 500, false).cara).toBe('COSTAS');
    expect(poseDe(parado('BEBEDOURO'), 500, false)).toMatchObject({ cara: 'FRENTE', olhar: 1 });
  });
});

describe('elevador e cozinha: pose e porta', () => {
  const base = () => novo();
  const emFase = (fase: Agente['fase'], extra: Partial<Agente> = {}): Agente => ({ ...base(), fase, desde: 1000, posicao: { ...ELEVADOR_PE }, ...extra });

  it('ausente não aparece (opacidade 0)', () => {
    expect(poseDe(emFase('AUSENTE'), 5000, false).alfa).toBe(0);
  });

  it('crachá: de costas para a parede, encostando o crachá e voltando', () => {
    const a = emFase('CRACHA');
    expect(poseDe(a, 1000 + 500, false)).toMatchObject({ efeito: 'CRACHA', cara: 'COSTAS', quadro: 'digita0' });
    expect(poseDe(a, 1000 + 1000, false).quadro).toBe('parado');
  });

  it('elevador: entra andando na parede e vai sumindo', () => {
    const a = emFase('ELEVADOR');
    expect(poseDe(a, 1000 + 100, false).alfa).toBe(1); // a porta ainda está abrindo
    const meio = poseDe(a, 1000 + 700, false);
    expect(meio.alfa).toBeGreaterThan(0);
    expect(meio.alfa).toBeLessThan(1);
    expect(meio.andando).toBe(true);
    expect(poseDe(a, 1000 + 1500, false).alfa).toBe(0);
  });

  it('quem sai do elevador aparece aos poucos', () => {
    const a = { ...iniciarTarefa(emFase('AUSENTE'), 1000, false) };
    expect(poseDe(a, 1000 + 100, false).alfa).toBe(0);
    expect(poseDe(a, 1000 + 500, false).alfa).toBeGreaterThan(0);
    expect(poseDe(a, 1000 + 900, false).alfa).toBe(1);
  });

  it('na cozinha: toma o café (ou a água) de frente, olhando para a máquina', () => {
    expect(poseDe(emFase('PAUSA', { pausa: 'CAFE' }), 3000, false)).toMatchObject({ efeito: 'CAFE', cara: 'FRENTE', olhar: 1 });
    expect(poseDe(emFase('PAUSA', { pausa: 'AGUA' }), 3000, false).efeito).toBe('BEBER');
    expect(andandoAgora(emFase('PAUSA_INDO', { caminho: [{ x: 1, y: 7 }] }))).toBe(true);
    expect(andandoAgora(emFase('INDO_EMBORA', { caminho: [{ x: 1, y: 7 }] }))).toBe(true);
  });

  it('a porta do elevador abre para quem entra e para quem sai; o leitor pisca ao bater o crachá; movimento reduzido não anima', () => {
    expect(estadoDoElevador([base()], 5000, false)).toEqual({ abertura: 0, led: false });
    expect(estadoDoElevador([emFase('ELEVADOR')], 1000 + 800, false).abertura).toBe(1);
    expect(estadoDoElevador([emFase('ELEVADOR')], 1000 + 1790, false).abertura).toBeLessThan(0.1); // fechando
    expect(estadoDoElevador([emFase('CRACHA')], 1000 + 300, false).led).toBe(true);
    const saindo = iniciarTarefa(emFase('AUSENTE'), 2000, false);
    expect(estadoDoElevador([saindo], 2000 + 600, false).abertura).toBe(1);
    expect(estadoDoElevador([emFase('ELEVADOR')], 1000 + 800, true)).toEqual({ abertura: 0, led: false });
  });
});
