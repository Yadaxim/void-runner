import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { anthropicProxyPlugin } from './tools/worldgen-explorer/anthropicProxyPlugin';

const repoRoot = resolve(import.meta.dirname);

function readAnthropicKeyFromSecretsFile(): string {
  const path = resolve(repoRoot, '.secrets/anthropic-api-key');
  if (!existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf8').trim();
}

function resolveAnthropicApiKeyForExplorer(mode: string): {
  key: string;
  source: 'none' | 'env' | 'secrets-file';
} {
  const env = loadEnv(mode, repoRoot, ['VITE_', 'ANTHROPIC_']);
  const fromEnv = (env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '').trim();
  if (fromEnv) {
    return { key: fromEnv, source: 'env' };
  }

  const fromFile = readAnthropicKeyFromSecretsFile();
  if (fromFile) {
    return { key: fromFile, source: 'secrets-file' };
  }

  return { key: '', source: 'none' };
}

export default defineConfig(({ mode }) => {
  const { key: apiKey, source: apiKeySource } = resolveAnthropicApiKeyForExplorer(mode);

  return {
    root: repoRoot,
    envDir: repoRoot,
    envPrefix: ['VITE_', 'ANTHROPIC_', 'WG_'],
    plugins: [anthropicProxyPlugin(apiKey, apiKeySource)],
    worker: {
      format: 'es'
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(repoRoot, 'index.html'),
          worldgenExplorer: resolve(repoRoot, 'tools/worldgen-explorer/index.html')
        }
      }
    }
  };
});
