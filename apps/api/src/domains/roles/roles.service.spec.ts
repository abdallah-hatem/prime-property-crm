import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSION_KEYS } from '@prime-crm/shared';
import type { RoleRow } from './repositories/role.repository';
import { RolesService } from './roles.service';

const tx = { tx: true };
const row = (fields: Partial<RoleRow> = {}): RoleRow => ({
  id: 'r1',
  name: 'Team lead',
  builtIn: null,
  permissions: ['owners.assign'],
  _count: { users: 0 },
  ...fields,
});

function makeService(overrides: { roles?: Record<string, jest.Mock> } = {}) {
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const roles = {
    findById: jest.fn().mockResolvedValue(row()),
    nameTaken: jest.fn().mockResolvedValue(false),
    create: jest.fn((data: { name: string; permissions: string[] }) =>
      Promise.resolve(row({ id: 'new', ...data })),
    ),
    update: jest.fn((_id: string, data: Partial<RoleRow>) =>
      Promise.resolve(row({ ...data })),
    ),
    lockAndCountUsers: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.roles,
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new RolesService(db as never, roles as never, activity as never);
  return { svc, roles, activity };
}

describe('RolesService', () => {
  it('create stores each key once, in list order, and logs ROLE_CREATE in the tx', async () => {
    const { svc, roles, activity } = makeService();
    const role = await svc.create(
      {
        name: 'Team lead',
        permissions: ['analytics.view', 'owners.assign', 'analytics.view'],
      },
      'actor',
    );
    expect(roles.create).toHaveBeenCalledWith(
      { name: 'Team lead', permissions: ['owners.assign', 'analytics.view'] },
      tx,
    );
    expect(role.permissions).toEqual(['owners.assign', 'analytics.view']);
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'ROLE_CREATE', actorId: 'actor' }),
    );
  });

  it('create with a taken name → 409 ROLE_NAME_TAKEN', async () => {
    const { svc, activity } = makeService({
      roles: { nameTaken: jest.fn().mockResolvedValue(true) },
    });
    const error = await svc
      .create({ name: 'admin', permissions: [] }, 'actor')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ error: 'ROLE_NAME_TAKEN' });
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("Editing Admin role's permissions → 400 BUILT_IN_ROLE", async () => {
    const { svc, roles } = makeService({
      roles: {
        findById: jest.fn().mockResolvedValue(
          row({
            builtIn: 'ADMIN',
            name: 'Admin',
            permissions: [...PERMISSION_KEYS],
          }),
        ),
      },
    });
    const error = await svc
      .update('r1', { permissions: ['users.manage'] }, 'actor')
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ error: 'BUILT_IN_ROLE' });
    expect(roles.update).not.toHaveBeenCalled();
  });

  it('renaming Team member is allowed and logged', async () => {
    const { svc, roles, activity } = makeService({
      roles: {
        findById: jest.fn().mockResolvedValue(
          row({
            builtIn: 'TEAM_MEMBER',
            name: 'Team member',
            permissions: [],
          }),
        ),
      },
    });
    await svc.update('r1', { name: 'Agent' }, 'actor');
    expect(roles.update).toHaveBeenCalledWith('r1', { name: 'Agent' }, tx);
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: 'ROLE_UPDATE',
        details: { name: { from: 'Team member', to: 'Agent' } },
      }),
    );
  });

  it('an update that changes nothing writes and logs nothing', async () => {
    const { svc, roles, activity } = makeService();
    await svc.update(
      'r1',
      { name: 'Team lead', permissions: ['owners.assign'] },
      'actor',
    );
    expect(roles.update).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('update or delete of an unknown role → 404', async () => {
    const { svc } = makeService({
      roles: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.update('x', { name: 'y' }, 'a')).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.remove('x', 'a')).rejects.toThrow(NotFoundException);
  });

  it('Delete a built-in role → 400', async () => {
    const { svc, roles } = makeService({
      roles: {
        findById: jest.fn().mockResolvedValue(row({ builtIn: 'TEAM_MEMBER' })),
      },
    });
    const error = await svc.remove('r1', 'actor').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ error: 'BUILT_IN_ROLE' });
    expect(roles.delete).not.toHaveBeenCalled();
  });

  it('delete a role with users → 409 ROLE_IN_USE', async () => {
    const { svc, roles } = makeService({
      roles: { lockAndCountUsers: jest.fn().mockResolvedValue(3) },
    });
    const error = await svc.remove('r1', 'actor').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ error: 'ROLE_IN_USE' });
    expect(roles.delete).not.toHaveBeenCalled();
  });

  it('delete an unused custom role logs ROLE_DELETE in the same tx', async () => {
    const { svc, roles, activity } = makeService();
    await svc.remove('r1', 'actor');
    expect(roles.delete).toHaveBeenCalledWith('r1', tx);
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: 'ROLE_DELETE',
        target: { kind: 'ROLE', id: 'r1', label: 'Team lead' },
      }),
    );
  });

  it('permissions() is the fixed list with both labels', () => {
    const { svc } = makeService();
    expect(svc.permissions().map((p) => p.key)).toEqual([...PERMISSION_KEYS]);
  });
});
