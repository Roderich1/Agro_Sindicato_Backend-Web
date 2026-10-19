import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envSchema } from '@/config/env.schema';
import { LEGACY_ROUTE_CLOSED } from './legacy-route-closed.guard';
import { LegacyPrivateWriteGuard, LegacyPrivateWritesConfig } from './legacy-private-writes';

const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(12), JWT_REFRESH_SECRET: 'x'.repeat(32) };
const configFor = (value?: string) =>
  new LegacyPrivateWritesConfig(new ConfigService(envSchema.parse({ ...base, LEGACY_PRIVATE_WRITES_ROLLBACK: value })));

describe('#81 PHASE 6: legacy private writes', () => {
  it('are closed unless the server enables the rollback', () => {
    for (const value of [undefined, '', 'disabled']) expect(configFor(value).rollback).toBe(false);
    expect(configFor('enabled').rollback).toBe(true);
  });

  it('only accept enabled or disabled as the rollback setting', () => {
    for (const value of ['true', '1', 'ENABLED', 'open']) {
      expect(() => envSchema.parse({ ...base, LEGACY_PRIVATE_WRITES_ROLLBACK: value })).toThrow();
    }
  });

  it('the guard refuses with LEGACY_ROUTE_CLOSED, or lets the request through on rollback', () => {
    const closed = new LegacyPrivateWriteGuard({ rollback: false } as LegacyPrivateWritesConfig);
    expect(() => closed.canActivate()).toThrow(new ForbiddenException(LEGACY_ROUTE_CLOSED));
    expect(new LegacyPrivateWriteGuard({ rollback: true } as LegacyPrivateWritesConfig).canActivate()).toBe(true);
  });
});
