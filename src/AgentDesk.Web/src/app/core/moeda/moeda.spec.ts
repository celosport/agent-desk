import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../config/api.config';
import { formatarDolar } from '../../shared/util/formatos';
import { moedaAtiva, taxasPorDolar } from '../../shared/util/moeda-ativa';
import { CHAVE_MOEDA, MoedaApp } from './moeda';

describe('MoedaApp', () => {
  const cotacoes = { base: 'USD', taxas: { USD: 1, BRL: 5.4, EUR: 0.9 }, dataCotacao: '2026-10-29', fonte: 'PTAX', atualizadaEm: '2026-10-30T12:00:00Z' };

  const criar = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '' }] });
    return { moeda: TestBed.inject(MoedaApp), http: TestBed.inject(HttpTestingController) };
  };

  beforeEach(() => localStorage.removeItem(CHAVE_MOEDA));
  afterEach(() => {
    moedaAtiva.set('USD');
    taxasPorDolar.set(null);
  });

  it('carrega a cotação e oferece só as moedas que têm taxa', async () => {
    const { moeda, http } = criar();
    const carga = moeda.carregar();
    http.expectOne('/api/v1/cotacoes').flush(cotacoes);
    await carga;

    expect(moeda.disponiveis()).toEqual(['USD', 'BRL', 'EUR']); // sem libra nesta cotação
    moeda.escolher('BRL');
    expect(formatarDolar(4).replace(/\s/g, ' ')).toBe('R$ 21,60');
    expect(localStorage.getItem(CHAVE_MOEDA)).toBe('BRL');
  });

  it('cotação indisponível: só o dólar, e a moeda escolhida cai para o dólar sem quebrar', async () => {
    const { moeda, http } = criar();
    moeda.escolher('EUR');
    const carga = moeda.carregar();
    http.expectOne('/api/v1/cotacoes').flush({ code: 'Cotacoes.Indisponivel' }, { status: 503, statusText: 'Unavailable' });
    await carga;

    expect(moeda.disponiveis()).toEqual(['USD']);
    expect(moeda.efetiva()).toBe('USD');
    expect(formatarDolar(4).replace(/\s/g, ' ')).toBe('US$ 4,00');
    expect(moeda.escolhida()).toBe('EUR'); // a preferência fica guardada para quando a cotação voltar
  });

  it('lembra a moeda do aparelho e ignora valor inválido', () => {
    localStorage.setItem(CHAVE_MOEDA, 'GBP');
    expect(criar().moeda.escolhida()).toBe('GBP');

    TestBed.resetTestingModule();
    localStorage.setItem(CHAVE_MOEDA, 'JPY');
    expect(criar().moeda.escolhida()).toBe('USD');
  });
});
