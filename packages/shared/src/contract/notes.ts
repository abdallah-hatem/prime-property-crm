import { z } from 'zod';
import { UserSummarySchema } from './summary';

/**
 * Notes on an owner or a listing (spec, Shapes → Note; business doc: notes are added, not
 * edited). `POST /owners/:id/notes` and `POST /listings/:id/notes` take the same body.
 */
export const NOTE_BODY_MAX_LENGTH = 2000;

export const NoteBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(NOTE_BODY_MAX_LENGTH);

export const CreateNoteRequestSchema = z.strictObject({ body: NoteBodySchema });
export type CreateNoteRequest = z.input<typeof CreateNoteRequestSchema>;

export const NoteSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  author: UserSummarySchema,
  createdAt: z.string(),
});
export type Note = z.infer<typeof NoteSchema>;
