import { describe, expect, it, vi } from 'vitest';
import type {
  CodeJobRecord,
  CodeUnitRecord,
  UserRecord,
} from '../../db/schema.js';
import type { UserRepository } from '../users/user.repository.js';
import type { CodeRepository, StoredJob } from './code.repository.js';
import { CodeService } from './code.service.js';

const owner: UserRecord = {
  id: '7ccafba9-27de-43bf-a5d2-1b1333338c57',
  email: 'owner@example.com',
  passwordHash: 'hash',
  role: 'tenant_user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function users(): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(owner),
    createUser: vi.fn(),
    updateRole: vi.fn(),
    createRefreshSession: vi.fn(),
    findRefreshSession: vi.fn(),
    rotateRefreshSession: vi.fn(),
    revokeRefreshSession: vi.fn(),
    revokeAllRefreshSessions: vi.fn(),
  };
}

class MemoryCodeRepository implements CodeRepository {
  jobs = new Map<string, StoredJob>();
  downloads: { unitId: string; format: 'svg' | 'pdf' }[] = [];

  async findIdempotent(ownerId: string, key: string) {
    return [...this.jobs.values()].find(
      ({ job }) => job.ownerId === ownerId && job.idempotencyKey === key,
    );
  }

  async findJob(ownerId: string, id: string) {
    const stored = this.jobs.get(id);
    return stored?.job.ownerId === ownerId ? stored : undefined;
  }

  async findUnit(ownerId: string, id: string) {
    const stored = [...this.jobs.values()].find(
      ({ job }) => job.ownerId === ownerId,
    );
    return stored?.units.find((unit) => unit.id === id);
  }

  async findPublic(token: string) {
    return [...this.jobs.values()]
      .flatMap(({ units }) => units)
      .find((unit) => unit.token === token);
  }

  async create(job: CodeJobRecord, units: CodeUnitRecord[]) {
    this.jobs.set(job.id, { job, units });
  }

  async revoke(ownerId: string, id: string, reason: string) {
    const unit = await this.findUnit(ownerId, id);
    if (!unit) return undefined;
    if (unit.status === 'active') {
      unit.status = 'revoked';
      unit.revokedAt = new Date('2026-01-02T00:00:00.000Z');
      unit.revokeReason = reason;
    }
    return unit;
  }

  async recordDownload(
    _ownerId: string,
    unit: CodeUnitRecord,
    format: 'svg' | 'pdf',
  ) {
    this.downloads.push({ unitId: unit.id, format });
  }
}

describe('CodeService', () => {
  it('renders independently decodable QR and Data Matrix previews', async () => {
    const service = new CodeService(
      new MemoryCodeRepository(),
      users(),
      'https://q.example',
    );

    const qr = await service.preview(owner.id, {
      format: 'qr',
      errorCorrection: 'M',
      moduleSizeMm: 0.25,
      printerDpi: 600,
      printMode: 'standard',
    });
    const dataMatrix = await service.preview(owner.id, {
      format: 'data_matrix',
      moduleSizeMm: 0.25,
      printerDpi: 600,
      printMode: 'standard',
    });

    expect(qr).toMatchObject({
      issued: false,
      print: { digitalVerification: 'passed' },
    });
    expect(qr.svg).toContain('<svg');
    expect(dataMatrix.print).toMatchObject({
      format: 'data_matrix',
      digitalVerification: 'passed',
    });
  });

  it('issues idempotently, downloads artwork, looks up, and revokes a unit', async () => {
    const repository = new MemoryCodeRepository();
    const token = `${'A'.repeat(25)}E`;
    const service = new CodeService(
      repository,
      users(),
      'https://q.example',
      () => token,
    );
    const input = {
      quantity: 1,
      reference: 'LOT-1',
      print: {
        format: 'qr' as const,
        errorCorrection: 'M' as const,
        moduleSizeMm: 0.25,
        printerDpi: 600,
        printMode: 'standard' as const,
      },
    };

    const created = await service.create(owner.id, 'first-request', input);
    const replayed = await service.create(owner.id, 'first-request', input);
    const unit = created.codes[0]!;

    expect(created).toMatchObject({
      quantity: 1,
      replayed: false,
      reference: 'LOT-1',
    });
    expect(replayed).toMatchObject({ id: created.id, replayed: true });
    expect(unit.scanUrl).toBe(`HTTPS://Q.EXAMPLE/${token}`);
    expect(
      (await service.artwork(owner.id, unit.id, 'svg')).toString(),
    ).toContain('<svg');
    expect(await service.artwork(owner.id, unit.id, 'pdf')).toBeInstanceOf(
      Buffer,
    );
    await expect(service.publicLookup(token)).resolves.toMatchObject({
      code: { status: 'active' },
    });

    const revoked = await service.revoke(
      owner.id,
      unit.id,
      'Packaging damaged',
    );
    expect(revoked).toMatchObject({
      status: 'revoked',
      revokeReason: 'Packaging damaged',
    });
    await expect(service.publicLookup(token)).resolves.toMatchObject({
      code: { status: 'revoked' },
    });
    await expect(
      service.artwork(owner.id, unit.id, 'svg'),
    ).rejects.toMatchObject({
      code: 'CODE_REVOKED',
      statusCode: 409,
    });
    expect(repository.downloads).toHaveLength(2);
  });
});
