/**
 * Grumpkin curve ElGamal encryption for mental poker.
 *
 * Grumpkin is the "embedded curve" of BN254 — its base field equals
 * BN254's scalar field, which makes it efficient inside Noir circuits
 * that target BN254.
 *
 * Curve equation: y^2 = x^3 - 17  (mod p)
 * Where p = BN254 scalar field
 */

// ───────────────────── Constants ─────────────────────

/** BN254 scalar field = Grumpkin base field */
export const FIELD_P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Grumpkin curve parameter b = -17 */
const CURVE_B = FIELD_P - 17n;

/** Grumpkin generator — the canonical (x=1) point with y chosen < p/2 */
export const GENERATOR: Point = {
  x: 1n,
  y: 17631683881184975370165255887551781615748388533673675138860n,
};

// ───────────────────── Types ─────────────────────

export interface Point {
  x: bigint;
  y: bigint;
}

export interface EncryptedCard {
  c1: Point;
  c2: Point;
}

// ───────────────────── Modular Arithmetic ─────────────────────

/** Modular reduction that always returns a non-negative value. */
function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

/** Extended GCD: returns [gcd, x, y] such that a*x + b*y = gcd */
function extendedGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (a === 0n) return [b, 0n, 1n];
  const [g, x, y] = extendedGcd(mod(b, a), a);
  return [g, y - (b / a) * x, x];
}

/** Modular multiplicative inverse: a^(-1) mod m */
export function modInverse(a: bigint, m: bigint): bigint {
  const a_ = mod(a, m);
  const [g, x] = extendedGcd(a_, m);
  if (g !== 1n) throw new Error("Modular inverse does not exist");
  return mod(x, m);
}

/** Modular exponentiation: base^exp mod m */
function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base = mod(base, m);
  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, m);
    exp >>= 1n;
    base = mod(base * base, m);
  }
  return result;
}

/** Tonelli-Shanks square root: returns sqrt(a) mod p, or null if non-residue */
export function modSqrt(a: bigint, p: bigint): bigint | null {
  a = mod(a, p);
  if (a === 0n) return 0n;
  if (modPow(a, (p - 1n) / 2n, p) !== 1n) return null;
  if (p % 4n === 3n) return modPow(a, (p + 1n) / 4n, p);

  let q = p - 1n;
  let s = 0n;
  while (q % 2n === 0n) {
    q /= 2n;
    s += 1n;
  }
  let z = 2n;
  while (modPow(z, (p - 1n) / 2n, p) !== p - 1n) z += 1n;

  let mVar = s;
  let c = modPow(z, q, p);
  let t = modPow(a, q, p);
  let r = modPow(a, (q + 1n) / 2n, p);

  for (;;) {
    if (t === 1n) return r;
    let i = 0n;
    let temp = t;
    while (temp !== 1n) {
      temp = mod(temp * temp, p);
      i += 1n;
    }
    const b = modPow(c, 1n << (mVar - i - 1n), p);
    mVar = i;
    c = mod(b * b, p);
    t = mod(t * c, p);
    r = mod(r * b, p);
  }
}

// ───────────────────── EC Point Operations ─────────────────────

/** Check if a point is on the Grumpkin curve: y^2 = x^3 - 17 */
export function isOnCurve(pt: Point): boolean {
  const lhs = mod(pt.y * pt.y, FIELD_P);
  const rhs = mod(pt.x * pt.x * pt.x + CURVE_B, FIELD_P);
  return lhs === rhs;
}

/** Negate a point: -(x, y) = (x, -y) */
export function pointNegate(pt: Point): Point {
  return { x: pt.x, y: mod(-pt.y, FIELD_P) };
}

/**
 * Elliptic curve point addition on Grumpkin.
 * Returns null for the point at infinity.
 */
export function pointAdd(
  p1: Point | null,
  p2: Point | null,
): Point | null {
  if (p1 === null) return p2;
  if (p2 === null) return p1;

  const { x: x1, y: y1 } = p1;
  const { x: x2, y: y2 } = p2;

  // P + (-P) = O
  if (x1 === x2 && y1 === mod(-y2, FIELD_P)) return null;

  let lam: bigint;
  if (x1 === x2 && y1 === y2) {
    // Point doubling: lambda = 3x^2 / 2y  (a=0 for Grumpkin)
    lam = mod(3n * x1 * x1 * modInverse(2n * y1, FIELD_P), FIELD_P);
  } else {
    // Point addition: lambda = (y2-y1) / (x2-x1)
    lam = mod((y2 - y1) * modInverse(x2 - x1, FIELD_P), FIELD_P);
  }

  const x3 = mod(lam * lam - x1 - x2, FIELD_P);
  const y3 = mod(lam * (x1 - x3) - y1, FIELD_P);
  return { x: x3, y: y3 };
}

/** Scalar multiplication via double-and-add. */
export function scalarMul(point: Point, scalar: bigint): Point | null {
  scalar = mod(scalar, FIELD_P);
  if (scalar === 0n) return null;

  let result: Point | null = null;
  let addend: Point | null = point;

  while (scalar > 0n) {
    if (scalar & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    scalar >>= 1n;
  }
  return result;
}

// ───────────────────── ElGamal Operations ─────────────────────

/**
 * ElGamal encrypt a message point under a public key.
 * C1 = r * G,  C2 = M + r * PK
 */
export function elgamalEncrypt(
  message: Point,
  pubKey: Point,
  randomness: bigint,
): EncryptedCard {
  const c1 = scalarMul(GENERATOR, randomness)!;
  const rPK = scalarMul(pubKey, randomness)!;
  const c2 = pointAdd(message, rPK)!;
  return { c1, c2 };
}

/**
 * Re-encrypt an ElGamal ciphertext with fresh randomness.
 * newC1 = C1 + r * G,  newC2 = C2 + r * PK
 */
export function elgamalReEncrypt(
  card: EncryptedCard,
  pubKey: Point,
  randomness: bigint,
): EncryptedCard {
  const rG = scalarMul(GENERATOR, randomness)!;
  const rPK = scalarMul(pubKey, randomness)!;
  const c1 = pointAdd(card.c1, rG)!;
  const c2 = pointAdd(card.c2, rPK)!;
  return { c1, c2 };
}

/**
 * Compute a reveal token: T = sk * C1
 * Each player produces this for cards they need to help decrypt.
 */
export function computeRevealToken(secretKey: bigint, c1: Point): Point {
  const token = scalarMul(c1, secretKey);
  if (token === null) throw new Error("Reveal token is point at infinity");
  return token;
}

/**
 * Decrypt a card given the C2 component and all collected reveal tokens.
 * M = C2 - sum(tokens)
 *
 * The sum of all tokens equals sum(sk_i * C1) = (sum(sk_i)) * C1 = aggSk * C1.
 * Since C1 = totalR * G and C2 = M + totalR * aggPK = M + totalR * aggSk * G,
 * we get M = C2 - aggSk * C1.
 */
export function decryptWithTokens(
  c2: Point,
  tokens: Point[],
): Point | null {
  let sumTokens: Point | null = null;
  for (const t of tokens) {
    sumTokens = pointAdd(sumTokens, t);
  }
  if (sumTokens === null) return c2;
  const negSum = pointNegate(sumTokens);
  return pointAdd(c2, negSum);
}

/**
 * Generate a random non-zero scalar in the Grumpkin field.
 * Uses crypto.getRandomValues for cryptographic security.
 */
export function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let scalar = 0n;
  for (let i = 0; i < 32; i++) {
    scalar = (scalar << 8n) | BigInt(bytes[i]);
  }
  scalar = mod(scalar, FIELD_P - 1n) + 1n; // ensure non-zero
  return scalar;
}

/**
 * Generate an ephemeral keypair for a poker hand.
 * Returns { secretKey, publicKey } where publicKey = secretKey * G.
 */
export function generateKeypair(): { secretKey: bigint; publicKey: Point } {
  const secretKey = randomScalar();
  const publicKey = scalarMul(GENERATOR, secretKey)!;
  return { secretKey, publicKey };
}

/**
 * Compute the aggregate public key from all players' public keys.
 * aggPK = pk_1 + pk_2 + ... + pk_n
 */
export function computeAggregateKey(publicKeys: Point[]): Point {
  let agg: Point | null = null;
  for (const pk of publicKeys) {
    agg = pointAdd(agg, pk);
  }
  if (agg === null) throw new Error("Aggregate key is point at infinity");
  return agg;
}
