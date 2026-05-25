export interface AnthropicCompleteOptions {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  /** Worldgen explorer dev proxy — key stays on the Vite server. */
  useDevProxy?: boolean;
}

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
}

/** Single user turn against Anthropic Messages API; returns assistant text. */
export async function anthropicComplete(options: AnthropicCompleteOptions): Promise<string> {
  const url = options.useDevProxy
    ? '/api/worldgen/anthropic/v1/messages'
    : 'https://api.anthropic.com/v1/messages';
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (!options.useDevProxy) {
    headers['x-api-key'] = options.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model ?? 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      messages: [{ role: 'user', content: options.user }]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as AnthropicMessageResponse;
  const block = data.content?.find((c) => c.type === 'text');
  if (!block?.text) {
    throw new Error('Anthropic response missing text content');
  }
  return block.text;
}
