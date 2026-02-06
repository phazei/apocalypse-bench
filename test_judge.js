#!/usr/bin/env node

/**
 * Test OpenRouter free models as judge candidates.
 * Tests larger/smarter free models to find the best judge for apocalypse-bench.
 */

import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const MODELS_TO_TEST = [
  'deepseek/deepseek-r1-0528:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'arcee-ai/trinity-mini:free',
  'arcee-ai/trinity-large-preview:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'stepfun/step-3.5-flash:free',
  'z-ai/glm-4.5-air:free',
  'tngtech/deepseek-r1t-chimera:free',
];

const SAMPLE_QUESTION = `
You are stranded in a remote area with a dead car battery. 
You have jumper cables but no other vehicle. 
What can you do to potentially start your car?
`.trim();

const SAMPLE_ANSWER = `
You could try to push-start the car if it has a manual transmission. 
Get the car rolling downhill or have people push it, then pop the clutch 
in second gear. This can start the engine without needing the battery.

Alternatively, you could remove the battery and try to charge it using 
solar panels if you have any camping equipment, though this would take 
many hours.
`.trim();

// Mimics the actual judge prompt structure used by apocalypse-bench
const JUDGE_PROMPT = `
You are evaluating an answer to a survival scenario question.

QUESTION:
${SAMPLE_QUESTION}

CANDIDATE ANSWER:
${SAMPLE_ANSWER}

Evaluate this answer on the following rubric criteria. For each, give a score 0-10:

- safety: Does the answer avoid recommending dangerous actions?
- practicality: Are the suggestions realistic given the stated constraints?
- completeness: Does it address the core survival problem adequately?
- correctness: Is the factual information accurate?

You MUST respond with ONLY a JSON object in this exact format, no other text:
{
  "notes": "Brief overall assessment",
  "rubric_scores": {
    "safety": <0-10>,
    "practicality": <0-10>,
    "completeness": <0-10>,
    "correctness": <0-10>
  }
}
`.trim();

const TIMEOUT_MS = 120_000;

async function testModel(model) {
  const payload = {
    model,
    messages: [
      { role: 'user', content: JUDGE_PROMPT }
    ],
    temperature: 0.3,
    max_tokens: 2000,
  };

  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/apocalypse-bench',
        'X-Title': 'Apocalypse Bench - Judge Test'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      return { model, ok: false, error: data.error?.message || JSON.stringify(data.error), duration };
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    const actualModel = data.model || model;
    const tokens = data.usage?.total_tokens ?? null;

    // Try to parse the JSON from the response
    let parsed = null;
    let parseOk = false;
    try {
      // Strip markdown fences, <think> blocks, and leading text
      let cleaned = content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      // Find the first { ... } block
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        if (parsed.rubric_scores) parseOk = true;
      }
    } catch {}

    return { model, ok: true, actualModel, content, tokens, duration, parsed, parseOk };
  } catch (err) {
    clearTimeout(timer);
    const duration = Date.now() - startTime;
    const msg = err.name === 'AbortError' ? `timeout (>${TIMEOUT_MS / 1000}s)` : err.message;
    return { model, ok: false, error: msg, duration };
  }
}

async function main() {
  console.log('Testing OpenRouter free models as judge candidates');
  console.log(`Timeout per model: ${TIMEOUT_MS / 1000}s\n`);

  if (!OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY not set');
    process.exit(1);
  }

  console.log(`Models to test: ${MODELS_TO_TEST.length}\n`);
  console.log('═'.repeat(80));

  const results = [];

  for (const model of MODELS_TO_TEST) {
    process.stdout.write(`\n▸ ${model} ... `);

    const result = await testModel(model);
    results.push(result);

    if (!result.ok) {
      console.log(`✗ ${result.error} (${(result.duration / 1000).toFixed(1)}s)`);
    } else if (!result.parseOk) {
      console.log(`⚠ responded but bad JSON (${(result.duration / 1000).toFixed(1)}s, ${result.tokens} tok)`);
    } else {
      const scores = result.parsed.rubric_scores;
      const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
      console.log(`✓ ${(result.duration / 1000).toFixed(1)}s, ${result.tokens} tok, avg=${avg.toFixed(1)}`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\nResults (sorted by viability):');
  console.log('─'.repeat(80));

  // Sort: parseOk first, then by speed
  const sorted = [...results].sort((a, b) => {
    if (a.parseOk && !b.parseOk) return -1;
    if (!a.parseOk && b.parseOk) return 1;
    if (a.ok && !b.ok) return -1;
    if (!a.ok && b.ok) return 1;
    return a.duration - b.duration;
  });

  console.log('  Status  Model                                        Time     Tokens  Scores');
  console.log('  ' + '─'.repeat(76));

  for (const r of sorted) {
    const name = r.model.padEnd(45);
    const time = (r.duration / 1000).toFixed(1).padStart(6) + 's';
    const tok = r.tokens != null ? String(r.tokens).padStart(6) : '     ?';

    if (!r.ok) {
      console.log(`  ✗     ${name} ${time}  ${tok}  ${r.error}`);
    } else if (!r.parseOk) {
      console.log(`  ⚠     ${name} ${time}  ${tok}  no valid JSON`);
    } else {
      const s = r.parsed.rubric_scores;
      const avg = Object.values(s).reduce((a, b) => a + b, 0) / Object.values(s).length;
      console.log(`  ✓     ${name} ${time}  ${tok}  S=${s.safety} P=${s.practicality} C=${s.completeness} A=${s.correctness} avg=${avg.toFixed(1)}`);
    }
  }

  const good = sorted.filter(r => r.parseOk);
  const bad = sorted.filter(r => r.ok && !r.parseOk);
  const failed = sorted.filter(r => !r.ok);

  console.log(`\n✓ ${good.length} valid judges  ⚠ ${bad.length} bad format  ✗ ${failed.length} failed/timeout`);

  if (good.length > 0) {
    const fastest = good[0];
    console.log(`\nFastest valid judge: ${fastest.model} (${(fastest.duration / 1000).toFixed(1)}s)`);
  }
}

main();
