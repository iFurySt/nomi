import { CaptureDraft, createRecordFromCapture } from './capture';
import { NomiRecord } from './records';

export type UploadSource = 'camera' | 'library' | 'file';
export type UploadPhase = 'idle' | 'processing' | 'ready' | 'uploaded';
export type CutoutState = 'pending' | 'ready' | 'native-unavailable';

export type PickedUploadAsset = {
  uri?: string;
  name: string;
  source: UploadSource;
};

export type UploadSession = {
  asset: PickedUploadAsset;
  category: string;
  confidence: number;
  cutoutUri?: string;
  cutoutState: CutoutState;
  phase: UploadPhase;
};

export function classifyUploadAsset(asset: PickedUploadAsset) {
  const name = asset.name.toLowerCase();

  if (asset.source === 'camera' || name.includes('meal') || name.includes('food') || name.includes('lunch')) {
    return { label: 'Food', confidence: 0.82 };
  }

  if (name.includes('body') || name.includes('weight') || name.includes('scan')) {
    return { label: 'Body', confidence: 0.76 };
  }

  return { label: 'Image', confidence: asset.source === 'file' ? 0.71 : 0.74 };
}

export function buildUploadNote(session: UploadSession) {
  const cutoutCopy =
    session.cutoutState === 'ready'
      ? 'iOS foreground cutout completed.'
      : 'iOS foreground cutout was unavailable for this image.';

  return `Original classified as ${session.category}. ${cutoutCopy}`;
}

export function createRecordFromUploadSession(session: UploadSession, existingCount: number): NomiRecord {
  const draft: CaptureDraft = {
    kind: session.asset.source === 'file' ? 'upload' : 'camera',
    category: session.category,
    subtype: 'AI category',
    title: `${session.category} upload`,
    note: buildUploadNote(session),
    confidence: session.confidence,
    originalAssetUri: session.asset.uri,
    cutoutAssetUri: session.cutoutUri,
    cutoutState: session.cutoutState,
  };

  return createRecordFromCapture(draft, existingCount);
}
