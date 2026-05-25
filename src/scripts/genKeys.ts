/**
 * Generates an RSA-2048 key pair for JWT RS256 signing.
 * Prints base64-encoded PEM values ready to paste into your .env file.
 *
 * Run once:  npm run gen:keys
 */
import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const b64Private = Buffer.from(privateKey).toString('base64');
const b64Public  = Buffer.from(publicKey).toString('base64');

console.log('\n# Paste these into your .env.*.local file:\n');
console.log(`JWT_PRIVATE_KEY = ${b64Private}`);
console.log(`JWT_PUBLIC_KEY  = ${b64Public}`);
console.log('\n# Done. Keep JWT_PRIVATE_KEY secret — never commit it.\n');
