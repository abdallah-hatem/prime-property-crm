import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function makeStrategy(active: boolean) {
  const config = { get: jest.fn().mockReturnValue('x'.repeat(32)) };
  const users = { isActive: jest.fn().mockResolvedValue(active) };
  return { strategy: new JwtStrategy(config as never, users as never), users };
}

const payload = {
  sub: 'user-1',
  roleId: 'role-1',
  permissions: ['owners.assign'],
  sid: 'fam-1',
};

describe('JwtStrategy.validate', () => {
  it('Deactivated user’s valid access token → 401 on next request', async () => {
    const { strategy, users } = makeStrategy(false);
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.isActive).toHaveBeenCalledWith('user-1');
  });

  it('an active user gets the token’s role, permissions and session', async () => {
    const { strategy } = makeStrategy(true);
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      roleId: 'role-1',
      permissions: ['owners.assign'],
      sessionId: 'fam-1',
    });
  });

  it('a token without sub or roleId → 401 before any lookup', async () => {
    const { strategy, users } = makeStrategy(true);
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(users.isActive).not.toHaveBeenCalled();
  });
});
