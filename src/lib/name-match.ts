// Normaliza pra comparar nomes digitados à mão: sem acento, minúsculas,
// espaços simples.
export const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface NameMatch<T> {
  line: string;
  matches: T[];
}

// Cada linha da lista colada vira um nome. Casa quando todas as palavras da
// linha aparecem no nome do passageiro ("Ana Souza" acha "Ana Paula Souza").
export function matchNames<T>(text: string, items: T[], nameOf: (item: T) => string): NameMatch<T>[] {
  const lines = text
    .split(/\r?\n|;|,/)
    .map((l) => l.replace(/^\s*\d+[.)-]?\s*/, '').trim())
    .filter((l) => normalizeName(l).length >= 2);
  return lines.map((line) => {
    const words = normalizeName(line).split(' ');
    const matches = items.filter((item) => {
      const name = ` ${normalizeName(nameOf(item))} `;
      return words.every((w) => name.includes(` ${w}`));
    });
    return { line, matches };
  });
}
