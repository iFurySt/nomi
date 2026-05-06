import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CaptureDraft, createRecordFromCapture } from './src/domain/capture';
import { timelineRecords } from './src/domain/mockData';
import { generateNativeCutout } from './src/native/imageCutout';
import { NomiRecord } from './src/domain/records';
import { colors, radii, shadows, spacing } from './src/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type UploadSource = 'camera' | 'library' | 'file';
type UploadPhase = 'idle' | 'processing' | 'ready' | 'uploaded';
type CutoutState = 'pending' | 'ready' | 'native-unavailable';

type PickedAsset = {
  uri?: string;
  name: string;
  source: UploadSource;
};

type UploadSession = {
  asset: PickedAsset;
  category: string;
  confidence: number;
  cutoutUri?: string;
  cutoutState: CutoutState;
  phase: UploadPhase;
};

const actionItems: Array<{
  key: UploadSource;
  label: string;
  detail: string;
  icon: IconName;
  offsetX: number;
  offsetY: number;
}> = [
  { key: 'camera', label: '拍摄', detail: 'Camera', icon: 'camera-outline', offsetX: -94, offsetY: -40 },
  { key: 'library', label: '相册', detail: 'Photos', icon: 'images-outline', offsetX: 0, offsetY: -68 },
  { key: 'file', label: '文件', detail: 'Files', icon: 'folder-open-outline', offsetX: 94, offsetY: -40 },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(() => getInitialMenuOpen());
  const [session, setSession] = useState<UploadSession | null>(() => getInitialSession());
  const [records, setRecords] = useState<NomiRecord[]>(timelineRecords);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const savedCount = records.length - timelineRecords.length;
  const phase = session?.phase ?? 'idle';

  const beginUpload = (asset: PickedAsset) => {
    setErrorMessage(null);
    setMenuOpen(false);
    const category = classifyOriginal(asset);

    setSession({
      asset,
      category: category.label,
      confidence: category.confidence,
      cutoutState: 'pending',
      phase: 'processing',
    });

    void completeUploadPipeline(asset);
  };

  const completeUploadPipeline = async (asset: PickedAsset) => {
    const [cutout] = await Promise.all([generateNativeCutout(asset.uri), delay(720)]);

    setSession((current) => {
      if (!current || current.asset.name !== asset.name) {
        return current;
      }

      return {
        ...current,
        cutoutState: cutout.state,
        cutoutUri: cutout.state === 'ready' ? cutout.uri : undefined,
        phase: 'ready',
      };
    });
  };

  const handleSelect = async (source: UploadSource) => {
    setErrorMessage(null);
    setMenuOpen(false);

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setErrorMessage('Camera permission is needed to take a photo.');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          mediaTypes: ['images'],
          quality: 0.92,
        });

        if (!result.canceled && result.assets[0]) {
          beginUpload({
            uri: result.assets[0].uri,
            name: result.assets[0].fileName ?? 'iPhone photo',
            source,
          });
        }
        return;
      }

      if (source === 'library') {
        const result = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          mediaTypes: ['images'],
          quality: 0.92,
        });

        if (!result.canceled && result.assets[0]) {
          beginUpload({
            uri: result.assets[0].uri,
            name: result.assets[0].fileName ?? 'Photo library image',
            source,
          });
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'image/*',
      });

      if (!result.canceled && result.assets[0]) {
        beginUpload({
          uri: result.assets[0].uri,
          name: result.assets[0].name,
          source,
        });
      }
    } catch {
      setErrorMessage('The picker could not open. Try another source.');
    }
  };

  const handleUpload = () => {
    if (!session) {
      return;
    }

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

    const record = createRecordFromCapture(draft, records.length);
    setRecords((currentRecords) => [record, ...currentRecords]);
    setSession((current) => (current ? { ...current, phase: 'uploaded' } : current));
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.appFrame}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Header savedCount={savedCount} />
            {phase === 'idle' ? <EmptyState /> : null}
            {phase === 'processing' ? <ProcessingState session={session} /> : null}
            {phase === 'ready' || phase === 'uploaded' ? (
              <ResultState onReset={() => setSession(null)} onUpload={handleUpload} session={session} />
            ) : null}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.accent} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </ScrollView>

          {menuOpen ? (
            <Pressable
              accessibilityLabel="Close upload menu"
              accessibilityRole="button"
              onPress={() => setMenuOpen(false)}
              style={styles.menuDismissLayer}
            />
          ) : null}

          <UploadNav
            menuOpen={menuOpen}
            onSelect={handleSelect}
            onClose={() => setMenuOpen(false)}
            onOpen={() => setMenuOpen(true)}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function getInitialMenuOpen() {
  return getLocationHash() === '#menu-open';
}

function getInitialSession(): UploadSession | null {
  const hash = getLocationHash();

  if (hash === '#upload-processing') {
    return {
      asset: {
        name: 'demo-iphone-photo.jpg',
        source: 'library',
      },
      category: 'Food',
      confidence: 0.82,
      cutoutState: 'pending',
      phase: 'processing',
    };
  }

  if (hash !== '#upload-review') {
    return null;
  }

  return {
    asset: {
      name: 'demo-iphone-photo.jpg',
      source: 'library',
    },
    category: 'Food',
    confidence: 0.82,
    cutoutState: 'native-unavailable',
    phase: 'ready',
  };
}

function getLocationHash() {
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }

  return window.location.hash;
}

function classifyOriginal(asset: PickedAsset) {
  const name = asset.name.toLowerCase();

  if (asset.source === 'camera' || name.includes('meal') || name.includes('food') || name.includes('lunch')) {
    return { label: 'Food', confidence: 0.82 };
  }

  if (name.includes('body') || name.includes('weight') || name.includes('scan')) {
    return { label: 'Body', confidence: 0.76 };
  }

  return { label: 'Image', confidence: asset.source === 'file' ? 0.71 : 0.74 };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildUploadNote(session: UploadSession) {
  const cutoutCopy =
    session.cutoutState === 'ready'
      ? 'iOS foreground cutout completed.'
      : 'iOS foreground cutout requires the native Vision boundary.';

  return `Original classified as ${session.category}. ${cutoutCopy}`;
}

function Header({ savedCount }: { savedCount: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandMark}>
        <Ionicons name="leaf-outline" size={20} color={colors.moss} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.appName}>Nomi</Text>
        <Text style={styles.headerMeta}>iPhone upload flow</Text>
      </View>
      <View style={styles.savedBadge}>
        <Text style={styles.savedBadgeValue}>{savedCount}</Text>
        <Text style={styles.savedBadgeLabel}>new</Text>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.uploadStage}>
        <View style={styles.stagePanel}>
          <View style={styles.stageHeader}>
            <Ionicons name="image-outline" size={17} color={colors.accent} />
            <Text style={styles.stageLabel}>Original</Text>
          </View>
          <View style={styles.stageImage}>
            <DemoPhoto compact />
          </View>
        </View>
        <View style={styles.stageArrow}>
          <Ionicons name="arrow-forward-outline" size={18} color={colors.textMuted} />
        </View>
        <View style={[styles.stagePanel, styles.stagePanelCutout]}>
          <View style={styles.stageHeader}>
            <Ionicons name="scan-outline" size={17} color={colors.moss} />
            <Text style={styles.stageLabel}>Cutout</Text>
          </View>
          <View style={[styles.stageImage, styles.stageCutoutImage]}>
            <DemoCutout />
          </View>
        </View>
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.eyebrow}>Original + Cutout</Text>
        <Text style={styles.title}>Upload one image. Keep both versions.</Text>
      </View>
    </View>
  );
}

function ProcessingState({ session }: { session: UploadSession | null }) {
  return (
    <View style={styles.processingWrap}>
      <View style={styles.processingHalo}>
        <AnimatedSpinner />
        <View style={styles.processingIcon}>
          <Ionicons name="scan-outline" size={34} color={colors.moss} />
        </View>
      </View>
      <Text style={styles.title}>Preparing upload</Text>
      <Text style={styles.subtitle}>
        Classifying {session?.asset.name ?? 'image'} and requesting the iPhone foreground cutout step.
      </Text>
      <View style={styles.stepCard}>
        <ProcessStep done icon="image-outline" text="Original image selected" />
        <ProcessStep done icon="sparkles-outline" text="AI category inferred" />
        <ProcessStep icon="scan-outline" text="Cutout asset processing" />
      </View>
    </View>
  );
}

function ResultState({
  session,
  onReset,
  onUpload,
}: {
  session: UploadSession | null;
  onReset: () => void;
  onUpload: () => void;
}) {
  if (!session) {
    return null;
  }

  const uploaded = session.phase === 'uploaded';
  const cutoutReady = session.cutoutState === 'ready' && Boolean(session.cutoutUri);
  const cutoutAsset = cutoutReady
    ? {
        ...session.asset,
        name: 'iOS foreground cutout.png',
        uri: session.cutoutUri,
      }
    : undefined;

  return (
    <View style={styles.resultWrap}>
      <View style={styles.resultTopRow}>
        <View>
          <Text style={styles.eyebrow}>AI category</Text>
          <Text style={styles.resultTitle}>{session.category}</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Ionicons name="sparkles-outline" size={16} color={colors.moss} />
          <Text style={styles.confidenceText}>{Math.round(session.confidence * 100)}%</Text>
        </View>
      </View>

      <View style={styles.assetGrid}>
        <AssetPanel title="Original" icon="image-outline" asset={session.asset} mode="original" />
        <AssetPanel
          title="Cutout"
          icon="scan-outline"
          asset={cutoutAsset}
          mode="cutout"
          unavailable={!cutoutReady}
        />
      </View>

      <View style={styles.nativeCard}>
        <Ionicons
          name={cutoutReady ? 'checkmark-circle-outline' : 'phone-portrait-outline'}
          size={22}
          color={cutoutReady ? colors.moss : colors.accent}
        />
        <View style={styles.nativeCopy}>
          <Text style={styles.nativeTitle}>{cutoutReady ? 'iPhone cutout ready' : 'Native cutout boundary needed'}</Text>
          <Text style={styles.nativeText}>
            {cutoutReady
              ? 'On iOS this maps to the Vision foreground mask / subject lift capability.'
              : 'Expo web cannot run Apple Vision. The native iOS module should call the Vision foreground mask request.'}
          </Text>
        </View>
      </View>

      <View style={styles.resultActions}>
        <Pressable accessibilityRole="button" onPress={onReset} style={styles.secondaryButton}>
          <Ionicons name="reload-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={uploaded}
          onPress={onUpload}
          style={[styles.uploadButton, uploaded && styles.uploadButtonDone]}
        >
          <Ionicons name={uploaded ? 'checkmark-outline' : 'cloud-upload-outline'} size={21} color={colors.white} />
          <Text style={styles.uploadButtonText}>{uploaded ? 'Uploaded' : 'Upload'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UploadNav({
  menuOpen,
  onClose,
  onOpen,
  onSelect,
}: {
  menuOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onSelect: (source: UploadSource) => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.navLayer}>
      <ActionFan menuOpen={menuOpen} onSelect={onSelect} />
      <View style={styles.bottomNav}>
        <View style={styles.navSideItem}>
          <Ionicons name="image-outline" size={22} color={colors.textMuted} />
          <Text style={styles.navSideText}>Original</Text>
        </View>
        <Pressable
          accessibilityLabel={menuOpen ? 'Close upload menu' : 'Open upload menu'}
          accessibilityRole="button"
          onPress={menuOpen ? onClose : onOpen}
          style={[styles.fab, menuOpen && styles.fabOpen]}
        >
          <Ionicons name={menuOpen ? 'close-outline' : 'add-outline'} size={34} color={colors.white} />
        </Pressable>
        <View style={styles.navSideItem}>
          <Ionicons name="scan-outline" size={22} color={colors.textMuted} />
          <Text style={styles.navSideText}>Cutout</Text>
        </View>
      </View>
    </View>
  );
}

function ActionFan({ menuOpen, onSelect }: { menuOpen: boolean; onSelect: (source: UploadSource) => void }) {
  const optionProgress = useRef(actionItems.map(() => new Animated.Value(menuOpen ? 1 : 0))).current;

  useEffect(() => {
    const animations = optionProgress.map((progress) =>
      Animated.timing(progress, {
        duration: menuOpen ? 260 : 180,
        easing: menuOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        toValue: menuOpen ? 1 : 0,
        useNativeDriver: true,
      }),
    );

    const runner = menuOpen ? Animated.stagger(72, animations) : Animated.parallel([...animations].reverse());
    runner.start();
  }, [menuOpen, optionProgress]);

  return (
    <View pointerEvents={menuOpen ? 'box-none' : 'none'} style={styles.fanLayer}>
      {actionItems.map((item, index) => {
        const progress = optionProgress[index];
        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, item.offsetX] });
        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, item.offsetY] });
        const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

        return (
          <Animated.View
            key={item.key}
            style={[
              styles.fanItemWrap,
              {
                opacity: progress,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          >
            <Pressable
              accessibilityLabel={`${item.label} ${item.detail}`}
              accessibilityRole="button"
              onPress={() => onSelect(item.key)}
              style={styles.fanItem}
            >
              <View style={styles.fanIconButton}>
                <Ionicons name={item.icon} size={24} color={colors.accent} />
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function AssetPanel({
  title,
  icon,
  asset,
  mode,
  unavailable,
}: {
  title: string;
  icon: IconName;
  asset?: PickedAsset;
  mode: 'original' | 'cutout';
  unavailable?: boolean;
}) {
  return (
    <View style={styles.assetPanel}>
      <View style={styles.assetHeader}>
        <Ionicons name={icon} size={18} color={mode === 'original' ? colors.accent : colors.moss} />
        <Text style={styles.assetTitle}>{title}</Text>
      </View>
      <View style={[styles.assetPreview, mode === 'cutout' && styles.cutoutPreview]}>
        {asset?.uri ? (
          <Image source={{ uri: asset.uri }} resizeMode="cover" style={mode === 'cutout' ? styles.cutoutImage : styles.originalImage} />
        ) : unavailable ? (
          <UnavailableCutout />
        ) : (
          <DemoPhoto compact />
        )}
      </View>
      <Text numberOfLines={1} style={styles.assetName}>
        {asset?.name ?? (unavailable ? 'Awaiting native cutout' : 'demo image')}
      </Text>
    </View>
  );
}

function UnavailableCutout() {
  return (
    <View style={styles.unavailableCutout}>
      <Ionicons name="phone-portrait-outline" size={28} color={colors.accent} />
      <Text style={styles.unavailableText}>iOS Vision</Text>
    </View>
  );
}

function DemoPhoto({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.demoPhoto, compact && styles.demoPhotoCompact]}>
      <View style={[styles.demoDot, styles.demoDotOne]} />
      <View style={[styles.demoDot, styles.demoDotTwo]} />
      <View style={[styles.demoDot, styles.demoDotThree]} />
      <View style={[styles.demoDot, styles.demoDotFour]} />
      <View style={[styles.demoPlate, compact && styles.demoPlateCompact]} />
    </View>
  );
}

function DemoCutout() {
  return (
    <View style={styles.demoCutout}>
      <View style={[styles.demoCutoutDot, styles.demoCutoutDotOne]} />
      <View style={[styles.demoCutoutDot, styles.demoCutoutDotTwo]} />
      <View style={[styles.demoCutoutDot, styles.demoCutoutDotThree]} />
      <View style={[styles.demoCutoutDot, styles.demoCutoutDotFour]} />
    </View>
  );
}

function AnimatedSpinner() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        duration: 1300,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />;
}

function ProcessStep({ done, icon, text }: { done?: boolean; icon: IconName; text: string }) {
  return (
    <View style={styles.processStep}>
      <View style={[styles.processIcon, done && styles.processIconDone]}>
        <Ionicons name={done ? 'checkmark-outline' : icon} size={18} color={done ? colors.white : colors.moss} />
      </View>
      <Text style={styles.processText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appFrame: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    flex: 1,
    maxWidth: 390,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    gap: spacing.xl,
    maxWidth: 390,
    paddingBottom: 168,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
  },
  menuDismissLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.mossSoft,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  savedBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 54,
  },
  savedBadgeValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  savedBadgeLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  emptyWrap: {
    gap: spacing.lg,
  },
  uploadStage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 252,
    paddingTop: spacing.lg,
  },
  stagePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.md,
    ...shadows.soft,
  },
  stagePanelCutout: {
    backgroundColor: '#FBF8F2',
  },
  stageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stageLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  stageImage: {
    alignItems: 'center',
    aspectRatio: 0.84,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageCutoutImage: {
    backgroundColor: colors.mossSoft,
  },
  stageArrow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  emptyCopy: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  processingWrap: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: 54,
  },
  processingHalo: {
    alignItems: 'center',
    height: 154,
    justifyContent: 'center',
    width: 154,
  },
  spinnerRing: {
    borderColor: colors.mossSoft,
    borderRadius: 72,
    borderRightColor: colors.moss,
    borderTopColor: colors.accent,
    borderWidth: 5,
    height: 144,
    position: 'absolute',
    width: 144,
  },
  processingIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  stepCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  processStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  processIcon: {
    alignItems: 'center',
    backgroundColor: colors.mossSoft,
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  processIconDone: {
    backgroundColor: colors.moss,
  },
  processText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  resultWrap: {
    gap: spacing.lg,
  },
  resultTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultTitle: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 0,
  },
  confidenceBadge: {
    alignItems: 'center',
    backgroundColor: colors.mossSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confidenceText: {
    color: colors.moss,
    fontSize: 14,
    fontWeight: '900',
  },
  assetGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
  },
  assetPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.md,
  },
  assetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assetTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  assetPreview: {
    alignItems: 'center',
    aspectRatio: 0.78,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cutoutPreview: {
    backgroundColor: colors.mossSoft,
  },
  originalImage: {
    height: '100%',
    width: '100%',
  },
  cutoutImage: {
    borderRadius: 8,
    height: '86%',
    width: '86%',
  },
  assetName: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  unavailableCutout: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  unavailableText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  nativeCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  nativeCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  nativeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  nativeText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 58,
  },
  uploadButton: {
    alignItems: 'center',
    backgroundColor: colors.moss,
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
    justifyContent: 'center',
  },
  uploadButtonDone: {
    backgroundColor: colors.inkSoft,
  },
  uploadButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  navLayer: {
    bottom: 0,
    elevation: 30,
    height: 330,
    justifyContent: 'flex-end',
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  fanLayer: {
    alignItems: 'center',
    bottom: 42,
    elevation: 31,
    height: 220,
    justifyContent: 'flex-end',
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    zIndex: 31,
  },
  fanItemWrap: {
    bottom: 34,
    elevation: 32,
    position: 'absolute',
    zIndex: 32,
  },
  fanItem: {
    alignItems: 'center',
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  fanIconButton: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
    ...shadows.soft,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 34,
    height: 96,
    justifyContent: 'center',
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  navSideItem: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 74,
  },
  navSideText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: 37,
    borderWidth: 5,
    height: 74,
    justifyContent: 'center',
    marginTop: -42,
    width: 74,
    ...shadows.soft,
  },
  fabOpen: {
    backgroundColor: colors.inkSoft,
  },
  demoPhoto: {
    alignItems: 'center',
    backgroundColor: '#F7E5CA',
    height: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  demoPhotoCompact: {
    height: '100%',
    width: '100%',
  },
  demoPlate: {
    backgroundColor: '#FFF9EF',
    borderColor: '#D7BE9B',
    borderRadius: 74,
    borderWidth: 8,
    height: 148,
    width: 148,
  },
  demoPlateCompact: {
    borderRadius: 56,
    height: 112,
    width: 112,
  },
  demoDot: {
    borderRadius: 18,
    height: 36,
    position: 'absolute',
    width: 36,
    zIndex: 1,
  },
  demoDotOne: {
    backgroundColor: colors.moss,
    left: '34%',
    top: '37%',
  },
  demoDotTwo: {
    backgroundColor: colors.gold,
    left: '48%',
    top: '34%',
  },
  demoDotThree: {
    backgroundColor: colors.accent,
    left: '57%',
    top: '45%',
  },
  demoDotFour: {
    backgroundColor: '#8F624F',
    left: '40%',
    top: '52%',
  },
  demoCutout: {
    height: 126,
    position: 'relative',
    width: 126,
  },
  demoCutoutDot: {
    borderColor: colors.surface,
    borderRadius: 23,
    borderWidth: 2,
    height: 46,
    position: 'absolute',
    width: 46,
  },
  demoCutoutDotOne: {
    backgroundColor: colors.moss,
    left: 24,
    top: 30,
  },
  demoCutoutDotTwo: {
    backgroundColor: colors.gold,
    left: 56,
    top: 18,
  },
  demoCutoutDotThree: {
    backgroundColor: colors.accent,
    left: 70,
    top: 58,
  },
  demoCutoutDotFour: {
    backgroundColor: '#8F624F',
    left: 40,
    top: 74,
  },
});
