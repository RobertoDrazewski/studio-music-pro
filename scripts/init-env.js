// Creates a local .env so you can run the app on your computer in one step.
// Usage: npm run setup            (random admin password, printed once)
//        npm run setup -- --email you@example.com --password "a long password"
// It never overwrites an existing .env.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (fs.existsSync(target)) {
  console.log('.env already exists, nothing changed. Delete it first if you want a fresh one.');
  process.exit(0);
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = arg('email') || 'admin@example.com';
const password = arg('password') || crypto.randomBytes(12).toString('base64url');
if (password.length < 10) {
  console.error('The password must have at least 10 characters.');
  process.exit(1);
}

const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const set = (text, key, value) => text.replace(new RegExp(`^#?\\s*${key}=.*$`, 'm'), `${key}=${value}`);

let env = example;
env = set(env, 'NODE_ENV', 'development');
env = set(env, 'PUBLIC_URL', 'http://localhost:3000');
env = set(env, 'ALLOWED_ORIGINS', 'http://localhost:3000');
env = set(env, 'TRUST_PROXY', '0')
env = set(env, 'JWT_SECRET', crypto.randomBytes(32).toString('hex'));
env = set(env, 'SUPERADMIN_EMAIL', email);
env = set(env, 'SUPERADMIN_PASSWORD', password);
fs.writeFileSync(target, env, { mode: 0o600 });

console.log(`
.env created.

  Admin email:    ${email}
  Admin password: ${password}

Next steps:
  1. Put your OpenAI key in .env (OPENAI_API_KEY=...). Optional: the studio works without it, only the AI assistant needs it.
  2. npm run dev
  3. Open http://localhost:3000
`);
