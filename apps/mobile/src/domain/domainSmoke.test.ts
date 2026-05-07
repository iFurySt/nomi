import assert from 'node:assert/strict';

import { answerFromRecords, hasMedicalIntent } from './aiBoundary';
import { createRecordFromCapture, summarizeRecords } from './capture';
import { todayRecords } from './mockData';
import { buildUploadNote, classifyUploadAsset, createRecordFromUploadSession, UploadSession } from './upload';

const foodRecord = createRecordFromCapture({ kind: 'food', title: 'Smoke meal' }, todayRecords.length);
assert.equal(foodRecord.type, 'food');
assert.equal(foodRecord.values.protein, '28 g');

const bodyRecord = createRecordFromCapture({ kind: 'body_stats' }, todayRecords.length + 1);
assert.equal(bodyRecord.type, 'body_stats');
assert.equal(bodyRecord.values.weight, '70.8 kg');

const documentRecord = createRecordFromCapture({ kind: 'upload', title: 'Smoke screenshot' }, todayRecords.length + 2);
assert.equal(documentRecord.type, 'document');
assert.equal(documentRecord.source, 'screenshot');
assert.equal(documentRecord.values.status, 'Estimate');

const cameraAiRecord = createRecordFromCapture(
  {
    kind: 'camera',
    category: 'Food',
    subtype: 'Lunch',
    mealTime: 'Noon',
    calories: '540 kcal',
    protein: '28 g',
    confidence: 0.66,
  },
  todayRecords.length + 3,
);
assert.equal(cameraAiRecord.type, 'food');
assert.equal(cameraAiRecord.source, 'ai_extract');
assert.equal(cameraAiRecord.values.category, 'Food');
assert.equal(cameraAiRecord.values.subtype, 'Lunch');
assert.equal(cameraAiRecord.confidence, 0.66);

assert.deepEqual(classifyUploadAsset({ name: 'body-scan.png', source: 'file' }), { label: 'Body', confidence: 0.76 });
assert.deepEqual(classifyUploadAsset({ name: 'lunch-photo.jpg', source: 'library' }), {
  label: 'Food',
  confidence: 0.82,
});
assert.deepEqual(classifyUploadAsset({ name: 'receipt.png', source: 'file' }), { label: 'Image', confidence: 0.71 });

const uploadSession: UploadSession = {
  asset: {
    name: 'receipt.png',
    source: 'file',
    uri: 'file:///receipt.png',
  },
  category: 'Image',
  confidence: 0.71,
  cutoutState: 'ready',
  cutoutUri: 'file:///cutout.png',
  phase: 'ready',
};
assert.match(buildUploadNote(uploadSession), /iOS foreground cutout completed/);

const uploadedFileRecord = createRecordFromUploadSession(uploadSession, todayRecords.length + 4);
assert.equal(uploadedFileRecord.type, 'document');
assert.equal(uploadedFileRecord.source, 'screenshot');
assert.equal(uploadedFileRecord.values.originalAsset, 'available');
assert.equal(uploadedFileRecord.values.cutoutAsset, 'available');

const uploadedCameraRecord = createRecordFromUploadSession(
  {
    asset: {
      name: 'camera-food.jpg',
      source: 'camera',
      uri: 'file:///camera-food.jpg',
    },
    category: 'Food',
    confidence: 0.82,
    cutoutState: 'native-unavailable',
    phase: 'ready',
  },
  todayRecords.length + 5,
);
assert.equal(uploadedCameraRecord.type, 'food');
assert.equal(uploadedCameraRecord.source, 'ai_extract');
assert.match(uploadedCameraRecord.summary, /cutout was unavailable/);

const summary = summarizeRecords([foodRecord, bodyRecord, documentRecord, ...todayRecords]);
assert.equal(summary.protein > 0, true);
assert.equal(summary.latestWeight, '70.8 kg');

assert.equal(hasMedicalIntent('Can you diagnose this value?'), true);
assert.equal(hasMedicalIntent('How has my protein looked this week?'), false);

const blocked = answerFromRecords('Should I take medicine for this abnormal result?', todayRecords);
assert.equal(blocked.blocked, true);
assert.match(blocked.content, /cannot provide diagnosis or medical advice/i);

const answer = answerFromRecords('How has my protein looked this week?', todayRecords);
assert.equal(answer.blocked, false);
assert.equal(answer.referencedRecordIds.length > 0, true);

console.log('domain smoke passed');
