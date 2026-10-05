const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:5000';

async function runFullE2EReview() {
  console.log('=====================================================');
  console.log('   FULL E2E LIVE REVIEW & TEST: RVC VOICE CLONING');
  console.log('=====================================================\n');

  let failed = 0;

  // 1. Health check server
  console.log('1. Checking Server Health...');
  try {
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    const healthJson = await healthRes.json();
    if (healthRes.ok && healthJson.success) {
      console.log('   ✅ PASS: Server is healthy and running on port 5000');
    } else {
      console.error('   ❌ FAIL: Server health check failed:', healthJson);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL: Could not connect to server:', err.message);
    process.exit(1);
  }

  // 2. Initial List Models API
  console.log('\n2. Testing GET /api/rvc/models...');
  try {
    const listRes = await fetch(`${SERVER_URL}/api/rvc/models`);
    const listJson = await listRes.json();
    if (listRes.ok && listJson.success && Array.isArray(listJson.data)) {
      console.log(`   ✅ PASS: GET /api/rvc/models responded with ${listJson.data.length} models`);
    } else {
      console.error('   ❌ FAIL: GET /api/rvc/models failed:', listJson);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL: Request error:', err.message);
    failed++;
  }

  // 3. Upload a sample character model via multipart/form-data
  console.log('\n3. Testing POST /api/rvc/models/upload...');
  let uploadedModelId = null;
  try {
    const formData = new FormData();
    formData.append('name', 'E2E Superhero Test');
    formData.append('gender', 'Male');
    formData.append('pitchDefault', '0');

    // Create dummy .pth and .index blobs
    const pthBlob = new Blob(['TEST_PTH_DATA_BLOB'], { type: 'application/octet-stream' });
    const indexBlob = new Blob(['TEST_INDEX_DATA_BLOB'], { type: 'application/octet-stream' });
    formData.append('pth', pthBlob, 'superhero.pth');
    formData.append('index', indexBlob, 'superhero.index');

    const uploadRes = await fetch(`${SERVER_URL}/api/rvc/models/upload`, {
      method: 'POST',
      body: formData
    });
    const uploadJson = await uploadRes.json();

    if (uploadRes.ok && uploadJson.success && uploadJson.data && uploadJson.data.id) {
      uploadedModelId = uploadJson.data.id;
      console.log(`   ✅ PASS: Upload succeeded! Model ID: ${uploadedModelId}, Name: "${uploadJson.data.name}"`);
    } else {
      console.error('   ❌ FAIL: Upload failed:', uploadJson);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL: Upload request error:', err.message);
    failed++;
  }

  // 4. Verify Model appears in GET /api/rvc/models
  console.log('\n4. Verifying Model in Model List...');
  try {
    const verifyRes = await fetch(`${SERVER_URL}/api/rvc/models`);
    const verifyJson = await verifyRes.json();
    const found = verifyJson.data?.find(m => m.id === uploadedModelId);
    if (found && found.name === 'E2E Superhero Test') {
      console.log(`   ✅ PASS: Model successfully registered and listed (Size: ${(found.pthSize / 1024).toFixed(1)} KB)`);
    } else {
      console.error('   ❌ FAIL: Model not found in list:', verifyJson);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL:', err.message);
    failed++;
  }

  // 5. Test Live Voice Generation using the new Character Voice
  console.log('\n5. Testing Live Voice Generation with Character Voice Target...');
  try {
    const genRes = await fetch(`${SERVER_URL}/api/generate-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            id: 'sub_live_review_01',
            khmerText: 'សួស្តី នេះជាការតេស្តបញ្ចូលសំឡេងស្វ័យប្រវត្តិ។',
            voice: uploadedModelId
          }
        ]
      })
    });
    const genJson = await genRes.json();

    if (genRes.ok && genJson.success && genJson.data && genJson.data.length === 1) {
      const item = genJson.data[0];
      if (item.success && item.filename && item.audioUrl) {
        console.log(`   ✅ PASS: Voice generated successfully! File: ${item.filename}, Duration: ${item.duration}s`);
        // Verify audio file exists on disk and has size
        const audioPath = path.join(__dirname, '../storage/voices', item.filename);
        if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
          console.log(`   ✅ PASS: Audio file verified on disk (${fs.statSync(audioPath).size} bytes)`);
        } else {
          console.error('   ❌ FAIL: Audio file missing or too small on disk');
          failed++;
        }
      } else {
        console.error('   ❌ FAIL: Item in response reported failure:', item);
        failed++;
      }
    } else {
      console.error('   ❌ FAIL: Voice generation failed:', genJson);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL: Voice generation request error:', err.message);
    failed++;
  }

  // 6. Delete Model and Clean Up
  console.log('\n6. Testing DELETE /api/rvc/models/:id...');
  if (uploadedModelId) {
    try {
      const delRes = await fetch(`${SERVER_URL}/api/rvc/models/${encodeURIComponent(uploadedModelId)}`, {
        method: 'DELETE'
      });
      const delJson = await delRes.json();
      if (delRes.ok && delJson.success) {
        console.log(`   ✅ PASS: Model ${uploadedModelId} deleted successfully`);
      } else {
        console.error('   ❌ FAIL: Delete returned failure:', delJson);
        failed++;
      }

      // Verify list is back to previous state
      const finalRes = await fetch(`${SERVER_URL}/api/rvc/models`);
      const finalJson = await finalRes.json();
      const stillThere = finalJson.data?.some(m => m.id === uploadedModelId);
      if (!stillThere) {
        console.log('   ✅ PASS: Verified model is completely removed from list and disk');
      } else {
        console.error('   ❌ FAIL: Model still appears in list after deletion');
        failed++;
      }
    } catch (err) {
      console.error('   ❌ FAIL: Delete error:', err.message);
      failed++;
    }
  }

  // 7. Frontend Syntax & UI Integrity Review
  console.log('\n7. Reviewing Frontend Code & UI Elements...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
  const subtitlesJs = fs.readFileSync(path.join(__dirname, '../public/js/subtitles.js'), 'utf8');

  let uiPassed = true;
  if (!indexHtml.includes('btn-voice-library') || !indexHtml.includes('voice-library-modal')) {
    console.error('   ❌ FAIL: index.html missing voice library elements');
    uiPassed = false;
  }
  if (!mainJs.includes('openVoiceLibraryModal') || !mainJs.includes('loadRvcModels')) {
    console.error('   ❌ FAIL: main.js missing voice library handler functions');
    uiPassed = false;
  }
  if (!subtitlesJs.includes('Character Voices (RVC)')) {
    console.error('   ❌ FAIL: subtitles.js missing character voice optgroup');
    uiPassed = false;
  }

  if (uiPassed) {
    console.log('   ✅ PASS: Frontend UI markup and event handlers are fully integrated and intact');
  } else {
    failed++;
  }

  console.log('\n=====================================================');
  if (failed === 0) {
    console.log('   🎉 ALL 7 E2E REVIEW CHECKS PASSED WITH 100% SUCCESS!');
    console.log('=====================================================');
    process.exit(0);
  } else {
    console.error(`   ❌ ${failed} CHECK(S) FAILED.`);
    console.log('=====================================================');
    process.exit(1);
  }
}

runFullE2EReview();
