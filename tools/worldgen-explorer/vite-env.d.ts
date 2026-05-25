/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_API_KEY?: string;
  /** Injected by vite — "true" | "false" only; never the secret itself. */
  readonly WG_ANTHROPIC_KEY_CONFIGURED?: string;
  readonly WG_ANTHROPIC_KEY_SOURCE?: 'none' | 'env' | 'secrets-file';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
