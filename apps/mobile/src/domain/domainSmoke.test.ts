import assert from 'node:assert/strict';

import { answerFromRecords, hasMedicalIntent } from './aiBoundary';
import { createRecordFromCapture, summarizeRecords } from './capture';
import { todayRecords } from './mockData';

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
