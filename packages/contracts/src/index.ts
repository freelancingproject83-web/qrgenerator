import { z } from 'zod';
export * from './codes.js';

export const USER_ROLES = [
  'super_admin',
  'tenant_admin',
  'tenant_user',
] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: userRoleSchema,
  tenantId: z.uuid().nullable(),
  tenantName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createAccountInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  password: z.string().min(8).max(128),
  tenantId: z.uuid(),
});

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  password: z.string().min(8).max(128),
});

export const tenantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export const createTenantInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: userSchema,
});

export const updateUserRoleInputSchema = z.object({
  role: z.enum(['tenant_user', 'tenant_admin', 'super_admin']),
});

export const userIdParamsSchema = z.object({
  userId: z.uuid(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleInputSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
