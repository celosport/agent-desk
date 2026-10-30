import { atualizarPeriodicamente } from './atualizacao-periodica';

describe('atualizarPeriodicamente', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const documento = () => {
    const ouvintes: (() => void)[] = [];
    return {
      hidden: false,
      addEventListener: (_: string, f: () => void) => ouvintes.push(f),
      removeEventListener: () => undefined,
      disparar: () => ouvintes.forEach((f) => f()),
    };
  };

  it('consulta na hora e depois no intervalo', async () => {
    const consultar = vi.fn().mockResolvedValue(undefined);
    const parar = atualizarPeriodicamente(consultar, { intervaloMs: 1000, documento: documento() as never });
    await vi.advanceTimersByTimeAsync(0);
    expect(consultar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(consultar).toHaveBeenCalledTimes(2);
    parar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it('falha dobra a espera; aba oculta pausa', async () => {
    const doc = documento();
    const consultar = vi.fn().mockRejectedValue(new Error('rede'));
    atualizarPeriodicamente(consultar, { intervaloMs: 1000, documento: doc as never });
    await vi.advanceTimersByTimeAsync(0); // 1ª (falha → espera 2000)
    await vi.advanceTimersByTimeAsync(1000);
    expect(consultar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(consultar).toHaveBeenCalledTimes(2);

    doc.hidden = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(consultar).toHaveBeenCalledTimes(2);
    doc.hidden = false;
    doc.disparar();
    await vi.advanceTimersByTimeAsync(0);
    expect(consultar).toHaveBeenCalledTimes(3);
  });
});
