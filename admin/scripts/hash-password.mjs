// Prints the scrypt hash for BOOTSTRAP_PASSWORD_HASH. The password is read from
// stdin (not argv) so it doesn't end up in shell history or the process list.
//   node scripts/hash-password.mjs        → type the password, press Enter
import { createInterface } from 'node:readline';

const { hashPassword } = await import('../server/crypto.mts');
const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
process.stderr.write('Password: ');
const pw = await new Promise((resolve) => rl.once('line', resolve));
rl.close();
if (pw.length < 12) { console.error('\nUse at least 12 characters.'); process.exit(1); }
console.error('');
console.log(await hashPassword(pw));
