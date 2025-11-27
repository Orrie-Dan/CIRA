import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from 'react-native-paper';
import { colors, typography, spacing, borderRadius } from '../lib/theme';
import type { ReportType, ReportStatus } from '../types';

interface ReportFiltersProps {
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  // Filter values
  statusFilter: ReportStatus | '';
  typeFilter: ReportType | '';
  severityFilter: 'low' | 'medium' | 'high' | '';
  dateRangeFilter: { startDate?: Date; endDate?: Date } | null;
  searchQuery: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  // Setters
  setStatusFilter: (value: ReportStatus | '') => void;
  setTypeFilter: (value: ReportType | '') => void;
  setSeverityFilter: (value: 'low' | 'medium' | 'high' | '') => void;
  setDateRangeFilter: (value: { startDate?: Date; endDate?: Date } | null) => void;
  setSearchQuery: (value: string) => void;
  setSortBy: (value: string) => void;
  setSortOrder: (value: 'asc' | 'desc') => void;
}

const REPORT_TYPES: { label: string; value: ReportType }[] = [
  { label: 'Roads', value: 'roads' },
  { label: 'Bridges', value: 'bridges' },
  { label: 'Water', value: 'water' },
  { label: 'Power', value: 'power' },
  { label: 'Sanitation', value: 'sanitation' },
  { label: 'Telecom', value: 'telecom' },
  { label: 'Public Building', value: 'public_building' },
  { label: 'Pothole', value: 'pothole' },
  { label: 'Streetlight', value: 'streetlight' },
  { label: 'Sidewalk', value: 'sidewalk' },
  { label: 'Drainage', value: 'drainage' },
  { label: 'Other', value: 'other' },
];

const STATUS_OPTIONS: { label: string; value: ReportStatus }[] = [
  { label: 'All', value: '' as ReportStatus },
  { label: 'New', value: 'new' },
  { label: 'Triaged', value: 'triaged' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Rejected', value: 'rejected' },
];

const SEVERITY_OPTIONS: { label: string; value: 'low' | 'medium' | 'high' | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
];

const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Priority', value: 'priority' },
  { label: 'Status', value: 'status' },
  { label: 'Date', value: 'date' },
  { label: 'Most Urgent', value: 'most_urgent' },
  { label: 'Least Urgent', value: 'least_urgent' },
];

export function ReportFilters({
  visible,
  onClose,
  onApply,
  onReset,
  statusFilter,
  typeFilter,
  severityFilter,
  dateRangeFilter,
  searchQuery,
  sortBy,
  sortOrder,
  setStatusFilter,
  setTypeFilter,
  setSeverityFilter,
  setDateRangeFilter,
  setSearchQuery,
  setSortBy,
  setSortOrder,
}: ReportFiltersProps) {
  const [localDateRange, setLocalDateRange] = useState(dateRangeFilter);

  const handleApply = () => {
    setDateRangeFilter(localDateRange);
    onApply();
    onClose();
  };

  const handleReset = () => {
    setStatusFilter('');
    setTypeFilter('');
    setSeverityFilter('');
    setDateRangeFilter(null);
    setLocalDateRange(null);
    setSearchQuery('');
    setSortBy('most_urgent');
    setSortOrder('desc');
    onReset();
  };

  const setDatePreset = (preset: 'week' | 'month' | 'year') => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (preset) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }
    
    setLocalDateRange({ startDate, endDate });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filters & Sort</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Search */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by title or description..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Status Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.optionsRow}>
                {STATUS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionChip,
                      statusFilter === option.value && styles.optionChipSelected,
                    ]}
                    onPress={() => setStatusFilter(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        statusFilter === option.value && styles.optionChipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Type Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Type</Text>
              <View style={styles.chipContainer}>
                {REPORT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeChip,
                      typeFilter === type.value && styles.typeChipSelected,
                    ]}
                    onPress={() => setTypeFilter(typeFilter === type.value ? '' : type.value)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        typeFilter === type.value && styles.typeChipTextSelected,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Severity Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Severity</Text>
              <View style={styles.optionsRow}>
                {SEVERITY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionChip,
                      severityFilter === option.value && styles.optionChipSelected,
                    ]}
                    onPress={() => setSeverityFilter(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        severityFilter === option.value && styles.optionChipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date Range */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date Range</Text>
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.datePresetButton}
                  onPress={() => setDatePreset('week')}
                >
                  <Text style={styles.datePresetText}>Last Week</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datePresetButton}
                  onPress={() => setDatePreset('month')}
                >
                  <Text style={styles.datePresetText}>Last Month</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.datePresetButton}
                  onPress={() => setDatePreset('year')}
                >
                  <Text style={styles.datePresetText}>Last Year</Text>
                </TouchableOpacity>
              </View>
              {localDateRange && (
                <View style={styles.dateRangeInfo}>
                  <Text style={styles.dateRangeText}>
                    {localDateRange.startDate?.toLocaleDateString()} - {localDateRange.endDate?.toLocaleDateString()}
                  </Text>
                  <TouchableOpacity onPress={() => setLocalDateRange(null)}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Sort */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sort By</Text>
              <View style={styles.sortContainer}>
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.sortOption,
                      sortBy === option.value && styles.sortOptionSelected,
                    ]}
                    onPress={() => setSortBy(option.value)}
                  >
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === option.value && styles.sortOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {sortBy === 'date' || sortBy === 'priority' || sortBy === 'status' ? (
                <View style={styles.sortOrderContainer}>
                  <TouchableOpacity
                    style={[
                      styles.sortOrderButton,
                      sortOrder === 'asc' && styles.sortOrderButtonSelected,
                    ]}
                    onPress={() => setSortOrder('asc')}
                  >
                    <Text
                      style={[
                        styles.sortOrderText,
                        sortOrder === 'asc' && styles.sortOrderTextSelected,
                      ]}
                    >
                      Ascending
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sortOrderButton,
                      sortOrder === 'desc' && styles.sortOrderButtonSelected,
                    ]}
                    onPress={() => setSortOrder('desc')}
                  >
                    <Text
                      style={[
                        styles.sortOrderText,
                        sortOrder === 'desc' && styles.sortOrderTextSelected,
                      ]}
                    >
                      Descending
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              mode="outlined"
              onPress={handleReset}
              style={styles.resetButton}
              labelStyle={styles.resetButtonLabel}
            >
              Reset
            </Button>
            <Button
              mode="contained"
              onPress={handleApply}
              style={styles.applyButton}
              labelStyle={styles.applyButtonLabel}
            >
              Apply Filters
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  optionChipSelected: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
  },
  optionChipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  optionChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  typeChipSelected: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
  },
  typeChipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  datePresetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  datePresetText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  dateRangeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  dateRangeText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  sortContainer: {
    gap: spacing.sm,
  },
  sortOption: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  sortOptionSelected: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
  },
  sortOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  sortOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sortOrderContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sortOrderButton: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: 'center',
  },
  sortOrderButtonSelected: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
  },
  sortOrderText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  sortOrderTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  resetButton: {
    flex: 1,
  },
  resetButtonLabel: {
    color: colors.textPrimary,
  },
  applyButton: {
    flex: 1,
    backgroundColor: colors.buttonPrimary,
  },
  applyButtonLabel: {
    color: '#FFFFFF',
  },
});

