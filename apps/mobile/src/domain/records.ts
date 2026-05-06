export type RecordType = 'food' | 'body_stats' | 'document' | 'note';

export type RecordSource = 'manual' | 'photo' | 'screenshot' | 'import' | 'ai_extract';

export type NomiRecord = {
  id: string;
  type: RecordType;
  occurredAt: string;
  source: RecordSource;
  title: string;
  summary: string;
  values: Record<string, string>;
  confidence?: number;
};

export type TrendPoint = {
  date: string;
  calories: number;
  proteinG: number;
  weightKg?: number;
  bodyFatPct?: number;
};

export const recordTypeLabel: Record<RecordType, string> = {
  food: 'Food',
  body_stats: 'Body',
  document: 'Image',
  note: 'Note',
};

export const recordTypeTone: Record<RecordType, string> = {
  food: '#6F7E48',
  body_stats: '#47645C',
  document: '#8B6F4E',
  note: '#6D6875',
};
