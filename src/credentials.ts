import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Credentials {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	traleUrl: string;
	tokenEndpoint: string;
	createdAt: string;
}

const DEFAULT_PATH = join(homedir(), '.trale', 'credentials.json');

export function credentialsPath(): string {
	return process.env.TRALE_CREDENTIALS_PATH ?? DEFAULT_PATH;
}

export async function loadCredentials(): Promise<Credentials | null> {
	try {
		const raw = await readFile(credentialsPath(), 'utf8');
		const parsed = JSON.parse(raw) as Credentials;
		if (!parsed.refreshToken || !parsed.clientId || !parsed.tokenEndpoint) {
			throw new Error('credentials file is missing required fields');
		}
		return parsed;
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}

export async function saveCredentials(creds: Credentials): Promise<void> {
	const path = credentialsPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(creds, null, 2), 'utf8');
	// Best-effort tighten — POSIX only. On Windows chmod is a no-op for these bits.
	try {
		await chmod(path, 0o600);
	} catch {
		/* ignore */
	}
}

export async function deleteCredentials(): Promise<boolean> {
	try {
		await unlink(credentialsPath());
		return true;
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw err;
	}
}
