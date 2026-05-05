import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { build } from '../src/build.ts';

const execFile = promisify(execFileCallback);
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../..');

async function summarizeResponse(response) {
	const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
	const body = contentType === 'application/json' ? await response.json() : await response.text();
	return {
		status: response.status,
		contentType,
		body,
	};
}

async function ensureSdkBuild() {
	await execFile('pnpm', ['--filter', '@flue/sdk', 'build'], {
		cwd: repoRoot,
		env: process.env,
	});
}

test('built node target mounts into express at /agents', async (t) => {
	await ensureSdkBuild();

	const root = await mkdtemp(path.join(tmpdir(), 'flue-express-middleware-'));
	t.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const workspaceDir = path.join(root, 'workspace');
	const agentsDir = path.join(workspaceDir, 'agents');
	const outputDir = path.join(root, 'output');

	await mkdir(agentsDir, { recursive: true });
	await writeFile(
		path.join(agentsDir, 'echo.ts'),
		`export const triggers = { webhook: true };

export default async function ({ id, payload }) {
  return { id, payload };
}
`,
		'utf8',
	);

	await build({
		target: 'node',
		workspaceDir,
		outputDir,
	});

	const moduleUrl = pathToFileURL(path.join(outputDir, 'dist', 'server.mjs')).href;
	const builtServer = await import(moduleUrl);

	assert.equal(typeof builtServer.app?.fetch, 'function');
	assert.equal(typeof builtServer.createMiddleware, 'function');
	assert.equal(typeof builtServer.start, 'function');

	const app = express();
	app.use(express.json());
	app.use('/agents', builtServer.createMiddleware());

	const server = await new Promise((resolve) => {
		const instance = app.listen(0, () => resolve(instance));
	});

	t.after(async () => {
		await new Promise((resolve, reject) => {
			server.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	});

	const { port } = server.address();
	assert.equal(typeof port, 'number');

	const baseUrl = `http://127.0.0.1:${port}`;
	const payload = { hello: 'world', nested: { value: 1 } };

	const mountedManifest = await summarizeResponse(await fetch(`${baseUrl}/agents`));
	const standaloneManifest = await summarizeResponse(
		await builtServer.app.fetch(new Request('http://flue.local/agents')),
	);
	assert.deepEqual(mountedManifest, standaloneManifest);

	const mountedAgent = await summarizeResponse(
		await fetch(`${baseUrl}/agents/echo/test-123`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
		}),
	);
	const standaloneAgent = await summarizeResponse(
		await builtServer.app.fetch(
			new Request('http://flue.local/agents/echo/test-123', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
			}),
		),
	);
	assert.deepEqual(mountedAgent, standaloneAgent);
});
