'use client';

import { useState } from 'react';
import { LoaderCircle, MessageSquareText } from 'lucide-react';
import { NOTE_BODY_MAX_LENGTH, type Note } from '@prime-crm/shared';
import { ADD_LISTING_NOTE } from '@/apis';
import { DateText } from '@/components/date-text';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from './use-mutation';
import { UserText } from '@/components/user-text';

/** The latest notes on the listing, newest first; its member (or a manager) can add one. */
export function ListingNotes({
  listingId,
  notes: initial,
  canManage,
}: {
  listingId: string;
  notes: readonly Note[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([...initial]);
  const [body, setBody] = useState('');
  const { run, pending } = useMutation();

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    const res = await run(() => ADD_LISTING_NOTE(listingId, { body: text }), {
      showSuccessToast: true,
      successMessage: t('listings.notes.saved'),
    });
    if (!res || isUnauthorized(res) || !res.success) return;
    setNotes((current) => [res.data, ...current]);
    setBody('');
  }

  return (
    <section
      aria-labelledby="listing-notes-title"
      className="grid gap-3 rounded-lg bg-card p-4 shadow-raised"
    >
      <h2 id="listing-notes-title" className="text-sm font-bold">
        {t('listings.notes.title')}
      </h2>
      {notes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareText aria-hidden className="size-4" />
          {t('listings.notes.empty')}
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {notes.map((note) => (
            <li
              key={note.id}
              className="grid gap-1 rounded-md bg-secondary px-3.5 py-3"
            >
              <UserText
                as="p"
                className="text-sm break-words whitespace-pre-line"
              >
                {note.body}
              </UserText>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <UserText className="font-semibold">
                  {note.author.name}
                </UserText>
                <DateText value={note.createdAt} style="dateTime" />
              </p>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          noValidate
          onSubmit={(event) => void add(event)}
          className="grid gap-2"
        >
          <label htmlFor="listing-note" className="sr-only">
            {t('listings.notes.label')}
          </label>
          <Textarea
            showCount
            id="listing-note"
            rows={3}
            maxLength={NOTE_BODY_MAX_LENGTH}
            value={body}
            placeholder={t('listings.notes.placeholder')}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            type="submit"
            variant="soft"
            className="justify-self-end"
            disabled={pending || body.trim() === ''}
          >
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {pending ? t('listings.notes.adding') : t('listings.notes.add')}
          </Button>
        </form>
      )}
    </section>
  );
}
