import { z } from 'zod';

export const codeTokenSchema = z.string().regex(/^[A-Z2-7]{25}[AEIMQUY4]$/);
export const codeStatusSchema = z.enum(['active', 'revoked']);
const printFields = {
  moduleSizeMm: z.number().min(0.125).max(1).default(0.125),
  printerDpi: z.number().int().min(200).max(2400).default(600),
  printMode: z.enum(['standard', 'experimental']).default('standard'),
  maxSizeMm: z.number().min(1).max(100).optional(),
};
export const codePrintOptionsSchema = z.discriminatedUnion('format', [
  z.strictObject({
    ...printFields,
    format: z.literal('qr'),
    errorCorrection: z.enum(['L', 'M', 'Q', 'H']).default('M'),
    version: z.number().int().min(1).max(40).optional(),
  }),
  z.strictObject({ ...printFields, format: z.literal('data_matrix') }),
]);
export const createCodeJobSchema = z.strictObject({
  quantity: z.number().int().min(1).max(50).default(10),
  reference: z.string().trim().min(1).max(80).optional(),
  print: codePrintOptionsSchema,
});
export const revokeCodeSchema = z.strictObject({
  reason: z.string().trim().min(1).max(300),
});
export const codeIdParamsSchema = z.object({ id: z.uuid() });
export const publicCodeParamsSchema = z.object({ token: codeTokenSchema });
export const idempotencyKeySchema = z.uuid();

export const printReportSchema = z.object({
  format: z.enum(['qr', 'data_matrix']),
  encoder: z.string(),
  version: z.string(),
  errorCorrection: z.enum(['L', 'M', 'Q', 'H', 'ECC200']),
  encodedCharacters: z.number().int(),
  symbolModules: z.number().int(),
  quietZoneModulesPerSide: z.number().int(),
  totalModules: z.number().int(),
  requestedModuleSizeMm: z.number(),
  actualModuleSizeMm: z.number(),
  symbolSizeMm: z.number(),
  quietZoneMmPerSide: z.number(),
  totalSizeMm: z.number(),
  printerDpi: z.number().int(),
  dotsPerModule: z.number().int(),
  totalPrinterDots: z.number().int(),
  printMode: z.enum(['standard', 'experimental']),
  digitalVerification: z.literal('passed'),
  physicalQualification: z.literal('not_tested'),
  svgSha256: z.string().length(64),
  warnings: z.array(z.string()),
  instructions: z.array(z.string()),
});
export const codeUnitResponseSchema = z.object({
  id: z.uuid(),
  token: codeTokenSchema,
  jobId: z.uuid(),
  position: z.number().int(),
  scanUrl: z.string(),
  status: codeStatusSchema,
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  revokeReason: z.string().nullable(),
  print: printReportSchema,
  downloads: z.object({ svg: z.string(), pdf: z.string() }),
});
export const codeJobResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
  quantity: z.number().int(),
  replayed: z.boolean(),
  codes: z.array(codeUnitResponseSchema),
});
export const codePreviewResponseSchema = z.object({
  issued: z.literal(false),
  message: z.string(),
  scanUrl: z.string(),
  svg: z.string(),
  print: printReportSchema,
});
export const publicCodeResponseSchema = z.object({
  code: z.object({
    token: codeTokenSchema,
    status: codeStatusSchema,
    detailsStatus: z.literal('not_published'),
    message: z.string(),
  }),
});
export type CodePrintOptions = z.infer<typeof codePrintOptionsSchema>;
export type CreateCodeJob = z.infer<typeof createCodeJobSchema>;
export type PrintReport = z.infer<typeof printReportSchema>;
export type CodeJobResponse = z.infer<typeof codeJobResponseSchema>;
export type CodePreviewResponse = z.infer<typeof codePreviewResponseSchema>;
