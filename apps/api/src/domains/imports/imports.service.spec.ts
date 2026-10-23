import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { fileNameOf, ImportsService } from './imports.service';

const ME = 'user-1';
const admin: CurrentUser = {
  id: ME,
  roleId: 'r',
  permissions: [],
  isAdmin: true,
};
const importer: CurrentUser = {
  id: ME,
  roleId: 'r',
  permissions: ['owners.import'],
  isAdmin: false,
};
const nobody: CurrentUser = {
  id: ME,
  roleId: 'r',
  permissions: [],
  isAdmin: false,
};

const job = (over: object = {}) => ({
  id: 'job-1',
  kind: 'OWNERS',
  fileName: 'a.csv',
  status: 'PREVIEWED',
  headers: ['Name', 'Phone'],
  mapping: { name: 'Name', phone: 'Phone' },
  totalRows: 1,
  addedCount: 1,
  duplicateCount: 0,
  rejectedCount: 0,
  createdById: ME,
  createdAt: new Date('2026-10-23T10:00:00Z'),
  assignToId: null,
  createdBy: { id: ME, name: 'Me' },
  assignTo: null,
  ...over,
});

function makeService(
  overrides: Partial<
    Record<'imports' | 'assignment' | 'activity', Record<string, unknown>>
  > = {},
) {
  const tx = {};
  const db = {
    transaction: jest.fn((work: (t: object) => unknown) => work(tx)),
  };
  const imports = {
    findJob: jest.fn().mockResolvedValue(job()),
    lockJob: jest.fn().mockResolvedValue(job()),
    loadRows: jest
      .fn()
      .mockResolvedValue([{ rowNumber: 1, cells: ['Sara', '01001234567'] }]),
    phoneLookup: jest
      .fn()
      .mockResolvedValue({ owners: new Map(), listings: new Map() }),
    writeIssues: jest.fn().mockResolvedValue(undefined),
    updateJob: jest.fn().mockResolvedValue(undefined),
    insertOwners: jest.fn().mockResolvedValue(undefined),
    createJob: jest
      .fn()
      .mockResolvedValue(job({ status: 'MAPPING', addedCount: null })),
    ...overrides.imports,
  };
  const assignment = {
    assertAssignee: jest.fn().mockResolvedValue(null),
    reassignOwnerAndListing: jest.fn(),
    ...overrides.assignment,
  };
  const activity = {
    record: jest.fn().mockResolvedValue(undefined),
    ...overrides.activity,
  };
  const users = {
    findActive: jest.fn().mockResolvedValue({ id: ME, name: 'Me' }),
  };
  const svc = new ImportsService(
    db as never,
    imports as never,
    assignment as never,
    activity as never,
    users as never,
  );
  return { svc, db, imports, assignment, activity };
}

describe('ImportsService', () => {
  it('upload refuses a kind the caller may not import (before reading the file)', async () => {
    const { svc, imports } = makeService();
    await expect(
      svc.upload(undefined, { kind: 'LISTINGS' }, importer),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.upload(undefined, { kind: 'OWNERS' }, importer),
    ).rejects.toThrow(BadRequestException);
    expect(imports.createJob).not.toHaveBeenCalled();
  });

  it('upload stages the rows with a suggested mapping', async () => {
    const { svc, imports } = makeService();
    await svc.upload(
      {
        originalname: 'a.csv',
        buffer: Buffer.from('Name,Mobile\nSara,01001234567'),
      },
      { kind: 'OWNERS' },
      importer,
    );
    expect(imports.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: ['Name', 'Mobile'],
        mapping: { name: 'Name', phone: 'Mobile' },
      }),
      [{ rowNumber: 1, cells: ['Sara', '01001234567'] }],
    );
  });

  it('get: the creator and owners.import read a job; anyone else (or no job) is a 404', async () => {
    const theirs = makeService({
      imports: {
        findJob: jest.fn().mockResolvedValue(job({ createdById: 'other' })),
      },
    }).svc;
    await expect(theirs.get('job-1', importer)).resolves.toMatchObject({
      id: 'job-1',
    });
    await expect(theirs.get('job-1', nobody)).rejects.toThrow(
      NotFoundException,
    );
    await expect(makeService().svc.get('job-1', nobody)).resolves.toMatchObject(
      { id: 'job-1', fileName: 'a.csv' },
    );
    const missing = makeService({
      imports: { findJob: jest.fn().mockResolvedValue(null) },
    }).svc;
    await expect(missing.get('job-1', admin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("someone else's import is a 404, even for an admin", async () => {
    const { svc } = makeService({
      imports: {
        findJob: jest.fn().mockResolvedValue(job({ createdById: 'other' })),
      },
    });
    await expect(svc.confirm('job-1', admin)).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.preview('job-1', { mapping: {} }, admin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('the creator who lost the permission is refused', async () => {
    const { svc } = makeService();
    await expect(svc.confirm('job-1', nobody)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('preview with assignTo needs owners.assign', async () => {
    const { svc, db } = makeService();
    await expect(
      svc.preview(
        'job-1',
        { mapping: { name: 'Name', phone: 'Phone' }, assignTo: 'm' },
        importer,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('confirm: wrong states are 409 and never mark the job FAILED', async () => {
    for (const [status, code] of [
      ['DONE', 'IMPORT_ALREADY_DONE'],
      ['MAPPING', 'IMPORT_NOT_PREVIEWED'],
      ['FAILED', 'IMPORT_NOT_PREVIEWED'],
    ]) {
      const { svc, imports } = makeService({
        imports: { findJob: jest.fn().mockResolvedValue(job({ status })) },
      });
      await expect(svc.confirm('job-1', admin)).rejects.toThrow(
        ConflictException,
      );
      await svc
        .confirm('job-1', admin)
        .catch((e: ConflictException) =>
          expect((e.getResponse() as { error: string }).error).toBe(code),
        );
      expect(imports.updateJob).not.toHaveBeenCalled();
    }
  });

  it('confirm: an unexpected failure marks the job FAILED and answers IMPORT_FAILED', async () => {
    const { svc, imports, activity } = makeService({
      imports: {
        insertOwners: jest.fn().mockRejectedValue(new Error('disk full')),
      },
    });
    await expect(svc.confirm('job-1', admin)).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(imports.updateJob).toHaveBeenLastCalledWith('job-1', {
      status: 'FAILED',
      error: 'disk full',
    });
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('confirm: an assignee deactivated since the preview is a 400, job untouched', async () => {
    const { svc, imports } = makeService({
      imports: {
        lockJob: jest.fn().mockResolvedValue(job({ assignToId: 'm' })),
        findJob: jest.fn().mockResolvedValue(job({ assignToId: 'm' })),
      },
      assignment: {
        assertAssignee: jest
          .fn()
          .mockRejectedValue(new BadRequestException('INVALID_ASSIGNEE')),
      },
    });
    await expect(svc.confirm('job-1', admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(imports.updateJob).not.toHaveBeenCalled();
  });

  it('confirm: adds the rows and records one IMPORT entry with the counts', async () => {
    const { svc, imports, activity } = makeService();
    const result = await svc.confirm('job-1', admin);
    expect(imports.insertOwners).toHaveBeenCalledWith(
      {},
      [expect.objectContaining({ name: 'Sara', phones: ['+201001234567'] })],
      {
        jobId: 'job-1',
        actorId: ME,
        assignToId: null,
      },
    );
    expect(activity.record).toHaveBeenCalledTimes(1);
    expect(activity.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        type: 'IMPORT',
        details: {
          kind: 'OWNERS',
          counts: { total: 1, added: 1, duplicates: 0, rejected: 0 },
          assignToId: null,
        },
      }),
    );
    expect(result.counts).toEqual({
      total: 1,
      added: 1,
      duplicates: 0,
      rejected: 0,
    });
  });

  it('list: only the kinds the caller may import', async () => {
    const listJobs = jest.fn().mockResolvedValue({ rows: [], total: 0 });
    const { svc } = makeService({ imports: { listJobs } });
    await svc.list({ page: 1, limit: 20 }, importer);
    expect(listJobs).toHaveBeenCalledWith(['OWNERS'], 0, 20);
    await expect(
      svc.list({ page: 1, limit: 20, kind: 'LISTINGS' }, importer),
    ).rejects.toThrow(ForbiddenException);
    await expect(svc.list({ page: 1, limit: 20 }, nobody)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('fileNameOf', () => {
  it('restores a UTF-8 name multer read as Latin-1, keeps plain names', () => {
    expect(
      fileNameOf(Buffer.from('ملاك.xlsx', 'utf8').toString('latin1')),
    ).toBe('ملاك.xlsx');
    expect(fileNameOf('owners.csv')).toBe('owners.csv');
    expect(fileNameOf('   ')).toBe('import');
    expect(fileNameOf('a'.repeat(300))).toHaveLength(255);
  });
});
