#!/usr/bin/env node

/**
 * Simple test script for the Discord bot API endpoint
 * Usage: node test-api.js <discord-user-id> <api-token>
 */

const [,, discordUserId, apiToken] = process.argv;

if (!discordUserId || !apiToken) {
  console.error('Usage: node test-api.js <discord-user-id> <api-token>');
  console.error('Example: node test-api.js 123456789012345678 your-api-token');
  process.exit(1);
}

async function testAPI() {
  const url = 'http://localhost:3000/api/discord/check-permissions';
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ discordUserId }),
    });

    const data = await response.json();
    
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ API test successful');
    } else {
      console.log('❌ API test failed');
    }
  } catch (error) {
    console.error('❌ Error testing API:', error instanceof Error ? error.message : String(error));
  }
}

testAPI();
