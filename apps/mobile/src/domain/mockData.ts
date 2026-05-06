import { NomiRecord, TrendPoint } from './records';

export const todayRecords: NomiRecord[] = [
  {
    id: 'rec-breakfast',
    type: 'food',
    occurredAt: '08:24',
    source: 'manual',
    title: 'Breakfast at home',
    summary: 'Oats, egg, yogurt, blueberries.',
    values: {
      calories: '430 kcal',
      protein: '29 g',
      carbs: '49 g',
    },
    confidence: 0.82,
  },
  {
    id: 'rec-body',
    type: 'body_stats',
    occurredAt: '07:42',
    source: 'manual',
    title: 'Morning body check',
    summary: 'Weight and body composition added by hand.',
    values: {
      weight: '70.8 kg',
      bodyFat: '18.4%',
      bmi: '22.1',
    },
  },
  {
    id: 'rec-lunch-photo',
    type: 'document',
    occurredAt: '12:38',
    source: 'photo',
    title: 'Lunch photo',
    summary: 'AI estimate waiting for review.',
    values: {
      status: 'Estimate',
      items: 'rice bowl, greens',
    },
    confidence: 0.66,
  },
];

export const timelineRecords: NomiRecord[] = [
  ...todayRecords,
  {
    id: 'rec-note',
    type: 'note',
    occurredAt: 'Yesterday 21:10',
    source: 'manual',
    title: 'Evening note',
    summary: 'Felt full after dinner. Slept earlier than usual.',
    values: {
      context: 'Dinner, sleep',
    },
  },
  {
    id: 'rec-dinner',
    type: 'food',
    occurredAt: 'Yesterday 19:18',
    source: 'ai_extract',
    title: 'Dinner estimate',
    summary: 'Salmon, potatoes, salad. User confirmed after AI extraction.',
    values: {
      calories: '620 kcal',
      protein: '41 g',
      fiber: '8 g',
    },
    confidence: 0.78,
  },
];

export const trendPoints: TrendPoint[] = [
  { date: 'Apr 30', calories: 1960, proteinG: 118, weightKg: 71.2, bodyFatPct: 18.7 },
  { date: 'May 1', calories: 2110, proteinG: 126, weightKg: 71.0, bodyFatPct: 18.6 },
  { date: 'May 2', calories: 1880, proteinG: 104, weightKg: 70.9, bodyFatPct: 18.6 },
  { date: 'May 3', calories: 2050, proteinG: 132, weightKg: 70.7, bodyFatPct: 18.4 },
  { date: 'May 4', calories: 1940, proteinG: 121, weightKg: 70.8, bodyFatPct: 18.5 },
  { date: 'May 5', calories: 2170, proteinG: 138, weightKg: 70.6, bodyFatPct: 18.3 },
  { date: 'May 6', calories: 1220, proteinG: 74, weightKg: 70.8, bodyFatPct: 18.4 },
];

export const suggestedQuestions = [
  'How has my protein looked this week?',
  'What did I usually eat for dinner lately?',
  'Which records did you use for this answer?',
];
