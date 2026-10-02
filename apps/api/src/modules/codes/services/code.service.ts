import { createHash, randomUUID } from 'node:crypto';
import {
  codeJobResponseSchema,
  codeUnitResponseSchema,
  publicCodeResponseSchema,
} from '@qrgenerator/contracts';
import type { CodePrintOptions, CreateCodeJob } from '@qrgenerator/contracts';
import type { CodeJobRecord, CodeUnitRecord } from '../../../db/schema.js';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../errors/app-error.js';
import type { UserRepository } from '../../users/repositories/user.repository.js';
import type { BatchRepository } from '../../batches/repositories/batch.repository.js';
import { CodeError } from '../errors/code.error.js';
import type {
  CodeRepository,
  StoredJob,
} from '../repositories/code.repository.js';
import { pdfFor, renderCode, svgFor } from '../renderers/code-renderer.js';
import { createCodeToken, scanUrlFor } from '../utils/code-identifier.js';

function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && uniqueViolation(error.cause);
}

export class CodeService {
  private generating = false;
  constructor(
    private readonly repository: CodeRepository,
    private readonly users: UserRepository,
    private readonly batches: BatchRepository,
    private readonly scanOrigin: string,
    private readonly tokenFactory = createCodeToken,
  ) {}

  private async generate<T>(work: () => Promise<T>): Promise<T> {
    if (this.generating)
      throw new CodeError(
        'GENERATOR_BUSY',
        'Another generation is in progress on this instance. Retry with the same Idempotency-Key.',
        undefined,
        503,
      );
    this.generating = true;
    try {
      return await work();
    } finally {
      this.generating = false;
    }
  }

  private async requireUser(ownerId: string) {
    const user = await this.users.findById(ownerId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  async preview(
    ownerId: string,
    batchNumber: string,
    options: CodePrintOptions,
  ) {
    const actor = await this.requireUser(ownerId);
    if (actor.role !== 'tenant_admin')
      throw new ForbiddenError('Only a tenant admin can generate artwork');
    if (
      !actor.tenantId ||
      !(await this.batches.find(batchNumber, actor.tenantId))
    )
      throw new NotFoundError('Batch not found');
    return this.generate(async () => {
      const scanUrl = scanUrlFor(this.scanOrigin, createCodeToken());
      const result = await renderCode(scanUrl, options);
      return {
        issued: false,
        message:
          'Unissued size proof only. Never print this preview on products; issue a job for real identifiers.',
        scanUrl,
        svg: result.svg,
        print: result.report,
      };
    });
  }

  private unitResponse(unit: CodeUnitRecord) {
    return codeUnitResponseSchema.parse({
      id: unit.id,
      jobId: unit.jobId,
      token: unit.token,
      position: unit.position,
      scanUrl: unit.scanUrl,
      status: unit.status,
      createdAt: unit.createdAt.toISOString(),
      revokedAt: unit.revokedAt?.toISOString() ?? null,
      revokeReason: unit.revokeReason,
      print: unit.printReport,
      downloads: {
        svg: `/api/v1/codes/${unit.id}/artwork.svg`,
        pdf: `/api/v1/codes/${unit.id}/artwork.pdf`,
      },
    });
  }
  private jobResponse(stored: StoredJob, replayed: boolean) {
    return codeJobResponseSchema.parse({
      id: stored.job.id,
      batchNumber: stored.job.batchNumber,
      createdAt: stored.job.createdAt.toISOString(),
      quantity: stored.job.quantity,
      replayed,
      codes: stored.units.map((unit) => this.unitResponse(unit)),
    });
  }
  private replay(stored: StoredJob, hash: string) {
    if (stored.job.requestHash !== hash)
      throw new CodeError(
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key was already used with different options.',
        undefined,
        409,
      );
    return this.jobResponse(stored, true);
  }

  async create(ownerId: string, key: string, input: CreateCodeJob) {
    const actor = await this.requireUser(ownerId);
    if (actor.role !== 'tenant_admin' || !actor.tenantId)
      throw new ForbiddenError('Only a tenant admin can issue codes');
    if (!(await this.batches.find(input.batchNumber, actor.tenantId)))
      throw new NotFoundError('Batch not found');
    // Parsed Zod objects have stable field order and applied defaults.
    const hash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const existing = await this.repository.findIdempotent(ownerId, key);
    if (existing) return this.replay(existing, hash);
    return this.generate(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const now = new Date();
        const job: CodeJobRecord = {
          id: randomUUID(),
          ownerId,
          idempotencyKey: key,
          requestHash: hash,
          batchNumber: input.batchNumber,
          quantity: input.quantity,
          options: input.print,
          createdAt: now,
        };
        const units: CodeUnitRecord[] = [];
        for (let position = 1; position <= input.quantity; position++) {
          const token = this.tokenFactory();
          const scanUrl = scanUrlFor(this.scanOrigin, token);
          const rendered = await renderCode(scanUrl, input.print);
          units.push({
            id: randomUUID(),
            jobId: job.id,
            token,
            position,
            scanUrl,
            matrix: rendered.matrix,
            printReport: rendered.report,
            status: 'active',
            createdAt: now,
            revokedAt: null,
            revokeReason: null,
          });
        }
        try {
          await this.repository.create(job, units);
          return this.jobResponse({ job, units }, false);
        } catch (error) {
          if (!uniqueViolation(error)) throw error;
          // Another instance may have won the idempotency-key race.
          const raced = await this.repository.findIdempotent(ownerId, key);
          if (raced) return this.replay(raced, hash);
          // Token/UUID collision: the transaction rolled back, so issue fresh identities.
        }
      }
      throw new CodeError(
        'IDENTIFIER_ALLOCATION_FAILED',
        'Could not allocate unique identifiers. Nothing was issued; retry later with the same key.',
        undefined,
        503,
      );
    });
  }

  async job(ownerId: string, id: string) {
    const actor = await this.requireUser(ownerId);
    if (actor.role === 'tenant_user') throw new ForbiddenError();
    const stored = await this.repository.findJob(
      actor.role === 'super_admin' ? undefined : (actor.tenantId ?? '__none__'),
      id,
    );
    if (!stored) throw new NotFoundError('Code job not found');
    return this.jobResponse(stored, false);
  }
  private async ownedUnit(ownerId: string, id: string) {
    const actor = await this.requireUser(ownerId);
    const unit = await this.repository.findUnit(
      actor.role === 'super_admin' ? undefined : (actor.tenantId ?? '__none__'),
      id,
    );
    if (!unit) throw new NotFoundError('Code not found');
    return unit;
  }
  async unit(ownerId: string, id: string) {
    const actor = await this.requireUser(ownerId);
    if (actor.role === 'tenant_user') throw new ForbiddenError();
    return this.unitResponse(await this.ownedUnit(ownerId, id));
  }

  async artwork(ownerId: string, id: string, format: 'svg' | 'pdf') {
    const actor = await this.requireUser(ownerId);
    if (actor.role === 'tenant_user') throw new ForbiddenError();
    const unit = await this.ownedUnit(ownerId, id);
    if (unit.status === 'revoked')
      throw new CodeError(
        'CODE_REVOKED',
        'Revoked artwork cannot be downloaded.',
        undefined,
        409,
      );
    const svg = svgFor(unit.matrix, unit.printReport);
    if (
      createHash('sha256').update(svg).digest('hex') !==
      unit.printReport.svgSha256
    )
      throw new Error('Stored artwork integrity check failed');
    const data =
      format === 'svg'
        ? Buffer.from(svg)
        : Buffer.from(await pdfFor(unit.matrix, unit.printReport));
    await this.repository.recordDownload(ownerId, unit, format);
    return data;
  }
  async revoke(ownerId: string, id: string, reason: string) {
    const actor = await this.requireUser(ownerId);
    if (actor.role !== 'tenant_admin' && actor.role !== 'super_admin')
      throw new ForbiddenError('Only an administrator can revoke codes');
    const unit = await this.repository.revoke(
      ownerId,
      actor.role === 'super_admin' ? undefined : (actor.tenantId ?? '__none__'),
      id,
      reason,
    );
    if (!unit) throw new NotFoundError('Code not found');
    return this.unitResponse(unit);
  }
  async publicLookup(token: string) {
    const found = await this.repository.findPublic(token);
    if (!found) throw new NotFoundError('Code not found');
    const { unit, batch, tenantName } = found;
    return publicCodeResponseSchema.parse({
      code: {
        token: unit.token,
        status: unit.status,
        detailsStatus: 'published',
        message:
          unit.status === 'revoked'
            ? 'This code has been revoked. Contact the supplier for verification.'
            : 'This identifier is registered to the medicine batch shown below. A code can still be copied, so this page alone does not prove authenticity.',
        batch: {
          batchNumber: batch.batchNumber,
          slug: batch.slug,
          medicineName: batch.medicineName,
          medicineType: batch.medicineType,
          manufactureDate: batch.manufactureDate,
          expiryDate: batch.expiryDate,
          cautions: batch.cautions,
          variants: batch.variants,
          usages: batch.usages,
          dosages: batch.dosages,
          eligibleUsers: batch.eligibleUsers,
          sideEffects: batch.sideEffects,
          tenantName,
        },
      },
    });
  }
}
