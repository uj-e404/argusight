import { hashSync } from 'bcrypt';

const password = process.argv[2];

if (!password) {
  console.error('Usage: tsx scripts/hash-password.ts "your-password"');
  process.exit(1);
}

const hash = hashSync(password, 10);
console.log(hash);
