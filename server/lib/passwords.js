import crypto from "node:crypto";

const PASSWORD_HASH_PARTS = 5;
const DEFAULT_ITERATIONS = 210000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, 64, "sha512").toString("hex");
  return `pbkdf2$sha512$${DEFAULT_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, passwordHash) {
  if (typeof password !== "string" || typeof passwordHash !== "string") return false;

  const [algorithm, digest, iterations, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "pbkdf2" || digest !== "sha512" || !salt || !expectedHash) return false;

  const iterationCount = Number(iterations);
  if (!Number.isSafeInteger(iterationCount) || iterationCount < 1 || passwordHash.split("$").length !== PASSWORD_HASH_PARTS) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "hex");
  if (!expected.length) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterationCount, expected.length, digest);
  return crypto.timingSafeEqual(actual, expected);
}
