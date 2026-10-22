import type { Prisma } from '@prisma/client';
import type { Note } from '@prime-crm/shared';

/** The columns behind the contract's `Note`; pass as `select`, map with `toNote`. */
export const NOTE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} as const satisfies Prisma.NoteSelect;

export type NoteRow = Prisma.NoteGetPayload<{ select: typeof NOTE_SELECT }>;

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
  };
}
