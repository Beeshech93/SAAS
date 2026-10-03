import { env } from '../../config/env';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  system: string;
  messages: ChatTurn[]; // must start with a user turn and alternate
  maxTokens?: number;
}

/** The AI module only depends on this interface, so the LLM vendor can be swapped. */
export interface AIProvider {
  complete(req: AIRequest): Promise<string>;
}

export class AIProviderError extends Error {}

export class AnthropicProvider implements AIProvider {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(req: AIRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, max_tokens: req.maxTokens ?? env.AI_MAX_TOKENS, system: req.system, messages: req.messages }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new AIProviderError('AI provider unreachable');
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok) throw new AIProviderError(json?.error?.message ?? `AI provider error ${res.status}`);
    const text = (json?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    if (!text) throw new AIProviderError('AI provider returned no text');
    return text;
  }
}

let provider: AIProvider | null = env.AI_API_KEY ? new AnthropicProvider(env.AI_API_KEY, env.AI_MODEL) : null;
export const getAIProvider = () => provider;
/** Test seam / alternative-vendor hook. */
export const setAIProvider = (p: AIProvider | null) => {
  provider = p;
};
