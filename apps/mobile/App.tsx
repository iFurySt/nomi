import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { answerFromRecords } from './src/domain/aiBoundary';
import { CaptureDraft, createRecordFromCapture, summarizeRecords } from './src/domain/capture';
import { suggestedQuestions, timelineRecords, trendPoints } from './src/domain/mockData';
import { NomiRecord, RecordType, recordTypeLabel, recordTypeTone } from './src/domain/records';
import { colors, radii, shadows, spacing } from './src/ui/theme';

type TabKey = 'capture' | 'calendar' | 'insights';
type IconName = keyof typeof Ionicons.glyphMap;

type TabItem = {
  key: TabKey;
  label: string;
  icon: IconName;
};

type Option = {
  label: string;
  value: string;
  icon: IconName;
};

const tabs: TabItem[] = [
  { key: 'capture', label: 'Snap', icon: 'camera-outline' },
  { key: 'calendar', label: 'Log', icon: 'calendar-clear-outline' },
  { key: 'insights', label: 'Review', icon: 'stats-chart-outline' },
];

const recordTypeOptions: Option[] = [
  { label: 'Food', value: 'Food', icon: 'fast-food-outline' },
  { label: 'Drink', value: 'Drink', icon: 'cafe-outline' },
  { label: 'Workout', value: 'Workout', icon: 'walk-outline' },
  { label: 'Daily', value: 'Daily', icon: 'camera-outline' },
  { label: 'Other', value: 'Other', icon: 'add-outline' },
];

const foodSubtypes: Option[] = [
  { label: 'Breakfast', value: 'Breakfast', icon: 'sunny-outline' },
  { label: 'Lunch', value: 'Lunch', icon: 'restaurant-outline' },
  { label: 'Dinner', value: 'Dinner', icon: 'moon-outline' },
  { label: 'Snack', value: 'Snack', icon: 'ice-cream-outline' },
  { label: 'Dessert', value: 'Dessert', icon: 'nutrition-outline' },
];

const mealTimeOptions = ['Morning', 'Noon', 'Afternoon', 'Evening'];
const portionOptions = ['Light', 'Normal', 'Large'];
const confidenceOptions = ['AI sure', 'Review', 'Unsure'];
const timelineFilters: Array<RecordType | 'all'> = ['all', 'food', 'body_stats', 'document', 'note'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('capture');
  const [activeFilter, setActiveFilter] = useState<RecordType | 'all'>('all');
  const [records, setRecords] = useState<NomiRecord[]>(timelineRecords);

  const filteredRecords = useMemo(() => {
    if (activeFilter === 'all') {
      return records;
    }

    return records.filter((record) => record.type === activeFilter);
  }, [activeFilter, records]);

  const summary = useMemo(() => summarizeRecords(records), [records]);

  const handleSaveCapture = (draft: CaptureDraft) => {
    const record = createRecordFromCapture(draft, records.length);
    setRecords((currentRecords) => [record, ...currentRecords]);
    setActiveFilter('all');
    setActiveTab('calendar');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appFrame}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'capture' && <CaptureScreen onSave={handleSaveCapture} />}
          {activeTab === 'calendar' && (
            <CalendarScreen
              activeFilter={activeFilter}
              records={filteredRecords}
              summary={summary}
              totalRecords={records.length}
              onCapture={() => setActiveTab('capture')}
              onFilterChange={setActiveFilter}
            />
          )}
          {activeTab === 'insights' && <InsightsScreen records={records} />}
        </ScrollView>
        <FloatingTabBar activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

function CaptureScreen({ onSave }: { onSave: (draft: CaptureDraft) => void }) {
  const [hasPhoto, setHasPhoto] = useState(false);
  const [category, setCategory] = useState('Food');
  const [subtype, setSubtype] = useState('Lunch');
  const [mealTime, setMealTime] = useState('Noon');
  const [portion, setPortion] = useState('Normal');
  const [confidence, setConfidence] = useState('Review');
  const [title, setTitle] = useState('');

  const aiTitle = hasPhoto ? 'AI found a food record' : 'Ready for a photo';
  const aiCopy = hasPhoto
    ? 'Detected bottled drink and meal context. Confirm the suggested chips, then save.'
    : 'Take a photo or choose one from your library. Nomi will fill the first pass for you.';

  const saveDraft = () => {
    onSave({
      kind: 'camera',
      category,
      subtype,
      mealTime,
      title: title.trim() || `${subtype} ${category}`,
      note: `${portion} portion. ${confidence.toLowerCase()} AI classification; user can edit later.`,
      calories: portion === 'Large' ? '680 kcal' : portion === 'Light' ? '360 kcal' : '540 kcal',
      protein: category === 'Drink' ? '4 g' : '28 g',
      confidence: confidence === 'AI sure' ? 0.84 : confidence === 'Unsure' ? 0.48 : 0.66,
    });
    setHasPhoto(true);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.captureTopBar}>
        <PillButton label="Cancel" icon="close-outline" muted onPress={() => setHasPhoto(false)} />
        <View style={styles.captureTitleBlock}>
          <Text style={styles.kicker}>Nomi</Text>
          <Text style={styles.largeTitle}>Snap</Text>
        </View>
        <PillButton label="Save" icon="checkmark-outline" onPress={saveDraft} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setHasPhoto(true)}
        style={[styles.photoStage, hasPhoto && styles.photoStageFilled]}
      >
        {hasPhoto ? (
          <View style={styles.photoPreview}>
            <View style={styles.photoObjectTall} />
            <View style={styles.photoObjectSmall} />
            <View style={styles.photoLabel}>
              <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
              <Text style={styles.photoLabelText}>Cutout on</Text>
            </View>
          </View>
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="camera-outline" size={44} color={colors.accent} />
            <Text style={styles.photoEmptyTitle}>Add photo</Text>
            <Text style={styles.photoEmptyCopy}>Capture the moment</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.actionSheet}>
        <ActionRow
          icon="camera-outline"
          title="Take Photo"
          detail="Use camera to capture"
          onPress={() => setHasPhoto(true)}
        />
        <ActionRow
          icon="image-outline"
          title="Choose from Library"
          detail="Select from photo library"
          onPress={() => setHasPhoto(true)}
        />
        <View style={styles.actionToggleRow}>
          <View style={styles.actionIcon}>
            <Ionicons name="crop-outline" size={22} color={colors.accent} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Auto Cutout</Text>
            <Text style={styles.actionDetail}>Clean background for review</Text>
          </View>
          <View style={styles.toggleTrack}>
            <View style={styles.toggleKnob} />
          </View>
        </View>
      </View>

      <View style={styles.aiPanel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelEyebrow}>AI review</Text>
            <Text style={styles.panelTitle}>{aiTitle}</Text>
          </View>
          <View style={styles.estimatePill}>
            <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
            <Text style={styles.estimatePillText}>Editable</Text>
          </View>
        </View>
        <Text style={styles.panelCopy}>{aiCopy}</Text>

        <OptionSection title="Record type">
          <HorizontalOptions options={recordTypeOptions} selected={category} onSelect={setCategory} />
        </OptionSection>

        <OptionSection title="Subtype">
          <HorizontalOptions options={foodSubtypes} selected={subtype} onSelect={setSubtype} />
        </OptionSection>

        <OptionSection title="Details">
          <ChipGroup options={mealTimeOptions} selected={mealTime} onSelect={setMealTime} />
          <ChipGroup options={portionOptions} selected={portion} onSelect={setPortion} />
          <ChipGroup options={confidenceOptions} selected={confidence} onSelect={setConfidence} />
        </OptionSection>

        <View style={styles.optionalField}>
          <Text style={styles.fieldLabel}>Name (optional)</Text>
          <TextInput
            accessibilityLabel="Optional record name"
            onChangeText={setTitle}
            placeholder={`${subtype} ${category}`}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={title}
          />
        </View>
      </View>
    </View>
  );
}

function CalendarScreen({
  activeFilter,
  records,
  summary,
  totalRecords,
  onCapture,
  onFilterChange,
}: {
  activeFilter: RecordType | 'all';
  records: NomiRecord[];
  summary: ReturnType<typeof summarizeRecords>;
  totalRecords: number;
  onCapture: () => void;
  onFilterChange: (filter: RecordType | 'all') => void;
}) {
  const dailyAverage = Math.max(0.1, totalRecords / 12).toFixed(1);

  return (
    <View style={styles.screen}>
      <View style={styles.monthHeader}>
        <View>
          <Text style={styles.kicker}>May 2026</Text>
          <Text style={styles.hugeTitle}>May</Text>
        </View>
        <View style={styles.monthControls}>
          <IconBubble icon="chevron-back-outline" muted />
          <View style={styles.monthChip}>
            <Text style={styles.monthChipText}>May 2026</Text>
          </View>
          <IconBubble icon="chevron-forward-outline" muted />
        </View>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.weekRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <Text key={`${day}-${index}`} style={styles.weekLabel}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <View key={day} style={[styles.dayCell, day === 6 && styles.dayCellActive]}>
              {day === 6 ? <MiniPhoto /> : <Text style={styles.dayText}>{day}</Text>}
            </View>
          ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={onCapture} style={styles.addRecordButton}>
        <Ionicons name="add-outline" size={28} color={colors.white} />
        <Text style={styles.addRecordText}>Add Record</Text>
      </Pressable>

      <View style={styles.summaryCard}>
        <SectionTitle title="Today's Summary" />
        <View style={styles.summaryGrid}>
          <SummaryTile icon="fast-food-outline" label="Food" value={String(records.filter((record) => record.type === 'food').length)} active />
          <SummaryTile icon="cafe-outline" label="Drink" value="0" />
          <SummaryTile icon="walk-outline" label="Workout" value="0" />
          <SummaryTile icon="camera-outline" label="Daily" value={String(records.filter((record) => record.source === 'photo').length)} />
        </View>
      </View>

      <View style={styles.statsStrip}>
        <StatBlock label="Total Records" value={String(totalRecords)} />
        <StatBlock label="Daily Avg" value={dailyAverage} alignRight />
      </View>

      <View style={styles.timelinePanel}>
        <SectionTitle title="Recent records" />
        <FilterBar activeFilter={activeFilter} onFilterChange={onFilterChange} />
        <View style={styles.recordList}>
          {records.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </View>
      </View>

      <View style={styles.microMetricRow}>
        <MicroMetric label="Calories" value={String(summary.calories)} unit="kcal" />
        <MicroMetric label="Protein" value={String(summary.protein)} unit="g" />
        <MicroMetric label="Weight" value={summary.latestWeight.replace(' kg', '')} unit="kg" />
      </View>
    </View>
  );
}

function InsightsScreen({ records }: { records: NomiRecord[] }) {
  const [range, setRange] = useState('Week');
  const [question, setQuestion] = useState(suggestedQuestions[0]);
  const answer = useMemo(() => answerFromRecords(question, records), [question, records]);

  return (
    <View style={styles.screen}>
      <View style={styles.monthHeader}>
        <View>
          <Text style={styles.kicker}>Review</Text>
          <Text style={styles.hugeTitle}>Statistics</Text>
        </View>
        <View style={styles.iconCluster}>
          <IconBubble icon="videocam-outline" />
          <IconBubble icon="share-outline" />
        </View>
      </View>

      <View style={styles.segmentedLarge}>
        {['Day', 'Week', 'Month', 'Year'].map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => setRange(item)}
            style={[styles.segmentLarge, range === item && styles.segmentLargeActive]}
          >
            <Text style={[styles.segmentLargeText, range === item && styles.segmentLargeTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.heroPreviewCard}>
        <View style={styles.heroPreviewImage}>
          <MiniPhoto large />
        </View>
        <View style={styles.heroPreviewStats}>
          <StatBlock label="Total Records" value={String(records.length)} />
          <StatBlock label="Daily Avg" value={(records.length / 12).toFixed(1)} alignRight />
        </View>
      </View>

      <View style={styles.chartCard}>
        <SectionTitle title="Daily Records" />
        <View style={styles.dailyBars}>
          {[0, 0, 0, records.length, 1, 0, 0].map((value, index) => (
            <View key={index} style={styles.dailyBarSlot}>
              <Text style={styles.dailyBarValue}>{value > 0 ? value : ''}</Text>
              <View style={[styles.dailyBar, value > 0 && { height: 96 + value * 8, backgroundColor: colors.blush }]} />
              <Text style={styles.dailyBarLabel}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][index]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.chartCard}>
        <SectionTitle title="By Type" />
        <View style={styles.donutRow}>
          <View style={styles.donutOuter}>
            <View style={styles.donutInner}>
              <Text style={styles.donutValue}>{records.length}</Text>
              <Text style={styles.donutLabel}>TOTAL</Text>
            </View>
          </View>
          <View style={styles.typeLegend}>
            <LegendDot color={colors.gold} label="Food" value={`${Math.round((records.filter((record) => record.type === 'food').length / records.length) * 100)}%`} />
            <LegendDot color={colors.moss} label="Body" value={`${Math.round((records.filter((record) => record.type === 'body_stats').length / records.length) * 100)}%`} />
          </View>
        </View>
      </View>

      <View style={styles.askCard}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelEyebrow}>Ask Nomi</Text>
            <Text style={styles.panelTitle}>Answers cite your saved records</Text>
          </View>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.moss} />
        </View>
        <View style={styles.suggestionList}>
          {suggestedQuestions.map((item) => (
            <Pressable key={item} accessibilityRole="button" onPress={() => setQuestion(item)} style={styles.suggestion}>
              <Ionicons name="sparkles-outline" size={17} color={colors.accent} />
              <Text style={styles.suggestionText}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.answerBubble}>
          <Text style={styles.answerText}>{answer.content}</Text>
          <Text style={styles.answerMeta}>
            Range: {answer.range}. Sources: {answer.referencedRecordIds.join(', ')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function OptionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.optionSection}>
      <Text style={styles.optionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function HorizontalOptions({
  options,
  selected,
  onSelect,
}: {
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalScroller}
      contentContainerStyle={styles.horizontalOptions}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onSelect(option.value)}
          style={[styles.optionTile, selected === option.value && styles.optionTileActive]}
        >
          <Ionicons name={option.icon} size={26} color={selected === option.value ? colors.accent : colors.black} />
          <Text style={[styles.optionLabel, selected === option.value && styles.optionLabelActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ChipGroup({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          onPress={() => onSelect(option)}
          style={[styles.choiceChip, selected === option && styles.choiceChipActive]}
        >
          <Text style={[styles.choiceChipText, selected === option && styles.choiceChipTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionRow}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={24} color={colors.accent} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={22} color={colors.blush} />
    </Pressable>
  );
}

function PillButton({
  label,
  icon,
  muted,
  onPress,
}: {
  label: string;
  icon: IconName;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.pillButton, muted && styles.pillButtonMuted]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.pillButtonText}>{label}</Text>
    </Pressable>
  );
}

function IconBubble({ icon, muted }: { icon: IconName; muted?: boolean }) {
  return (
    <View style={[styles.iconBubble, muted && styles.iconBubbleMuted]}>
      <Ionicons name={icon} size={22} color={muted ? colors.textMuted : colors.accent} />
    </View>
  );
}

function MiniPhoto({ large }: { large?: boolean }) {
  return (
    <View style={[styles.miniPhoto, large && styles.miniPhotoLarge]}>
      <View style={[styles.miniBottle, large && styles.miniBottleLarge]} />
      <View style={[styles.miniBottleBack, large && styles.miniBottleBackLarge]} />
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function SummaryTile({ icon, label, value, active }: { icon: IconName; label: string; value: string; active?: boolean }) {
  return (
    <View style={[styles.summaryTile, active && styles.summaryTileActive]}>
      <Ionicons name={icon} size={25} color={active ? colors.accent : colors.textMuted} />
      <Text style={[styles.summaryValue, active && styles.summaryValueActive]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StatBlock({ label, value, alignRight }: { label: string; value: string; alignRight?: boolean }) {
  return (
    <View style={[styles.statBlock, alignRight && styles.statBlockRight]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function FilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: RecordType | 'all';
  onFilterChange: (filter: RecordType | 'all') => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalScroller}
      contentContainerStyle={styles.filterBar}
    >
      {timelineFilters.map((filter) => (
        <Pressable
          key={filter}
          accessibilityRole="button"
          onPress={() => onFilterChange(filter)}
          style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
            {filter === 'all' ? 'All' : recordTypeLabel[filter]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function RecordRow({ record }: { record: NomiRecord }) {
  return (
    <View style={styles.recordRow}>
      <View style={[styles.recordTypeMark, { backgroundColor: recordTypeTone[record.type] }]}>
        <Ionicons name={record.type === 'food' ? 'fast-food-outline' : record.type === 'body_stats' ? 'scale-outline' : record.type === 'document' ? 'image-outline' : 'reader-outline'} size={18} color={colors.white} />
      </View>
      <View style={styles.recordBody}>
        <View style={styles.recordHeader}>
          <Text style={styles.recordTitle}>{record.title}</Text>
          <Text style={styles.recordTime}>{record.occurredAt}</Text>
        </View>
        <Text style={styles.recordSummary}>{record.summary}</Text>
        <View style={styles.recordChipRow}>
          {Object.entries(record.values)
            .slice(0, 4)
            .map(([label, value]) => (
              <ValueChip key={`${record.id}-${label}`} label={label} value={value} />
            ))}
          {record.confidence ? <ValueChip label="AI" value={`${Math.round(record.confidence * 100)}%`} /> : null}
        </View>
      </View>
    </View>
  );
}

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueChip}>
      <Text style={styles.valueChipLabel}>{label}</Text>
      <Text style={styles.valueChipValue}>{value}</Text>
    </View>
  );
}

function MicroMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.microMetric}>
      <Text style={styles.microMetricValue}>{value}</Text>
      <Text style={styles.microMetricUnit}>{unit}</Text>
      <Text style={styles.microMetricLabel}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function FloatingTabBar({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;

        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            onPress={() => onChange(tab.key)}
            style={[styles.tabButton, active && styles.tabButtonActive]}
          >
            <Ionicons name={tab.icon} size={28} color={active ? colors.accent : colors.black} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appFrame: {
    alignSelf: 'center',
    backgroundColor: colors.background,
    flex: 1,
    maxWidth: 390,
    overflow: 'hidden',
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 128,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  screen: {
    gap: spacing.xl,
    minWidth: 0,
    width: '100%',
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  largeTitle: {
    color: colors.black,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
  },
  hugeTitle: {
    color: colors.black,
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 64,
  },
  captureTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  captureTitleBlock: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    minWidth: 92,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    ...shadows.soft,
  },
  pillButtonMuted: {
    shadowOpacity: 0.04,
  },
  pillButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  photoStage: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accentSoft,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 236,
    overflow: 'hidden',
  },
  photoStageFilled: {
    borderStyle: 'solid',
    borderWidth: 0,
    minHeight: 278,
    ...shadows.soft,
  },
  photoEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoEmptyTitle: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  photoEmptyCopy: {
    color: colors.blush,
    fontSize: 16,
    fontWeight: '600',
  },
  photoPreview: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
  },
  photoObjectTall: {
    backgroundColor: colors.moss,
    borderColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 5,
    height: 148,
    left: 156,
    opacity: 0.78,
    position: 'absolute',
    top: 62,
    transform: [{ rotate: '8deg' }],
    width: 66,
  },
  photoObjectSmall: {
    backgroundColor: colors.gold,
    borderColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 5,
    height: 128,
    left: 116,
    opacity: 0.9,
    position: 'absolute',
    top: 88,
    transform: [{ rotate: '-7deg' }],
    width: 74,
  },
  photoLabel: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
  },
  photoLabelText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  actionSheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...shadows.soft,
  },
  actionRow: {
    alignItems: 'center',
    borderBottomColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    paddingHorizontal: spacing.lg,
  },
  actionToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    paddingHorizontal: spacing.lg,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: colors.black,
    fontSize: 21,
    fontWeight: '800',
  },
  actionDetail: {
    color: colors.blush,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  toggleTrack: {
    alignItems: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 68,
  },
  toggleKnob: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    height: 28,
    width: 30,
  },
  aiPanel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.lg,
    minWidth: 0,
    padding: spacing.lg,
    ...shadows.soft,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  panelEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: colors.black,
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2,
  },
  panelCopy: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  estimatePill: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    flexShrink: 0,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  estimatePillText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  optionSection: {
    gap: spacing.md,
    minWidth: 0,
  },
  horizontalScroller: {
    maxWidth: '100%',
    width: '100%',
  },
  optionTitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '800',
  },
  horizontalOptions: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  optionTile: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 92,
    width: 92,
  },
  optionTileActive: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.accent,
    borderWidth: 2,
  },
  optionLabel: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '800',
  },
  optionLabelActive: {
    color: colors.accent,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  choiceChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  choiceChipText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '800',
  },
  choiceChipTextActive: {
    color: colors.white,
  },
  optionalField: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.black,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  monthHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  monthControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  monthChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  monthChipText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '800',
  },
  iconCluster: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconBubbleMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dayCell: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    justifyContent: 'center',
    width: '12.36%',
  },
  dayCellActive: {
    backgroundColor: colors.accentSoft,
  },
  dayText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '800',
  },
  miniPhoto: {
    height: 42,
    position: 'relative',
    width: 42,
  },
  miniPhotoLarge: {
    height: 96,
    width: 110,
  },
  miniBottle: {
    backgroundColor: colors.gold,
    borderColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: 3,
    height: 36,
    left: 8,
    position: 'absolute',
    top: 6,
    transform: [{ rotate: '-8deg' }],
    width: 20,
  },
  miniBottleLarge: {
    borderRadius: radii.md,
    borderWidth: 6,
    height: 90,
    left: 28,
    width: 46,
  },
  miniBottleBack: {
    backgroundColor: colors.moss,
    borderColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: 3,
    height: 34,
    left: 20,
    opacity: 0.8,
    position: 'absolute',
    top: 2,
    transform: [{ rotate: '8deg' }],
    width: 18,
  },
  miniBottleBackLarge: {
    borderRadius: radii.md,
    borderWidth: 6,
    height: 84,
    left: 58,
    width: 40,
  },
  addRecordButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 64,
    ...shadows.soft,
  },
  addRecordText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  sectionTitle: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryTile: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flex: 1,
    gap: spacing.xs,
    minHeight: 104,
    justifyContent: 'center',
  },
  summaryTileActive: {
    backgroundColor: colors.surfaceWarm,
  },
  summaryValue: {
    color: colors.textMuted,
    fontSize: 25,
    fontWeight: '800',
  },
  summaryValueActive: {
    color: colors.accent,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  statsStrip: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    ...shadows.soft,
  },
  statBlock: {
    gap: spacing.md,
  },
  statBlockRight: {
    alignItems: 'flex-end',
  },
  statLabel: {
    color: colors.black,
    fontSize: 20,
    fontWeight: '600',
  },
  statValue: {
    color: colors.accent,
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 54,
  },
  timelinePanel: {
    gap: spacing.lg,
  },
  filterBar: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
  },
  filterChipText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  recordList: {
    gap: spacing.md,
  },
  recordRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...shadows.soft,
  },
  recordTypeMark: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  recordBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  recordHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  recordTitle: {
    color: colors.black,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  recordTime: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  recordSummary: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  recordChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  valueChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  valueChipLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  valueChipValue: {
    color: colors.black,
    fontSize: 12,
    fontWeight: '800',
  },
  microMetricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  microMetric: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flex: 1,
    minHeight: 92,
    padding: spacing.md,
  },
  microMetricValue: {
    color: colors.black,
    fontSize: 22,
    fontWeight: '800',
  },
  microMetricUnit: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  microMetricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  segmentedLarge: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentLarge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
  },
  segmentLargeActive: {
    backgroundColor: colors.accent,
  },
  segmentLargeText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '800',
  },
  segmentLargeTextActive: {
    color: colors.white,
  },
  heroPreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...shadows.soft,
  },
  heroPreviewImage: {
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    height: 210,
    justifyContent: 'flex-end',
    padding: spacing.xl,
  },
  heroPreviewStats: {
    borderTopColor: colors.surfaceMuted,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  dailyBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: 164,
  },
  dailyBarSlot: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  dailyBarValue: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    height: 20,
  },
  dailyBar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: 7,
    width: '100%',
  },
  dailyBarLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  donutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  donutOuter: {
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: 120,
    height: 190,
    justifyContent: 'center',
    width: 190,
  },
  donutInner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 80,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  donutValue: {
    color: colors.black,
    fontSize: 32,
    fontWeight: '900',
  },
  donutLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  typeLegend: {
    flex: 1,
    gap: spacing.md,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: colors.black,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  legendValue: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  askCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadows.soft,
  },
  suggestionList: {
    gap: spacing.sm,
  },
  suggestion: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    color: colors.black,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  answerBubble: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  answerText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  answerMeta: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17,
  },
  tabBar: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    bottom: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    padding: spacing.sm,
    position: 'absolute',
    width: 300,
    ...shadows.soft,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.surfaceMuted,
  },
});
