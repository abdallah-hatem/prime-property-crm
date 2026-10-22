import { Module } from '@nestjs/common';
import { NoteRepository } from './repositories/note.repository';
import { NotesService } from './notes.service';

/** Import it and inject NotesService for owner and listing notes (routes live with their parent). */
@Module({
  providers: [NotesService, NoteRepository],
  exports: [NotesService],
})
export class NotesModule {}
