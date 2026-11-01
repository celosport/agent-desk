import { nomeDoAparelho, precisaInstalarNoIos } from './push-navegador';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0';

describe('push do navegador', () => {
  it('reconhece o aparelho para mostrar na lista', () => {
    expect(nomeDoAparelho(IPHONE)).toBe('iPhone · Safari');
    expect(nomeDoAparelho(ANDROID)).toBe('Android · Chrome');
    expect(nomeDoAparelho(WINDOWS_EDGE)).toBe('Windows · Edge'); // Edge também diz "Chrome"
    expect(nomeDoAparelho(MAC_FIREFOX)).toBe('Mac · Firefox');
    expect(nomeDoAparelho('curl/8')).toBe('Aparelho');
  });

  it('no iPhone e no iPad só vale com o app instalado na Tela de Início', () => {
    expect(precisaInstalarNoIos(IPHONE, false)).toBe(true);
    expect(precisaInstalarNoIos(IPHONE, true)).toBe(false);
    expect(precisaInstalarNoIos('Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)', false)).toBe(true);
    expect(precisaInstalarNoIos(ANDROID, false)).toBe(false);
    expect(precisaInstalarNoIos(WINDOWS_EDGE, false)).toBe(false);
  });
});
