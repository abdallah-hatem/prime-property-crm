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

/** Latin digits, grouped, in both languages (the app's number style, as `formatNumber`). */
const grouped = new Intl.NumberFormat('en-US');

const pluralRules: Partial<Record<Locale, Intl.PluralRules>> = {};
const rulesFor = (locale: Locale): Intl.PluralRules =>
  (pluralRules[locale] ??= new Intl.PluralRules(locale));

/** A plural count: a number, or a string already formatted with Latin digits (`1,284`). */
function countOf(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/[,\s٬]/g, ''));
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** The text between a `{` at `open` and its matching `}`, and the index after it. */
function balanced(text: string, open: number): [string, number] | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0)
      return [text.slice(open + 1, i), i + 1];
  }
  return null;
}

/**
 * `{count, plural, =0 {…} one {…} two {…} few {…} many {…} other {…}}` — ICU's plural select:
 * an exact `=N` branch first, then the locale's category (Intl.PluralRules: English one/other,
 * Arabic zero/one/two/few/many/other), then `other`. `#` in the branch is the count, grouped.
 */
function selectPlural(
  body: string,
  value: string | number | undefined,
  locale: Locale,
): string | null {
  const branches = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const head = /\s*(=\d+|[a-z]+)\s*\{/y;
    head.lastIndex = i;
    const match = head.exec(body);
    if (!match) break;
    const inner = balanced(body, head.lastIndex - 1);
    if (!inner) return null;
    branches.set(match[1], inner[0]);
    i = inner[1];
  }
  const count = countOf(value);
  if (count === null || !branches.has('other')) return null;
  const branch =
    branches.get(`=${count}`) ??
    branches.get(rulesFor(locale).select(count)) ??
    branches.get('other')!;
  return branch.replace(/#/g, grouped.format(count));
}

/** Expands plural blocks, then `{name}` placeholders. */
export function formatMessage(
  text: string,
  vars: MessageVars | undefined,
  locale: Locale,
): string {
  if (!vars) return text;
  let out = '';
  let i = 0;
  const plural = /\{(\w+),\s*plural,/g;
  for (let m = plural.exec(text); m; m = plural.exec(text)) {
    const block = balanced(text, m.index);
    if (!block) break;
    const body = block[0].slice(block[0].indexOf('plural,') + 'plural,'.length);
    const chosen = selectPlural(body, vars[m[1]], locale);
    out += text.slice(i, m.index) + (chosen ?? text.slice(m.index, block[1]));
    i = block[1];
    plural.lastIndex = block[1];
  }
  out += text.slice(i);
  return out.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** A translator for one locale; falls back to English, then to the key itself. */
export function createTranslator(locale: Locale): Translate {
  return (key, vars) => {
    const own = lookup(messages[locale], key);
    const text = own ?? lookup(messages.en, key) ?? key;
    return formatMessage(text, vars, own === undefined ? 'en' : locale);
  };
}
