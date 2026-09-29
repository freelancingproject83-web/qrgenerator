import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export const passwordHasher: PasswordHasher = {
  hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  },
  async verify(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  },
};
