import { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import type { ReportStatus } from '../types';

interface StatusUpdateModalProps {
  visible: boolean;
  onClose: () => void;
  reportId: string;
  currentStatus: ReportStatus;
  onSuccess: () => void;
}

const STATUS_OPTIONS: { value: ReportStatus; label: string; icon: string }[] = [
  { value: 'assigned', label: 'Assigned', icon: 'account-check' },
  { value: 'in_progress', label: 'In Progress', icon: 'progress-wrench' },
  { value: 'resolved', label: 'Resolved', icon: 'check-circle' },
];

export default function StatusUpdateModal({
  visible,
  onClose,
  reportId,
  currentStatus,
  onSuccess,
}: StatusUpdateModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus>(currentStatus);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    if (selectedStatus === currentStatus) {
      Alert.alert('No Change', 'Please select a different status.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.updateReportStatus(reportId, {
        status: selectedStatus,
        note: note.trim() || undefined,
      });
      onSuccess();
      onClose();
      setNote('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'assigned':
        return '#9C27B0';
      case 'in_progress':
        return '#F44336';
      case 'resolved':
        return '#4CAF50';
      default:
        return colors.textSecondary;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Update Status</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Current Status */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentStatus) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(currentStatus) }]}>
                  {currentStatus.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Status Options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>New Status</Text>
              {STATUS_OPTIONS.map((option) => {
                const isSelected = selectedStatus === option.value;
                const isDisabled = option.value === currentStatus;
                const optionColor = getStatusColor(option.value);

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.statusOption,
                      isSelected && { borderColor: optionColor, borderWidth: 2 },
                      isDisabled && styles.disabledOption,
                    ]}
                    onPress={() => !isDisabled && setSelectedStatus(option.value)}
                    disabled={isDisabled}
                  >
                    <View style={[styles.statusIconContainer, { backgroundColor: optionColor + '20' }]}>
                      <MaterialCommunityIcons
                        name={option.icon as any}
                        size={24}
                        color={isDisabled ? colors.textTertiary : optionColor}
                      />
                    </View>
                    <Text
                      style={[
                        styles.statusOptionText,
                        isSelected && { color: optionColor, fontWeight: '700' },
                        isDisabled && styles.disabledText,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={24}
                        color={optionColor}
                        style={styles.checkIcon}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note Field */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Note (Optional)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Add a note about this status change..."
                placeholderTextColor={colors.textTertiary}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.updateButton,
                selectedStatus === currentStatus && styles.disabledButton,
              ]}
              onPress={handleUpdate}
              disabled={loading || selectedStatus === currentStatus}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.updateButtonText}>Update Status</Text>
              )}
            </TouchableOpacity>
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
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
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
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  checkIcon: {
    marginLeft: spacing.sm,
  },
  disabledOption: {
    opacity: 0.5,
  },
  disabledText: {
    color: colors.textTertiary,
  },
  noteInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    minHeight: 100,
  },
  actions: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dividerLight,
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  updateButton: {
    backgroundColor: colors.buttonPrimary,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.fontFamily,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

