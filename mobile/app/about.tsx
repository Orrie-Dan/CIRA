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

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleWebsitePress = () => {
    Linking.openURL('https://www.gov.rw');
  };

  const handleEmailPress = () => {
    Linking.openURL('mailto:info@cira.gov.rw');
  };

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
        <Text style={styles.headerTitle}>About CIRA</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Logo/Icon Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="map-marker-multiple" size={64} color={colors.buttonPrimary} />
          </View>
          <Text style={styles.appName}>CIRA</Text>
          <Text style={styles.appTagline}>Citizens Infrastructure Reporting Application</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>
            CIRA (Citizens Infrastructure Reporting Application) is a platform that enables citizens
            of Rwanda to report infrastructure issues in their communities. By working together,
            we can help maintain and improve the infrastructure that serves us all.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} color={colors.buttonPrimary} />
              <Text style={styles.featureText}>Report infrastructure issues easily</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} color={colors.buttonPrimary} />
              <Text style={styles.featureText}>Track your reports and their status</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} color={colors.buttonPrimary} />
              <Text style={styles.featureText}>View reports on an interactive map</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialCommunityIcons name="check-circle" size={20} color={colors.buttonPrimary} />
              <Text style={styles.featureText}>Upload photos with your reports</Text>
            </View>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <TouchableOpacity
            style={styles.contactCard}
            onPress={handleEmailPress}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="email" size={24} color={colors.buttonPrimary} />
            <View style={styles.contactContent}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>info@cira.gov.rw</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactCard}
            onPress={handleWebsitePress}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="web" size={24} color={colors.buttonPrimary} />
            <View style={styles.contactContent}>
              <Text style={styles.contactLabel}>Website</Text>
              <Text style={styles.contactValue}>www.gov.rw</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <View style={styles.versionSection}>
          <Text style={styles.versionText}>Version 1.0.0</Text>
          <Text style={styles.copyrightText}>© 2024 Government of Rwanda</Text>
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
  logoSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  appTagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: typography.fontFamily,
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
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    fontFamily: typography.fontFamily,
  },
  featureList: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  featureText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
    fontFamily: typography.fontFamily,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  contactContent: {
    marginLeft: spacing.md,
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  versionSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  versionText: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  copyrightText: {
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
});

