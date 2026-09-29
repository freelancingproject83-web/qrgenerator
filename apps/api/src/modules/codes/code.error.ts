import { AppError } from '../../errors/app-error.js';

export class CodeError extends AppError {
  constructor(
    code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    status = 422,
  ) {
    super(status, code, message);
  }
}
