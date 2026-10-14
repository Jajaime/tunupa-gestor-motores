import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Client } from 'pg';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env'), override: false });

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() ?? 'Administrador';
  if (!email || !email.includes('@'))
    throw new Error('ADMIN_EMAIL no es válido.');
  if (!password || password.length < 14)
    throw new Error('ADMIN_PASSWORD debe tener al menos 14 caracteres.');

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await client.connect();
  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    await client.query(
      `INSERT INTO public.users (email, display_name, password_hash, role, status)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
       ON CONFLICT (lower(email)) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         password_hash = EXCLUDED.password_hash,
         role = 'ADMIN',
         status = 'ACTIVE',
         failed_login_attempts = 0,
         locked_until = NULL,
         password_changed_at = now()`,
      [email, displayName, passwordHash],
    );
    process.stdout.write(`Administrador creado o actualizado: ${email}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Error desconocido'}\n`,
  );
  process.exitCode = 1;
});
