const fs = require('fs');
const path = require('path');
const rvcService = require('../src/services/rvc.service');
const ttsService = require('../src/services/tts.service');

async function runTests() {
  console.log('=====================================================');
  console.log('   RVC CHARACTER VOICE CLONING DEEP VERIFICATION');
  console.log('=====================================================\n');

  let failed = 0;

  // 1. Initial Listing
  console.log('1. Testing rvcService.listModels()...');
  const initialModels = await rvcService.listModels();
  if (Array.isArray(initialModels)) {
    console.log(`   ✅ PASS: Initial models listed successfully (count: ${initialModels.length})`);
  } else {
    console.error('   ❌ FAIL: initialModels is not an array');
    failed++;
  }

  // 2. Model Creation / Registration
  console.log('\n2. Testing rvcService.saveModel()...');
  const dummyPthPath = path.join(rvcService.tempDir, `test_model_${Date.now()}.pth`);
  const dummyIndexPath = path.join(rvcService.tempDir, `test_model_${Date.now()}.index`);
  fs.writeFileSync(dummyPthPath, 'DUMMY_PTH_CONTENT_FOR_UNIT_TEST');
  fs.writeFileSync(dummyIndexPath, 'DUMMY_INDEX_CONTENT_FOR_UNIT_TEST');

  let createdModel = null;
  try {
    createdModel = await rvcService.saveModel(
      { name: 'Iron Man Test', gender: 'Male', pitchDefault: 2 },
      { path: dummyPthPath, originalname: 'iron_man.pth' },
      { path: dummyIndexPath, originalname: 'iron_man.index' }
    );

    if (createdModel && createdModel.id && createdModel.name === 'Iron Man Test' && fs.existsSync(createdModel.pthPath)) {
      console.log(`   ✅ PASS: Character model created successfully (${createdModel.id})`);
    } else {
      console.error('   ❌ FAIL: Model not created properly:', createdModel);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ FAIL: Error saving model:', err.message);
    failed++;
  }

  // 3. Retrieval by ID
  console.log('\n3. Testing rvcService.getModel()...');
  if (createdModel) {
    const fetched = await rvcService.getModel(createdModel.id);
    if (fetched && fetched.id === createdModel.id && fetched.gender === 'Male' && fetched.pitchDefault === 2) {
      console.log(`   ✅ PASS: Successfully retrieved model "${fetched.name}" with correct pitch and gender`);
    } else {
      console.error('   ❌ FAIL: Failed to retrieve model:', fetched);
      failed++;
    }
  }

  // 4. TTS Integration Mapping
  console.log('\n4. Testing ttsService character voice integration...');
  if (createdModel) {
    try {
      // Test generating a single short word with the character voice
      const ttsResult = await ttsService.generateVoices([
        {
          id: 'sub_test_rvc_01',
          khmerText: 'សួស្តី',
          voice: createdModel.id
        }
      ]);

      if (ttsResult && ttsResult.success && ttsResult.results.length === 1) {
        console.log('   ✅ PASS: TTS generated audio segment with character voice target');
      } else {
        console.error('   ❌ FAIL: TTS generation failed:', ttsResult);
        failed++;
      }
    } catch (err) {
      console.error('   ❌ FAIL: TTS with RVC threw unexpected error:', err.message);
      failed++;
    }
  }

  // 5. Cleanup / Deletion
  console.log('\n5. Testing rvcService.deleteModel()...');
  if (createdModel) {
    try {
      const delResult = await rvcService.deleteModel(createdModel.id);
      const afterList = await rvcService.listModels();
      const stillExists = afterList.some(m => m.id === createdModel.id);

      if (delResult.success && !stillExists && !fs.existsSync(createdModel.pthPath)) {
        console.log('   ✅ PASS: Model and files deleted cleanly');
      } else {
        console.error('   ❌ FAIL: Model still exists or files remained on disk');
        failed++;
      }
    } catch (err) {
      console.error('   ❌ FAIL: Delete failed:', err.message);
      failed++;
    }
  }

  console.log('\n=====================================================');
  if (failed === 0) {
    console.log('   🎉 ALL TESTS PASSED! RVC SYSTEM IS FULLY VERIFIED.');
    console.log('=====================================================');
    process.exit(0);
  } else {
    console.error(`   ❌ ${failed} TEST(S) FAILED.`);
    console.log('=====================================================');
    process.exit(1);
  }
}

runTests();
