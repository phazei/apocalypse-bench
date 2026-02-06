export type OpenAIGenerationMetrics = {
  generationTimeMs: number | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  tps: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNonNegativeInt(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num == null) return null;
  const floored = Math.floor(num);
  return floored >= 0 ? floored : null;
}

export function extractOpenAIMetrics(
  usage: any,
  stats: any,
): OpenAIGenerationMetrics {
  // LM Studio returns usage stats directly in the response
  const promptTokens = toNonNegativeInt(usage?.prompt_tokens);
  const completionTokens = toNonNegativeInt(usage?.completion_tokens);
  const totalTokens = toNonNegativeInt(usage?.total_tokens);

  // LM Studio also returns generation stats
  const generationTimeMs = toFiniteNumber(stats?.generation_time)
    ? toFiniteNumber(stats.generation_time)! * 1000
    : null;
  const latencyMs = toFiniteNumber(stats?.time_to_first_token)
    ? toFiniteNumber(stats.time_to_first_token)! * 1000
    : null;

  const tps =
    completionTokens != null && generationTimeMs != null && generationTimeMs > 0
      ? completionTokens / (generationTimeMs / 1000)
      : toFiniteNumber(stats?.tokens_per_second) ?? null;

  return {
    generationTimeMs,
    latencyMs,
    promptTokens,
    completionTokens,
    totalTokens,
    tps,
  };
}
