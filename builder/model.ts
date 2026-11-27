// Calls to Claude for each pipeline role, with structured output, prompt caching, refusal fallbacks,
// one repair attempt, and a running cost total. A fake implementation stands in for tests.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

export type Role = 'extract' | 'architect' | 'writer' | 'examiner';

/** Which model does which job. Override with COURSE_MODEL_<ROLE>, e.g. COURSE_MODEL_WRITER=claude-opus-5-5. */
export const MODELS: Record<Role, { model: string; effort: 'low' | 'medium' | 'high' }> = {
  extract: { model: process.env.COURSE_MODEL_EXTRACT || 'claude-haiku-5-5', effort: 'low' },
  architect: { model: process.env.COURSE_MODEL_ARCHITECT || 'claude-opus-5-5', effort: 'high' },
  writer: { model: process.env.COURSE_MODEL_WRITER || 'claude-sonnet-5-5', effort: 'medium' },
  examiner: { model: process.env.COURSE_MODEL_EXAMINER || 'claude-sonnet-5-5', effort: 'medium' },
};

/** List prices in $ per million tokens (input, output). Cache writes cost 1.25× input, cache reads 0.1×. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
};

export interface Usage { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number }
export interface CallLog { role: Role; model: string; label: string; usage: Usage; ms: number; repaired: boolean }

export interface CallOptions<T> {
  role: Role;
  label: string;
  system: string;
  /** Large, identical-across-calls context (brief + source pack). Placed first and cached. */
  cached?: string;
  prompt: string;
  /** PDF files to read (base64), for extraction. */
  pdfs?: { name: string; data: string }[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  /** Extra checks on the parsed result; return problems to get one repair attempt. */
  check?: (value: T) => string[];
}

export interface Model {
  call<T>(o: CallOptions<T>): Promise<T>;
  log: CallLog[];
}

export const totalCost = (log: CallLog[]) => log.reduce((a, c) => a + c.usage.cost, 0);

export class ModelError extends Error {}

export class ClaudeModel implements Model {
  log: CallLog[] = [];
  private client = new Anthropic({ maxRetries: 4 });

  async call<T>(o: CallOptions<T>): Promise<T> {
    const { model, effort } = MODELS[o.role];
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (o.cached) content.push({ type: 'text', text: o.cached, cache_control: { type: 'ephemeral' } });
      for (const pdf of o.pdfs ?? []) content.push({ type: 'document', title: pdf.name, source: { type: 'base64', media_type: 'application/pdf', data: pdf.data } });
      content.push({ type: 'text', text: o.prompt + feedback });
      // Opus and Sonnet get server-side refusal fallbacks; Haiku has none.
      const fallback = /opus|sonnet|fable/.test(model) ? { betas: ['server-side-fallback-2026-07-01' as Anthropic.Beta.AnthropicBeta], fallbacks: 'default' as const } : {};
      const stream = this.client.beta.messages.stream({
        model,
        max_tokens: o.maxTokens ?? 32000,
        system: o.system,
        messages: [{ role: 'user', content }],
        output_config: { effort, format: zodOutputFormat(o.schema as z.ZodType) },
        ...fallback,
      });
      const msg = await stream.finalMessage();
      const u = msg.usage;
      const [pin, pout] = PRICES[model] ?? [0, 0];
      const usage: Usage = {
        input: u.input_tokens, output: u.output_tokens,
        cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
        cost: (u.input_tokens * pin + u.output_tokens * pout + (u.cache_creation_input_tokens ?? 0) * pin * 1.25 + (u.cache_read_input_tokens ?? 0) * pin * 0.1) / 1e6,
      };
      this.log.push({ role: o.role, model, label: o.label, usage, ms: Date.now() - started, repaired: attempt > 0 });
      if (msg.stop_reason === 'refusal') throw new ModelError(`${o.label}: the model declined this request.`);
      if (msg.stop_reason === 'max_tokens') { feedback = '\n\nYour previous answer was cut off. Be more concise so it fits.'; continue; }
      const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
      let value: T;
      try { value = o.schema.parse(JSON.parse(text)); }
      catch (e) { feedback = `\n\nYour previous answer was not valid: ${e instanceof Error ? e.message.slice(0, 500) : e}. Answer again.`; continue; }
      const problems = o.check?.(value) ?? [];
      if (!problems.length) return value;
      if (attempt === 1) throw new ModelError(`${o.label}: still has problems after a repair attempt:\n- ${problems.join('\n- ')}`);
      feedback = `\n\nYour previous answer had these problems. Fix all of them and answer again:\n- ${problems.join('\n- ')}`;
    }
    throw new ModelError(`${o.label}: no usable answer after 2 attempts.`);
  }
}

/** Stands in for Claude in tests: `respond` builds an answer from the call's role, label and prompt. */
export class FakeModel implements Model {
  log: CallLog[] = [];
  constructor(private respond: (o: CallOptions<unknown>) => unknown) {}
  async call<T>(o: CallOptions<T>): Promise<T> {
    let value = o.schema.parse(this.respond(o as CallOptions<unknown>));
    let repaired = false;
    const problems = o.check?.(value) ?? [];
    if (problems.length) {
      repaired = true;
      value = o.schema.parse(this.respond({ ...(o as CallOptions<unknown>), prompt: o.prompt + '\n\nREPAIR:\n- ' + problems.join('\n- ') }));
      const again = o.check?.(value) ?? [];
      if (again.length) throw new ModelError(`${o.label}: still has problems after a repair attempt:\n- ${again.join('\n- ')}`);
    }
    this.log.push({ role: o.role, model: 'fake', label: o.label, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }, ms: 0, repaired });
    return value;
  }
}

/** Runs `fn` over items with at most `n` at a time, keeping order. */
export async function pool<I, O>(items: I[], n: number, fn: (item: I, i: number) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
