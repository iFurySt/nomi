import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NomiImageCutoutModule = {
  generateCutoutAsync(uri: string): Promise<string>;
};

type NativeCutoutResult =
  | {
      state: 'ready';
      uri: string;
    }
  | {
      state: 'native-unavailable';
    };

let nativeModule: NomiImageCutoutModule | null | undefined;

export async function generateNativeCutout(uri?: string): Promise<NativeCutoutResult> {
  if (Platform.OS !== 'ios' || !uri) {
    return { state: 'native-unavailable' };
  }

  const module = getNativeModule();
  if (!module) {
    return { state: 'native-unavailable' };
  }

  try {
    const cutoutUri = await module.generateCutoutAsync(uri);
    return { state: 'ready', uri: cutoutUri };
  } catch {
    return { state: 'native-unavailable' };
  }
}

function getNativeModule() {
  if (nativeModule !== undefined) {
    return nativeModule;
  }

  try {
    nativeModule = requireNativeModule<NomiImageCutoutModule>('NomiImageCutout');
  } catch {
    nativeModule = null;
  }

  return nativeModule;
}
