import { baixarTexto } from './arquivos';

/** O guia em Markdown (servido em /coletor) que uma IA lê para conectar o Claude Code; o endereço do app vai preenchido. */
export const CAMINHO_GUIA_IA = '/coletor/CONECTAR-COM-IA.md';

export function guiaParaIa(markdown: string, urlApp: string): string {
  return markdown.replaceAll('{{ENDERECO}}', urlApp.replace(/\/+$/, ''));
}

/** Baixa o guia com o endereço deste site. Devolve false se não foi possível. */
export async function baixarGuiaParaIa(origem: string = location.origin): Promise<boolean> {
  try {
    const r = await fetch(CAMINHO_GUIA_IA);
    if (!r.ok) return false;
    baixarTexto('CONECTAR-COM-IA.md', guiaParaIa(await r.text(), origem));
    return true;
  } catch {
    return false;
  }
}
