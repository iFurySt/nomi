import { NomiRecord } from './records';

const medicalIntentPatterns = [
  /diagnos/i,
  /treat/i,
  /medicine/i,
  /medication/i,
  /dosage/i,
  /disease risk/i,
  /emergency/i,
  /abnormal/i,
  /诊断/,
  /治疗/,
  /用药/,
  /剂量/,
  /疾病风险/,
  /急症/,
  /异常/,
];

export const medicalBoundaryMessage =
  'I can help organize and review your saved records, but I cannot provide diagnosis or medical advice. For medical decisions, please consult a qualified professional.';

export type AskAnswer = {
  blocked: boolean;
  content: string;
  referencedRecordIds: string[];
  range: string;
};

export function hasMedicalIntent(question: string) {
  return medicalIntentPatterns.some((pattern) => pattern.test(question));
}

export function answerFromRecords(question: string, records: NomiRecord[]): AskAnswer {
  const referencedRecords = records.slice(0, 4);
  const range = buildRecordRange(records);

  if (hasMedicalIntent(question)) {
    return {
      blocked: true,
      content: medicalBoundaryMessage,
      referencedRecordIds: referencedRecords.map((record) => record.id),
      range,
    };
  }

  const foodCount = records.filter((record) => record.type === 'food').length;
  const bodyCount = records.filter((record) => record.type === 'body_stats').length;

  return {
    blocked: false,
    content: `Based on ${records.length} saved records from ${range}, I found ${foodCount} food logs and ${bodyCount} body logs. I can summarize patterns, but I will not invent records that are not saved.`,
    referencedRecordIds: referencedRecords.map((record) => record.id),
    range,
  };
}

function buildRecordRange(records: NomiRecord[]) {
  if (records.length === 0) {
    return 'no saved records yet';
  }

  const first = records[records.length - 1]?.occurredAt ?? 'earliest record';
  const latest = records[0]?.occurredAt ?? 'latest record';

  return `${first} to ${latest}`;
}
