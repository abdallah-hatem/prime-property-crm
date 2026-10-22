import { messages, type Locale, type Messages } from '@prime-crm/shared';

/** Every dotted path to a string in the messages tree, e.g. "nav.today". */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
/** Values for `{name}` placeholders in a message. */
export type MessageVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: MessageVars) => string;

function lookup(tree: Messages, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const interpolate = (text: string, vars?: MessageVars): string =>
  vars
    ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    : text;

/** A translator for one locale; falls back to English, then to the key itself. */
export function createTranslator(locale: Locale): Translate {
  return (key, vars) =>
    interpolate(
      lookup(messages[locale], key) ?? lookup(messages.en, key) ?? key,
      vars,
    );
}
