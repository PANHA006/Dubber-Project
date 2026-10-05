const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../src/config');
const groqService = require('../src/services/groq.service');
require('dotenv').config();

async function checkKeys() {
  console.log('====================================================');
  console.log('   🔍 VERIFYING USER API KEYS IN .ENV');
  console.log('====================================================');

  const groqKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : '';
  const deepgramKey = process.env.DEEPGRAM_API_KEY ? process.env.DEEPGRAM_API_KEY.trim() : '';

  console.log('1. Groq Key present:', groqKey ? `Yes (${groqKey.slice(0, 7)}...${groqKey.slice(-4)})` : 'No');
  console.log('2. Deepgram Key present:', deepgramKey ? `Yes (${deepgramKey.slice(0, 6)}...${deepgramKey.slice(-4)})` : 'No');

  // Test 1: Generate valid 16kHz mono PCM WAV in pure JS
  const testWavPath = path.join(__dirname, 'groq_test_speech.wav');
  
  function createSineWavBuffer(durationSec = 2, sampleRate = 16000) {
    const numSamples = durationSec * sampleRate;
    const buffer = Buffer.alloc(44 + numSamples * 2);
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // PCM
    buffer.writeUInt16LE(1, 22);  // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32);  // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample
    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.floor(10000 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
      buffer.writeInt16LE(sample, 44 + i * 2);
    }
    return buffer;
  }

  fs.writeFileSync(testWavPath, createSineWavBuffer(2, 16000));
  console.log('Generated test WAV file:', fs.statSync(testWavPath).size, 'bytes');

  // Test 2: Live Groq Whisper Large-v3 API Call
  console.log('\n--- Testing Groq Cloud Whisper Large-v3 with live audio ---');
  try {
    const t0 = Date.now();
    const result = await groqService.transcribeAudio(testWavPath, {
      apiKey: groqKey,
      model: 'whisper-large-v3'
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`✅ GROQ API KEY IS 100% VALID & OPERATIONAL!`);
    console.log(`⚡ Response Time: ${dur}s`);
    console.log(`📊 Output Subtitles: ${result.length} segments`);
    if (result.length > 0) {
      console.log('Transcribed Text Sample:', result[0].originalText);
    }
  } catch (err) {
    console.error('❌ Groq API Key Verification Failed:', err.message);
  }

  // Test 3: Live Deepgram API Key Check
  if (deepgramKey) {
    console.log('\n--- Testing Deepgram API Key ---');
    try {
      const dgRes = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${deepgramKey}` }
      });
      if (dgRes.ok) {
        const dgData = await dgRes.json();
        console.log(`✅ DEEPGRAM API KEY IS 100% VALID! Projects found:`, dgData.projects?.length || 0);
      } else {
        const dgErr = await dgRes.text();
        console.log(`⚠️ Deepgram API returned status ${dgRes.status}:`, dgErr);
      }
    } catch (err) {
      console.error('Deepgram network test error:', err.message);
    }
  }

  // Cleanup
  if (fs.existsSync(testWavPath)) {
    fs.unlinkSync(testWavPath);
  }

  console.log('\n====================================================');
  console.log('   🎉 VERIFICATION COMPLETE');
  console.log('====================================================');
}

checkKeys().catch(console.error);
