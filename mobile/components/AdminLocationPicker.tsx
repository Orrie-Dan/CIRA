import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import {
  ADMIN_LEVELS,
  adminOptions,
  getAdminUnits,
  getVillages,
  sameAdminLocation,
  sanitizeAdminLocation,
  selectAdminLevel,
  type AdminLevel,
  type AdminLocation,
  type AdminUnitTree,
} from '../lib/adminUnits';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LABELS: Record<AdminLevel, string> = {
  province: 'Province',
  district: 'District',
  sector: 'Sector',
  cell: 'Cell',
  village: 'Village',
};

export interface AdminLocationPickerState {
  value: AdminLocation;
  rows: Array<{
    level: AdminLevel;
    label: string;
    selected?: string;
    placeholder: string;
    disabled: boolean;
    loading: boolean;
  }>;
  treeError: boolean;
  retry: () => void;
  activeLevel: AdminLevel | null;
  open: (level: AdminLevel) => void;
  close: () => void;
  options: string[];
  select: (picked: string) => void;
}

/**
 * State for cascading Province > District > Sector > Cell > Village pickers.
 * Render <AdminLocationRows> in the form and <AdminLocationSheet> as an
 * overlay at the root of the screen (nested RN Modals are unreliable on iOS).
 */
export function useAdminLocationPicker(
  value: AdminLocation,
  onChange: (next: AdminLocation) => void
): AdminLocationPickerState {
  const [tree, setTree] = useState<AdminUnitTree | null>(null);
  const [treeError, setTreeError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [villages, setVillages] = useState<{ key: string; list: string[] } | null>(null);
  const [villageError, setVillageError] = useState(false);
  const [activeLevel, setActiveLevel] = useState<AdminLevel | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTreeError(false);
    getAdminUnits()
      .then((t) => !cancelled && setTree(t))
      .catch(() => !cancelled && setTreeError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const { district, sector, cell, village } = value;
  const villageKey = district && sector && cell ? `${district}/${sector}/${cell}` : null;

  useEffect(() => {
    if (!district || !sector || !cell) return;
    let cancelled = false;
    setVillageError(false);
    getVillages(district, sector, cell)
      .then((list) => !cancelled && setVillages({ key: `${district}/${sector}/${cell}`, list }))
      .catch(() => !cancelled && setVillageError(true));
    return () => {
      cancelled = true;
    };
  }, [district, sector, cell]);

  const villageList = villages && villages.key === villageKey ? villages.list : null;

  // Trim a prefilled (geocoded) location to levels that exist in the hierarchy.
  useEffect(() => {
    if (!tree) return;
    const clean = sanitizeAdminLocation(tree, value);
    if (!sameAdminLocation(clean, value)) onChange(clean);
  }, [tree, value, onChange]);

  // Drop a prefilled village that isn't in the selected cell.
  useEffect(() => {
    if (village && villageList && !villageList.includes(village)) {
      onChange({ ...value, village: undefined });
    }
  }, [village, villageList, value, onChange]);

  const levelOptions: Record<AdminLevel, string[]> = {
    ...adminOptions(tree, value),
    village: villageList ?? [],
  };

  const rows = ADMIN_LEVELS.map((level, index) => {
    const parent = index > 0 ? ADMIN_LEVELS[index - 1] : null;
    const parentMissing = parent ? !value[parent] : false;
    const loading = !tree || (level === 'village' && !!villageKey && !villageList && !villageError);
    const placeholder = loading
      ? 'Loading...'
      : parentMissing
        ? `Select ${LABELS[parent!].toLowerCase()} first`
        : level === 'village' && villageError
          ? "Couldn't load villages"
          : `Select ${LABELS[level].toLowerCase()}`;
    return {
      level,
      label: LABELS[level],
      selected: value[level],
      placeholder,
      disabled: loading || parentMissing || levelOptions[level].length === 0,
      loading,
    };
  });

  const close = useCallback(() => setActiveLevel(null), []);
  const select = (picked: string) => {
    if (activeLevel) onChange(selectAdminLevel(value, activeLevel, picked));
    setActiveLevel(null);
  };

  return {
    value,
    rows,
    treeError,
    retry: () => setAttempt((n) => n + 1),
    activeLevel,
    open: setActiveLevel,
    close,
    options: activeLevel ? levelOptions[activeLevel] : [],
    select,
  };
}

export function AdminLocationRows({ picker }: { picker: AdminLocationPickerState }) {
  if (picker.treeError) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>Couldn't load the list of locations.</Text>
        <TouchableOpacity onPress={picker.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.rows}>
      {picker.rows.map((row) => (
        <View key={row.level}>
          <Text style={styles.label}>{row.label}</Text>
          <TouchableOpacity
            style={[styles.button, row.disabled && styles.buttonDisabled]}
            onPress={() => picker.open(row.level)}
            disabled={row.disabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.selected ?? row.placeholder}`}
            accessibilityState={{ disabled: row.disabled }}
          >
            {row.selected ? (
              <Text style={styles.selectedText}>{row.selected}</Text>
            ) : (
              <Text style={styles.placeholder}>{row.placeholder}</Text>
            )}
            {row.loading ? (
              <ActivityIndicator size="small" color={colors.buttonPrimary} />
            ) : (
              <MaterialCommunityIcons name="chevron-down" size={22} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export function AdminLocationSheet({ picker }: { picker: AdminLocationPickerState }) {
  const level = picker.activeLevel;
  if (!level) return null;
  const selected = picker.value[level];
  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={picker.close} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select {LABELS[level]}</Text>
          <TouchableOpacity onPress={picker.close} style={styles.closeButton} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {picker.options.map((name) => {
            const isSelected = name === selected;
            return (
              <TouchableOpacity
                key={name}
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => picker.select(name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>{name}</Text>
                {isSelected && <MaterialCommunityIcons name="check" size={20} color={colors.buttonPrimary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    marginBottom: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  selectedText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  placeholder: {
    flex: 1,
    fontSize: 16,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontFamily: typography.fontFamily,
  },
  retryText: {
    color: colors.buttonPrimary,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.6,
    zIndex: 1001,
    ...shadows.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  itemSelected: {
    backgroundColor: colors.surface,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  itemTextSelected: {
    color: colors.buttonPrimary,
    fontWeight: '600',
  },
});
