import { LLMProvider, ParentSettings } from '../types';

/**
 * The one place the app talks to a model.
 *
 * This was three copies inside `llmAgentService` - one per provider, each with
 * its own endpoint, its own auth header, its own way of digging the text out of
 * a response, and its own JSON parsing. Three copies of a request were tolerable
 * while there was one thing to ask. Reading a term of photographs makes it a
 * second caller, and a third is already in the plan, so the choice was to write
 * the fourth, fifth and sixth copies or to write this.
 *
 * What lives here is transport: where to send it, how to authenticate, how to
 * ask for JSON that matches a schema, and how to turn a failure into one line a
 * parent can act on. What does not live here is any prompt - callers own what
 * they ask for, because a module that owns both the question and the wire ends
 * up as the only place anybody can change either.
 *
 * Raw `fetch` rather than the Anthropic SDK, deliberately. Two of the three
 * providers this family might use have no SDK here, so an SDK would mean two
 * ways of making the same call in one file; the bundle is already over Vite's
 * chunk warning; and the browser-access opt-in below is the entire difference
 * between a working call and a CORS failure either way.
 */

/** The providers that can actually be called. `LOCAL` means the offline engine. */
export type LiveProvider = Exclude<LLMProvider, 'LOCAL'>;

export interface LlmImage {
  mimeType: string;
  /** Base64 payload with no data: prefix and no newlines. */
  base64: string;
}

export interface LlmCall {
  settings: ParentSettings;
  prompt: string;
  /** A photograph to read. Every current model of all three providers takes one. */
  image?: LlmImage;
  /**
   * JSON schema the answer must match.
   *
   * Anthropic constrains generation to it, which is the difference between
   * parsing a reply and hoping about one. Gemini and OpenAI are asked for JSON
   * and the schema is put in the prompt - weaker, and still far better than
   * regex-matching a brace out of prose, which is what this replaced.
   */
  schema?: Record<string, unknown>;
  maxTokens?: number;
}

export interface LlmResult<T> {
  data: T;
  provider: LiveProvider;
  model: string;
}

/** Turns whatever a provider returned into one line a parent can act on. */
export async function describeHttpFailure(provider: string, res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.error?.type || JSON.stringify(body).slice(0, 200);
  } catch {
    detail = await res.text().catch(() => '');
  }

  if (res.status === 401 || res.status === 403) {
    return `${provider} rejected the API key (HTTP ${res.status}). Check the key in AI Audit Settings.`;
  }
  if (res.status === 429) {
    return `${provider} rate limit or quota reached (HTTP 429). Try again later, or check billing.`;
  }
  if (res.status === 404) {
    return `${provider} does not recognise the model name "${detail ? detail.slice(0, 80) : 'unknown'}" (HTTP 404).`;
  }
  return `${provider} returned HTTP ${res.status}. ${detail.slice(0, 160)}`.trim();
}

const PROVIDER_LABEL: Record<LiveProvider, string> = {
  CLAUDE: 'Anthropic Claude',
  GEMINI: 'Google Gemini',
  OPENAI: 'OpenAI',
};

const DEFAULT_MODEL: Record<LiveProvider, string> = {
  CLAUDE: 'claude-opus-5',
  GEMINI: 'gemini-1.5-pro',
  OPENAI: 'gpt-4o',
};

/**
 * Whether a live call is even possible, and why not when it is not.
 *
 * Returned as a reason rather than a boolean because "no key saved" and "you
 * chose the offline engine" are different situations and the portal has been
 * showing a warning for both.
 */
export function liveProvider(settings: ParentSettings): {
  provider?: LiveProvider;
  reason?: string;
} {
  if (settings.llmProvider === 'LOCAL') return {};
  const provider = settings.llmProvider as LiveProvider;

  if (!settings.llmApiKey || settings.llmApiKey.trim() === '') {
    return {
      reason: `${PROVIDER_LABEL[provider]} is selected but no API key is saved on this device.`,
    };
  }
  return { provider };
}

export function modelFor(settings: ParentSettings, provider: LiveProvider): string {
  return settings.llmModelName?.trim() || DEFAULT_MODEL[provider];
}

/**
 * Pulls an object out of whatever the model said.
 *
 * With a schema on Anthropic the first text block is already valid JSON. The
 * other two are asked for JSON and mostly comply; the brace match is the last
 * resort for the reply that arrives wrapped in a sentence, and it throwing is
 * better than a caller silently storing `undefined` everywhere.
 */
function parseJson<T>(text: string, provider: LiveProvider): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const braced = text.match(/\{[\s\S]*\}/)?.[0];
    if (braced) {
      try {
        return JSON.parse(braced) as T;
      } catch {
        /* fall through to the error below */
      }
    }
    throw new Error(`${PROVIDER_LABEL[provider]} did not return readable JSON.`);
  }
}

async function callClaude<T>(call: LlmCall, model: string): Promise<T> {
  const content: unknown[] = [];
  if (call.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: call.image.mimeType, data: call.image.base64 },
    });
  }
  content.push({ type: 'text', text: call.prompt });

  const body: Record<string, unknown> = {
    model,
    max_tokens: call.maxTokens ?? 8000,
    messages: [{ role: 'user', content }],
  };

  /**
   * Structured output, which constrains generation rather than requesting a
   * shape politely. The response's first text block is then valid JSON by
   * construction. `additionalProperties: false` is required on every object.
   */
  if (call.schema) {
    body.output_config = { format: { type: 'json_schema', schema: call.schema } };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': call.settings.llmApiKey || '',
      'anthropic-version': '2023-06-01',
      /**
       * The correct opt-in for calling the API straight from a page. This was
       * once spelled 'dangerously-allow-browser', which is not a header the API
       * recognises, so every browser call was blocked by CORS.
       */
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await describeHttpFailure(PROVIDER_LABEL.CLAUDE, res));

  const json = await res.json();
  const text = json?.content?.find((b: { type: string }) => b.type === 'text')?.text;
  if (!text) throw new Error('Anthropic Claude returned no text content.');
  return parseJson<T>(text, 'CLAUDE');
}

async function callGemini<T>(call: LlmCall, model: string): Promise<T> {
  const parts: unknown[] = [];
  if (call.image) {
    parts.push({ inline_data: { mime_type: call.image.mimeType, data: call.image.base64 } });
  }
  parts.push({ text: withSchemaInPrompt(call) });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${call.settings.llmApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  // Without this an error body falls through to json.candidates[0] and throws a
  // bare TypeError, which told the parent nothing about the real cause.
  if (!res.ok) throw new Error(await describeHttpFailure(PROVIDER_LABEL.GEMINI, res));

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Google Gemini returned an empty response.');
  return parseJson<T>(text, 'GEMINI');
}

async function callOpenAI<T>(call: LlmCall, model: string): Promise<T> {
  const content: unknown[] = [{ type: 'text', text: withSchemaInPrompt(call) }];
  if (call.image) {
    content.unshift({
      type: 'image_url',
      image_url: { url: `data:${call.image.mimeType};base64,${call.image.base64}` },
    });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${call.settings.llmApiKey || ''}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: call.maxTokens ?? 8000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) throw new Error(await describeHttpFailure(PROVIDER_LABEL.OPENAI, res));

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned an empty response.');
  return parseJson<T>(text, 'OPENAI');
}

/**
 * The schema, spelled out in the prompt, for the two providers that cannot be
 * given one. Not equivalent to constraining generation and not pretending to
 * be: it is the difference between a guarantee and an instruction.
 */
function withSchemaInPrompt(call: LlmCall): string {
  if (!call.schema) return call.prompt;
  return `${call.prompt}\n\nReturn JSON matching exactly this schema, and nothing else:\n${JSON.stringify(
    call.schema,
    null,
    2
  )}`;
}

/**
 * Asks the configured provider a question and returns the object it answered
 * with. Throws with a sentence the portal can show; never falls back silently,
 * because a caller that cannot tell a real answer from a substituted one is how
 * the OpenAI branch spent a release claiming to have run an audit it had not.
 */
export async function askForJson<T>(call: LlmCall): Promise<LlmResult<T>> {
  const { provider, reason } = liveProvider(call.settings);
  if (!provider) {
    throw new Error(reason ?? 'No live model is configured.');
  }

  const model = modelFor(call.settings, provider);

  const data =
    provider === 'CLAUDE'
      ? await callClaude<T>(call, model)
      : provider === 'GEMINI'
        ? await callGemini<T>(call, model)
        : await callOpenAI<T>(call, model);

  return { data, provider, model };
}

/** `Blob` to the base64 an image block needs, without the data: prefix. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Chunked because `String.fromCharCode(...bytes)` on a 400 KB photo blows the
  // argument limit and throws a RangeError that reads like a network fault.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
