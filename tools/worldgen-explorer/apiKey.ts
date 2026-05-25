/** How the explorer knows an Anthropic API key is available (value never stored for env/secrets). */
export type AnthropicApiKeySource = 'none' | 'env' | 'secrets-file' | 'manual';

/** UI + run routing — uses Vite-injected flags only (no secret in the client bundle). */
export function detectAnthropicApiKeySource(): AnthropicApiKeySource {
  if (import.meta.env.WG_ANTHROPIC_KEY_CONFIGURED !== 'true') {
    return 'none';
  }
  const source = import.meta.env.WG_ANTHROPIC_KEY_SOURCE;
  if (source === 'env' || source === 'secrets-file') {
    return source;
  }
  return 'none';
}

export function isAnthropicApiKeyConfigured(
  source: AnthropicApiKeySource,
  manualKey: string
): boolean {
  if (source === 'env' || source === 'secrets-file') {
    return true;
  }
  if (source === 'manual') {
    return Boolean(manualKey.trim());
  }
  return false;
}

/** Whether step 3 should call Anthropic via the local dev proxy (key stays server-side). */
export function useAnthropicDevProxy(source: AnthropicApiKeySource): boolean {
  return source === 'env' || source === 'secrets-file';
}

/** Manual override only — env/secrets keys are never returned to the browser. */
export function getManualAnthropicApiKey(manualKey: string): string | undefined {
  const k = manualKey.trim();
  return k || undefined;
}

export function apiKeySourceLabel(source: AnthropicApiKeySource): string {
  switch (source) {
    case 'env':
      return 'API key is set (.env / environment)';
    case 'secrets-file':
      return 'API key is set (.secrets/anthropic-api-key)';
    case 'manual':
      return 'API key is set (entered below)';
    default:
      return '';
  }
}
