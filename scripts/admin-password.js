// Resets the password of any user (including the super admin) from the server shell.
// Usage: npm run admin:password -- someone@example.com
// Prints a new random password once. The user must change it at the next login.
import bcrypt from 'bcryptjs';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { generatePassword } from '../server/auth.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run admin:password -- <email>');
  process.exit(1);
}

const config = loadConfig();
const db = openDb(config.dbPath);
const user = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

const password = generatePassword(20);
const hash = await bcrypt.hash(password, config.auth.bcryptCost);
db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1, active = 1 WHERE id = ?').run(
  hash,
  user.id,
);
console.log(`New temporary password for ${email}:\n\n  ${password}\n\nIt must be changed at the next login.`);
db.close();
