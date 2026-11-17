import type { ProviderName } from '../../shared/schemas';

export interface LLMRequest {
  system: string;
  user: string;
}

export interface LLMProvider {
  name: ProviderName;
  /** Returns the raw text of a JSON response. */
  complete(req: LLMRequest): Promise<string>;
}

const DEFAULT_MODELS: Record<Exclude<ProviderName, 'mock'>, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
  ollama: 'llama3.1',
};

function requireKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Add it to your .env file or switch the provider to "mock" in Settings.`);
  return v;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

export function createProvider(name: ProviderName, model?: string): LLMProvider {
  if (name === 'mock') return { name, complete: async () => '{}' };
  const m = model || DEFAULT_MODELS[name];

  switch (name) {
    case 'gemini':
      return {
        name,
        async complete({ system, user }) {
          const key = requireKey('GEMINI_API_KEY');
          const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
          }, { 'x-goog-api-key': key });
          return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        },
      };
    case 'openai':
      return {
        name,
        async complete({ system, user }) {
          const key = requireKey('OPENAI_API_KEY');
          const data = await postJson(
            `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
            { model: m, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
            { Authorization: `Bearer ${key}` },
          );
          return data.choices?.[0]?.message?.content ?? '';
        },
      };
    case 'anthropic':
      return {
        name,
        async complete({ system, user }) {
          const key = requireKey('ANTHROPIC_API_KEY');
          const data = await postJson(
            'https://api.anthropic.com/v1/messages',
            { model: m, max_tokens: 8000, system: `${system}\nRespond with JSON only, no prose.`, messages: [{ role: 'user', content: user }] },
            { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          );
          return data.content?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        },
      };
    case 'ollama':
      return {
        name,
        async complete({ system, user }) {
          const data = await postJson(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/chat`, {
            model: m,
            format: 'json',
            stream: false,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          });
          return data.message?.content ?? '';
        },
      };
  }
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Model did not return valid JSON');
  }
}

export function configuredProviders(): Record<ProviderName, boolean> {
  return {
    mock: true,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    ollama: true,
  };
}
