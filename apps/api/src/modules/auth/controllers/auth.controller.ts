import {
  createAccountInputSchema,
  loginInputSchema,
} from '@qrgenerator/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../../config.js';
import { UnauthorizedError } from '../../../errors/app-error.js';
import type { AuthResult, AuthService } from '../services/auth.service.js';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfig,
  ) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createAccountInputSchema.parse(request.body);
    const result = await this.authService.register(input, metadata(request));
    this.setRefreshCookie(reply, result.refreshToken);
    return reply.code(201).send(publicAuthResult(result));
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = loginInputSchema.parse(request.body);
    const result = await this.authService.login(input, metadata(request));
    this.setRefreshCookie(reply, result.refreshToken);
    return reply.send(publicAuthResult(result));
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = request.cookies[this.config.REFRESH_COOKIE_NAME];
    if (!refreshToken) throw new UnauthorizedError('Refresh cookie is missing');

    const result = await this.authService.refresh(
      refreshToken,
      metadata(request),
    );
    this.setRefreshCookie(reply, result.refreshToken);
    return reply.send(publicAuthResult(result));
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.authService.logout(
      request.cookies[this.config.REFRESH_COOKIE_NAME],
    );
    reply.clearCookie(this.config.REFRESH_COOKIE_NAME, this.cookieOptions());
    return reply.code(204).send();
  };

  private setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(this.config.REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: this.config.REFRESH_TOKEN_TTL_DAYS * 86_400,
    });
  }

  private cookieOptions() {
    const isProduction = this.config.NODE_ENV === 'production';
    return {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
    };
  }
}

function metadata(request: FastifyRequest) {
  const userAgent = request.headers['user-agent']?.slice(0, 512);
  return {
    ipAddress: request.ip,
    ...(userAgent ? { userAgent } : {}),
  };
}

function publicAuthResult(result: AuthResult) {
  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  };
}
