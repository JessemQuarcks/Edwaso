import jwt from 'jsonwebtoken';

// Every JWT carries an audience so a token minted for one purpose can never be
// accepted for another (e.g. a 2FA challenge presented as a customer token).
export const AUDIENCE = {
  customer: 'customer',
  admin2fa: 'admin-2fa',
} as const;
type Audience = (typeof AUDIENCE)[keyof typeof AUDIENCE];

export interface TokenClaims {
  sub: string;
  /** User.tokenVersion when issued. */
  tv: number;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

export function signToken(claims: TokenClaims, audience: Audience, expiresIn: `${number}${'m' | 'd'}`): string {
  return jwt.sign(claims, secret(), { audience, expiresIn });
}

/** Returns the claims, or null for any invalid, expired or wrong-audience token. */
export function verifyToken(token: string, audience: Audience): TokenClaims | null {
  try {
    const payload = jwt.verify(token, secret(), { audience });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.tv !== 'number') {
      return null;
    }
    return { sub: payload.sub, tv: payload.tv };
  } catch {
    return null;
  }
}
