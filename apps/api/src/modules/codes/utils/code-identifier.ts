import { randomBytes } from 'node:crypto';

// RFC 4648 base32, 16 bytes = 128 random bits = 26 unpadded characters.
// Uppercase stays in QR alphanumeric mode, including the controlled origin.
export function createCodeToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let accumulator = 0;
  let bits = 0;
  let result = '';
  for (const byte of randomBytes(16)) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

export function scanUrlFor(origin: string, token: string): string {
  return `${new URL(origin).origin.toUpperCase()}/${token}`;
}
