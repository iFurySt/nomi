import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { suggestedQuestions, timelineRecords, todayRecords, trendPoints } from './src/domain/mockData';
import { NomiRecord, RecordType, recordTypeLabel, recordTypeTone } from './src/domain/records';
import { colors, radii, spacing } from './src/ui/theme';

type TabKey = 'today' | 'timeline' | 'capture' | 'trends' | 'ask' | 'settings';

type IconName = keyof typeof Ionicons.glyphMap;

type TabItem = {
  key: TabKey;
  label: string;
  icon: IconName;
};

const tabs: TabItem[] = [
  { key: 'today', label: 'Today', icon: 'today-outline' },
  { key: 'timeline', label: 'Timeline', icon: 'list-outline' },
  { key: 'capture', label: 'Add', icon: 'add-circle-outline' },
  { key: 'trends', label: 'Trends', icon: 'analytics-outline' },
  { key: 'ask', label: 'Ask', icon: 'chatbubble-ellipses-outline' },
  { key: 'settings', label: 'Settings', icon: 'person-circle-outline' },
];

const captureActions: Array<{ label: string; detail: string; icon: IconName }> = [
  { label: 'Camera', detail: 'Meal or body data', icon: 'camera-outline' },
  { label: 'Upload', detail: 'Screenshot or photo', icon: 'image-outline' },
  { label: 'Food', detail: 'Manual meal', icon: 'restaurant-outline' },
  { label: 'Body', detail: 'Stats entry', icon: 'body-outline' },
  { label: 'Note', detail: 'Life context', icon: 'create-outline' },
];

const filters: Array<RecordType | 'all'> = ['all', 'food', 'body_stats', 'document', 'note'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [activeFilter, setActiveFilter] = useState<RecordType | 'all'>('all');
  const [activeRange, setActiveRange] = useState('7D');

  const filteredRecords = useMemo(() => {
    if (activeFilter === 'all') {
      return timelineRecords;
    }

    return timelineRecords.filter((record) => record.type === activeFilter);
  }, [activeFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.shell}>
        <AppHeader activeTab={activeTab} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'today' && <TodayScreen onCapture={() => setActiveTab('capture')} onAsk={() => setActiveTab('ask')} />}
          {activeTab === 'timeline' && (
            <TimelineScreen
              activeFilter={activeFilter}
              records={filteredRecords}
              onFilterChange={setActiveFilter}
            />
          )}
          {activeTab === 'capture' && <CaptureScreen />}
          {activeTab === 'trends' && <TrendsScreen activeRange={activeRange} onRangeChange={setActiveRange} />}
          {activeTab === 'ask' && <AskScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </ScrollView>
        <TabBar activeTab={activeTab} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

function AppHeader({ activeTab }: { activeTab: TabKey }) {
  const title = activeTab === 'today' ? 'Nomi' : tabs.find((tab) => tab.key === activeTab)?.label;

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>知己</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.headerMark}>
        <Text style={styles.headerMarkText}>N</Text>
      </View>
    </View>
  );
}

function TodayScreen({ onCapture, onAsk }: { onCapture: () => void; onAsk: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Today</Text>
        <Text style={styles.heroTitle}>A quiet daily body log.</Text>
        <View style={styles.metricRow}>
          <Metric label="Calories" value="1,220" unit="kcal" />
          <Metric label="Protein" value="74" unit="g" />
          <Metric label="Weight" value="70.8" unit="kg" />
        </View>
      </View>

      <View style={styles.commandRow}>
        <PrimaryAction icon="add-outline" label="Capture" onPress={onCapture} />
        <SecondaryAction icon="chatbubble-outline" label="Ask" onPress={onAsk} />
      </View>

      <SectionHeader title="Recent Records" action="View all" />
      <View style={styles.list}>
        {todayRecords.map((record) => (
          <RecordRow key={record.id} record={record} />
        ))}
      </View>
    </View>
  );
}

function TimelineScreen({
  activeFilter,
  records,
  onFilterChange,
}: {
  activeFilter: RecordType | 'all';
  records: NomiRecord[];
  onFilterChange: (filter: RecordType | 'all') => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>All records</Text>
      <Text style={styles.screenCopy}>Grouped later by day. For now this skeleton shows the record language and filter behavior.</Text>
      <View style={styles.segmented}>
        {filters.map((filter) => (
          <Pressable
            key={filter}
            accessibilityRole="button"
            onPress={() => onFilterChange(filter)}
            style={[styles.segment, activeFilter === filter && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeFilter === filter && styles.segmentTextActive]}>
              {filter === 'all' ? 'All' : recordTypeLabel[filter]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.dateGroup}>
        <Text style={styles.dateLabel}>May 6</Text>
        <View style={styles.list}>
          {records.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
        </View>
      </View>
    </View>
  );
}

function CaptureScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Add in seconds</Text>
      <Text style={styles.screenCopy}>Start with the fastest source. AI estimates stay editable before they become part of the log.</Text>
      <View style={styles.captureGrid}>
        {captureActions.map((action) => (
          <Pressable key={action.label} accessibilityRole="button" style={styles.captureTile}>
            <Ionicons name={action.icon} size={24} color={colors.accent} />
            <Text style={styles.captureLabel}>{action.label}</Text>
            <Text style={styles.captureDetail}>{action.detail}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.extractionPanel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>AI extraction preview</Text>
          <Text style={styles.estimatePill}>Estimate</Text>
        </View>
        <Text style={styles.extractionCopy}>Lunch photo: rice bowl, greens, and tofu. Confidence 66%. Review calories and protein before saving.</Text>
        <View style={styles.editRow}>
          <ValueChip label="Calories" value="540 kcal" />
          <ValueChip label="Protein" value="28 g" />
          <ValueChip label="Fiber" value="7 g" />
        </View>
      </View>
    </View>
  );
}

function TrendsScreen({
  activeRange,
  onRangeChange,
}: {
  activeRange: string;
  onRangeChange: (range: string) => void;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Gentle trends</Text>
      <Text style={styles.screenCopy}>A compact reflection surface for calories, protein, weight, and body fat.</Text>
      <View style={styles.segmented}>
        {['7D', '30D', '90D'].map((range) => (
          <Pressable
            key={range}
            accessibilityRole="button"
            onPress={() => onRangeChange(range)}
            style={[styles.segment, activeRange === range && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeRange === range && styles.segmentTextActive]}>{range}</Text>
          </Pressable>
        ))}
      </View>
      <TrendChart label="Calories" value="1,904 kcal avg" metric="calories" />
      <TrendChart label="Protein" value="116 g avg" metric="proteinG" />
      <TrendChart label="Weight" value="70.8 kg latest" metric="weightKg" />
    </View>
  );
}

function AskScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Ask from your log</Text>
      <Text style={styles.screenCopy}>Answers should cite the saved records and stay inside personal review, not diagnosis or treatment.</Text>
      <View style={styles.suggestionList}>
        {suggestedQuestions.map((question) => (
          <Pressable key={question} accessibilityRole="button" style={styles.suggestion}>
            <Ionicons name="sparkles-outline" size={17} color={colors.accent} />
            <Text style={styles.suggestionText}>{question}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.answerBubble}>
        <Text style={styles.answerTitle}>Nomi</Text>
        <Text style={styles.answerText}>
          Based on records from Apr 30 to May 6, protein is usually above 100 g, with today still incomplete. I used 7 food records and 3 body records.
        </Text>
      </View>
      <View style={styles.boundaryBox}>
        <Ionicons name="shield-checkmark-outline" size={19} color={colors.accent} />
        <Text style={styles.boundaryText}>
          For medical decisions, Nomi helps organize records and will suggest talking with a qualified professional.
        </Text>
      </View>
    </View>
  );
}

function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Personal settings</Text>
      <View style={styles.settingsList}>
        <SettingsRow icon="person-outline" label="Profile" value="Nomi User" />
        <SettingsRow icon="scale-outline" label="Units" value="Metric" />
        <SettingsRow icon="download-outline" label="Data export" value="Ready later" />
        <SettingsRow icon="trash-outline" label="Delete data" value="Available in MVP" />
        <SettingsRow icon="lock-closed-outline" label="Privacy" value="Personal records stay sensitive" />
      </View>
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PrimaryAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryAction}>
      <Ionicons name={icon} size={22} color={colors.white} />
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryAction}>
      <Ionicons name={icon} size={21} color={colors.accent} />
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionAction}>{action}</Text>
    </View>
  );
}

function RecordRow({ record }: { record: NomiRecord }) {
  return (
    <View style={styles.recordRow}>
      <View style={[styles.recordDot, { backgroundColor: recordTypeTone[record.type] }]} />
      <View style={styles.recordBody}>
        <View style={styles.recordHeader}>
          <Text style={styles.recordTitle}>{record.title}</Text>
          <Text style={styles.recordTime}>{record.occurredAt}</Text>
        </View>
        <Text style={styles.recordSummary}>{record.summary}</Text>
        <View style={styles.chipRow}>
          {Object.entries(record.values).map(([label, value]) => (
            <ValueChip key={`${record.id}-${label}`} label={label} value={value} />
          ))}
          {record.confidence ? <ValueChip label="Confidence" value={`${Math.round(record.confidence * 100)}%`} /> : null}
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

function TrendChart({
  label,
  value,
  metric,
}: {
  label: string;
  value: string;
  metric: 'calories' | 'proteinG' | 'weightKg';
}) {
  const max = Math.max(...trendPoints.map((point) => Number(point[metric] ?? 0)));

  return (
    <View style={styles.chartPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{label}</Text>
        <Text style={styles.panelValue}>{value}</Text>
      </View>
      <View style={styles.barRow}>
        {trendPoints.map((point) => {
          const rawValue = Number(point[metric] ?? 0);
          const height = Math.max(16, Math.round((rawValue / max) * 88));

          return (
            <View key={`${label}-${point.date}`} style={styles.barSlot}>
              <View style={[styles.bar, { height }]} />
              <Text style={styles.barLabel}>{point.date.slice(-2)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SettingsRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.settingsRow}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={styles.settingsText}>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text style={styles.settingsValue}>{value}</Text>
      </View>
    </View>
  );
}

function TabBar({ activeTab, onChange }: { activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            onPress={() => onChange(tab.key)}
            style={styles.tabButton}
          >
            <Ionicons name={tab.icon} size={22} color={active ? colors.accent : colors.textMuted} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
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
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  brand: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
  },
  headerMark: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerMarkText: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingBottom: 118,
    paddingHorizontal: spacing.lg,
  },
  screen: {
    gap: spacing.lg,
    minWidth: 0,
    width: '100%',
  },
  hero: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.xl,
    minWidth: 0,
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 30,
    flexShrink: 1,
  },
  metricRow: {
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  metric: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    flex: 1,
    flexShrink: 1,
    minHeight: 88,
    minWidth: 0,
    padding: spacing.md,
  },
  metricValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  metricUnit: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  commandRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryActionText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionAction: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: spacing.md,
  },
  recordRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.md,
  },
  recordDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
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
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  recordTime: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  recordSummary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  chipRow: {
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
    fontWeight: '600',
  },
  valueChipValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },
  screenCopy: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.xs,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.text,
  },
  dateGroup: {
    gap: spacing.sm,
  },
  dateLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  captureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  captureTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 112,
    padding: spacing.md,
    width: '47.8%',
  },
  captureLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  captureDetail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  extractionPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  estimatePill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  extractionCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  editRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chartPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  panelValue: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  barRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: 112,
  },
  barSlot: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  bar: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    minHeight: 16,
    width: '100%',
  },
  barLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  suggestionList: {
    gap: spacing.sm,
  },
  suggestion: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  answerBubble: {
    backgroundColor: colors.inkSoft,
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  answerTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  answerText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 23,
  },
  boundaryBox: {
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  boundaryText: {
    color: colors.accent,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  settingsList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  settingsRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  settingsText: {
    flex: 1,
  },
  settingsLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  settingsValue: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    bottom: spacing.lg,
    flexDirection: 'row',
    left: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: 'center',
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.accent,
  },
});
