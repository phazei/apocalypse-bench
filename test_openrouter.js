#!/usr/bin/env node

/**
 * Test script to verify OpenRouter API access with free models
 * Tests both the free router and specific free model variants
 */

import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Test models to try
const TEST_MODELS = [
  'openrouter/free',                              // Free router (automatic selection)
  'deepseek/deepseek-r1',                        // Popular free model  
  'meta-llama/llama-3.3-70b-instruct',           // Free Llama model
  'google/gemini-2.0-flash-exp:free',            // Gemini free variant
  'qwen/qwen-2.5-72b-instruct',                  // Qwen free model
];

async function testModel(modelId) {
  const payload = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: 'Say "Hello, OpenRouter is working!" and nothing else.'
      }
    ],
    temperature: 0.7,
    max_tokens: 50
  };
  
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/yourusername/apocalypse-bench',
        'X-Title': 'Apocalypse Bench Test'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    return { success: response.ok, data, status: response.status };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Testing OpenRouter API with Free Models...\n');
  
  if (!OPENROUTER_API_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY not found in environment');
    process.exit(1);
  }
  
  console.log(`API Key: ${OPENROUTER_API_KEY.substring(0, 20)}...\n`);
  console.log('NOTE: Free models have rate limits:');
  console.log('  - 50 requests/day without purchased credits');
  console.log('  - 1000 requests/day with $10+ credits purchased\n');
  
  for (const model of TEST_MODELS) {
    console.log(`\nTrying: ${model}`);
    console.log('─'.repeat(70));
    
    const result = await testModel(model);
    
    if (result.success) {
      console.log('✓ SUCCESS!\n');
      
      // Show which model was actually used (important for openrouter/free)
      if (result.data.model) {
        console.log(`Actual model used: ${result.data.model}`);
      }
      
      if (result.data.choices && result.data.choices[0]?.message?.content) {
        console.log('\nModel output:');
        console.log(`"${result.data.choices[0].message.content}"`);
      }
      
      if (result.data.usage) {
        console.log('\nToken usage:');
        console.log(`  Prompt: ${result.data.usage.prompt_tokens}`);
        console.log(`  Completion: ${result.data.usage.completion_tokens}`);
        console.log(`  Total: ${result.data.usage.total_tokens}`);
      }
      
      console.log('\n✓ OpenRouter API is working correctly with free models!');
      console.log(`✓ Working model: ${model}`);
      process.exit(0);
      
    } else {
      console.log(`✗ FAILED (HTTP ${result.status || 'N/A'})`);
      if (result.data?.error) {
        const errorMsg = result.data.error.message || JSON.stringify(result.data.error);
        console.log(`Error: ${errorMsg}`);
        
        // Show rate limit info if present
        if (result.data.error.metadata?.raw) {
          console.log(`Details: ${result.data.error.metadata.raw}`);
        }
        
        // Detect specific error types
        if (errorMsg.includes('rate-limited') || errorMsg.includes('rate limit')) {
          console.log('⚠️  This might be a temporary rate limit.');
        }
        if (errorMsg.includes('credits')) {
          console.log('⚠️  You may need to purchase $10+ credits to use free models.');
        }
      } else if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✗ All models failed.');
  console.log('\nPossible solutions:');
  console.log('  1. Purchase $10 in credits to unlock higher free model rate limits');
  console.log('  2. Wait if you\'ve hit the 50 requests/day limit');
  console.log('  3. Check https://openrouter.ai/models for currently available free models');
  process.exit(1);
}

main();
