// Arquivos no navegador: ler um .txt/.md como texto e oferecer um texto para baixar. Sem upload: o conteúdo vai no JSON.

/** Mesmo limite da API (ExecutarAutomacaoValidator): 200 KB de texto em UTF-8. */
export const TAMANHO_MAXIMO_ENTRADA = 200 * 1024;

const EXTENSOES_ACEITAS = ['.txt', '.md'];

/** Tamanho em bytes como a API conta (UTF-8: "ç" vale 2). */
export function tamanhoEmBytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/** Mensagem de erro para a tela, ou null se o arquivo serve como entrada. */
export function validarArquivoEntrada(arquivo: Pick<File, 'name' | 'size'>): string | null {
  const nome = arquivo.name.toLowerCase();
  if (!EXTENSOES_ACEITAS.some((ext) => nome.endsWith(ext))) return 'Só arquivos .txt ou .md.';
  if (arquivo.size > TAMANHO_MAXIMO_ENTRADA) return 'O arquivo tem mais de 200 KB.';
  return null;
}

/** "relatorio-executivo-2026-10-30-1345.md", com a data e a hora de Brasília. */
export function nomeArquivoResultado(codigo: string, quando: Date, fuso = 'America/Sao_Paulo'): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(quando)
      .map((p) => [p.type, p.value]),
  );
  return `${codigo}-${partes['year']}-${partes['month']}-${partes['day']}-${partes['hour']}${partes['minute']}.md`;
}

/** Faz o navegador baixar `conteudo` como arquivo (Markdown por padrão). */
export function baixarTexto(nome: string, conteudo: string, tipo = 'text/markdown;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
