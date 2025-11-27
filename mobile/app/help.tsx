import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@cira.gov.rw?subject=Support Request');
  };

  const faqItems = [
    {
      question: 'How do I report an infrastructure issue?',
      answer: 'Tap the "Add" button on the map screen, then tap on the map to select the location. Fill in the report form with details and photos, then submit.',
    },
    {
      question: 'What types of issues can I report?',
      answer: 'You can report issues related to roads, bridges, water, power, sanitation, telecom, public buildings, potholes, streetlights, sidewalks, drainage, and other infrastructure problems.',
    },
    {
      question: 'How do I track my reports?',
      answer: 'Go to the "Reports" tab to see all your submitted reports and their current status.',
    },
    {
      question: 'Can I edit or delete my report?',
      answer: 'Once submitted, reports cannot be edited or deleted. However, you can contact support if you need to make changes.',
    },
    {
      question: 'How long does it take for a report to be resolved?',
      answer: 'Resolution time depends on the severity and type of issue. High-priority issues are typically addressed faster.',
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.helpCard}
            onPress={handleContactSupport}
          >
            <MaterialCommunityIcons name="email" size={32} color={colors.buttonPrimary} />
            <Text style={styles.helpCardTitle}>Contact Support</Text>
            <Text style={styles.helpCardText}>Email us for assistance</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqItems.map((item, index) => (
            <View key={index} style={styles.faqItem}>
              <Text style={styles.faqQuestion}>{item.question}</Text>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>

        {/* Additional Resources */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Resources</Text>
          <View style={styles.resourceCard}>
            <MaterialCommunityIcons name="information" size={24} color={colors.textSecondary} />
            <View style={styles.resourceContent}>
              <Text style={styles.resourceTitle}>About CIRA</Text>
              <Text style={styles.resourceText}>
                Citizens Infrastructure Reporting Application helps citizens report infrastructure issues in Rwanda.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  headerSpacer: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    fontFamily: typography.fontFamily,
  },
  helpCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  helpCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  helpCardText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  faqItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    fontFamily: typography.fontFamily,
  },
  resourceCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  resourceContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  resourceText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    fontFamily: typography.fontFamily,
  },
});

