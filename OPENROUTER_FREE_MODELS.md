# OpenRouter Free Models - Testing Results

**Date:** February 6, 2026  
**Status:** ✓ WORKING

## Summary

OpenRouter free models **DO WORK** with your API key. The issue was using incorrect model identifiers.

## Key Findings

1. **API Key Status:** Valid and working ✓
2. **Free Models Access:** Available ✓  
3. **Rate Limits:**
   - Without purchased credits: 50 requests/day
   - With $10+ credits: 1,000 requests/day
4. **Account Status:** No credits purchased (but not required for free models)

## Working Solution

Use the **`openrouter/free` router** instead of specific model names:

```yaml
judge:
  router: 'openrouter'
  model: 'openrouter/free'  # ← This automatically selects from available free models
  provider: null
  temperature: null
  maxTokens: 16000
  structured: true
  reasoning: false
```

## Test Results

### ✓ SUCCESSFUL
- `openrouter/free` → Routes to: `arcee-ai/trinity-large-preview:free`
  - Response: "Hello, OpenRouter is working!"
  - Tokens: 22 prompt + 8 completion = 30 total

### ✗ FAILED (Models not available)
- `google/gemini-2.0-flash-exp:free` - No endpoints found
- `meta-llama/llama-3.2-1b-instruct:free` - No endpoints found  
- `meta-llama/llama-3.2-3b-instruct:free` - Rate limited upstream
- `qwen/qwen-2-7b-instruct:free` - No endpoints found
- `microsoft/phi-3-mini-128k-instruct:free` - No endpoints found
- `xiaomi/mimo-v2-flash:free` - Not available

## How Free Models Work

The `openrouter/free` router:
1. Analyzes your request requirements (vision, tools, structured output, etc.)
2. Filters available free models that support those features
3. Randomly selects from the filtered pool
4. Routes your request to that model
5. Returns which model was actually used in the response metadata

## Currently Available Free Models (as of Feb 2026)

Based on search results, some free models include:
- DeepSeek R1 variants
- DeepSeek V3
- Arcee Trinity Large Preview
- GLM-4.5-Air (with thinking mode)
- Step 3.5 Flash
- Sonoma Alpha (2M token context)
- Various others - availability changes frequently

**Note:** Individual `:free` variant suffixes are unreliable. Use `openrouter/free` instead.

## Changes Made

### apocbench.yml
**Before:**
```yaml
judge:
  router: 'openrouter'
  model: 'xiaomi/mimo-v2-flash:free'  # ✗ Not available
  provider: 'xiaomi/fp8'
  reasoning: true
```

**After:**
```yaml
judge:
  router: 'openrouter'
  model: 'openrouter/free'  # ✓ Works!
  provider: null
  reasoning: false  # Not all free models support reasoning
```

### apocbench-lmstudio.yml
No changes needed - already using Anthropic Claude as judge.

## Recommendations

1. **For production judging:** Use `openrouter/free` (zero cost but rate limited)
2. **For better quality:** Purchase $10 credits to unlock 1,000 requests/day
3. **For best quality:** Use Anthropic Claude (you have $50 credits)
4. **Monitor usage:** Check which models `openrouter/free` actually uses in responses

## Test Script

Location: `test_openrouter.js`

Run with:
```bash
node test_openrouter.js
```

Tests:
- API key validation
- Multiple model routing attempts
- Error handling and diagnostics
- Rate limit detection

## References

- OpenRouter Free Models: https://openrouter.ai/collections/free-models
- Free Router Docs: https://openrouter.ai/docs/guides/routing/routers/free-models-router
- Models Browser: https://openrouter.ai/models
- FAQ: https://openrouter.ai/docs/faq
