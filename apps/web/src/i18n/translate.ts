import { messages, type Locale, type Messages } from '@prime-crm/shared';

/** Every dotted path to a string in the messages tree, e.g. "nav.today". */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Translate = (key: MessageKey) => string;

function lookup(tree: Messages, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** A translator for one locale; falls back to English, then to the key itself. */
export function createTranslator(locale: Locale): Translate {
  return (key) =>
    lookup(messages[locale], key) ?? lookup(messages.en, key) ?? key;
}
