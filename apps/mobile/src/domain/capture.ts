import { NomiRecord, RecordType } from './records';

export type CaptureKind = 'camera' | 'upload' | 'food' | 'body_stats' | 'note';

export type CaptureDraft = {
  kind: CaptureKind;
  title?: string;
  note?: string;
};

export const captureKindToRecordType: Record<CaptureKind, RecordType> = {
  camera: 'document',
  upload: 'document',
  food: 'food',
  body_stats: 'body_stats',
  note: 'note',
};

export function createRecordFromCapture(draft: CaptureDraft, existingCount = 0): NomiRecord {
  const type = captureKindToRecordType[draft.kind];
  const occurredAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const id = `local-${Date.now()}-${existingCount + 1}`;

  if (type === 'food') {
    return {
      id,
      type,
      occurredAt,
      source: 'manual',
      title: draft.title || 'Quick meal',
      summary: draft.note || 'Manual meal added from Capture.',
      values: {
        calories: '540 kcal',
        protein: '28 g',
        carbs: '62 g',
        fat: '18 g',
      },
      confidence: 0.72,
    };
  }

  if (type === 'body_stats') {
    return {
      id,
      type,
      occurredAt,
      source: 'manual',
      title: draft.title || 'Body stats',
      summary: draft.note || 'Manual body data added from Capture.',
      values: {
        weight: '70.8 kg',
        bodyFat: '18.4%',
        bmi: '22.1',
      },
    };
  }

  if (type === 'note') {
    return {
      id,
      type,
      occurredAt,
      source: 'manual',
      title: draft.title || 'Life note',
      summary: draft.note || 'A short context note saved to the log.',
      values: {
        context: 'Manual note',
      },
    };
  }

  return {
    id,
    type,
    occurredAt,
    source: draft.kind === 'camera' ? 'photo' : 'screenshot',
    title: draft.title || (draft.kind === 'camera' ? 'Photo capture' : 'Uploaded image'),
    summary: draft.note || 'Image saved with AI extraction estimate ready to review.',
    values: {
      status: 'Estimate',
      items: 'review needed',
    },
    confidence: 0.66,
  };
}

export function summarizeRecords(records: NomiRecord[]) {
  const latestWeight = records.find((record) => record.type === 'body_stats')?.values.weight ?? '--';
  const calories = records
    .filter((record) => record.type === 'food')
    .reduce((total, record) => total + parseNumber(record.values.calories), 0);
  const protein = records
    .filter((record) => record.type === 'food')
    .reduce((total, record) => total + parseNumber(record.values.protein), 0);

  return {
    calories,
    protein,
    latestWeight,
  };
}

function parseNumber(value?: string) {
  if (!value) {
    return 0;
  }

  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
