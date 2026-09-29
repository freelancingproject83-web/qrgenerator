import type {
  AuthResponse,
  CreateAccountInput,
  LoginInput,
  User,
  UserRole,
} from '@qrgenerator/contracts';
import type { UserRecord } from '../../db/schema.js';
import { ConflictError, UnauthorizedError } from '../../errors/app-error.js';
import type { PasswordHasher } from '../../utils/password.js';
import { createRefreshToken, hashRefreshToken } from '../../utils/tokens.js';
import type {
  NewRefreshSession,
  UserRepository,
} from '../users/user.repository.js';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessTokenSigner {
  sign(input: { id: string; role: UserRole }): string;
}

export interface AuthResult extends AuthResponse {
  refreshToken: string;
}

function toUser(user: UserRecord): User {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly repository: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenSigner,
    private readonly accessTokenTtlSeconds: number,
    private readonly refreshTokenTtlDays: number,
  ) {}

  async register(
    input: CreateAccountInput,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const existingUser = await this.repository.findByEmail(input.email);
    if (existingUser)
      throw new ConflictError('An account with this email already exists');

    const passwordHash = await this.passwords.hash(input.password);
    let user: UserRecord;
    try {
      user = await this.repository.createUser({
        email: input.email,
        passwordHash,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }

    return this.createAuthenticatedSession(user, metadata);
  }

  async login(
    input: LoginInput,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const user = await this.repository.findByEmail(input.email);
    if (!user) {
      await this.passwords.hash(input.password);
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return this.createAuthenticatedSession(user, metadata);
  }

  async refresh(
    rawToken: string,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const currentTokenHash = hashRefreshToken(rawToken);
    const current = await this.repository.findRefreshSession(currentTokenHash);
    if (!current) throw new UnauthorizedError('Invalid refresh session');

    if (current.session.revokedAt) {
      await this.repository.revokeAllRefreshSessions(current.user.id);
      throw new UnauthorizedError('Refresh token reuse detected');
    }

    if (current.session.expiresAt <= new Date()) {
      await this.repository.revokeRefreshSession(currentTokenHash);
      throw new UnauthorizedError('Refresh session expired');
    }

    const refreshToken = createRefreshToken();
    const rotated = await this.repository.rotateRefreshSession(
      current.session.id,
      this.newRefreshSession(current.user.id, refreshToken, metadata),
    );

    if (!rotated) {
      await this.repository.revokeAllRefreshSessions(current.user.id);
      throw new UnauthorizedError('Refresh token reuse detected');
    }

    return this.authResult(current.user, refreshToken);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.repository.revokeRefreshSession(hashRefreshToken(rawToken));
    }
  }

  private async createAuthenticatedSession(
    user: UserRecord,
    metadata: RequestMetadata,
  ): Promise<AuthResult> {
    const refreshToken = createRefreshToken();
    await this.repository.createRefreshSession(
      this.newRefreshSession(user.id, refreshToken, metadata),
    );
    return this.authResult(user, refreshToken);
  }

  private newRefreshSession(
    userId: string,
    refreshToken: string,
    metadata: RequestMetadata,
  ): NewRefreshSession {
    return {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTokenTtlDays * 86_400_000),
      ...metadata,
    };
  }

  private authResult(user: UserRecord, refreshToken: string): AuthResult {
    return {
      accessToken: this.accessTokens.sign({ id: user.id, role: user.role }),
      expiresIn: this.accessTokenTtlSeconds,
      refreshToken,
      user: toUser(user),
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

export { toUser };
