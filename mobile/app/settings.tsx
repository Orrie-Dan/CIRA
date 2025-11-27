import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const settingsSections = [
    {
      title: 'Preferences',
      items: [
        {
          id: 'notifications',
          label: 'Push Notifications',
          icon: 'bell',
          type: 'switch',
          value: notificationsEnabled,
          onToggle: setNotificationsEnabled,
        },
        {
          id: 'location',
          label: 'Location Services',
          icon: 'map-marker',
          type: 'switch',
          value: locationEnabled,
          onToggle: setLocationEnabled,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          id: 'profile',
          label: 'My Profile',
          icon: 'account',
          type: 'navigation',
          onPress: () => router.push('/profile'),
        },
        {
          id: 'privacy',
          label: 'Privacy Policy',
          icon: 'shield-lock',
          type: 'navigation',
          onPress: () => Alert.alert('Privacy Policy', 'Privacy policy content coming soon!'),
        },
        {
          id: 'terms',
          label: 'Terms of Service',
          icon: 'file-document',
          type: 'navigation',
          onPress: () => Alert.alert('Terms of Service', 'Terms of service content coming soon!'),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'about',
          label: 'About CIRA',
          icon: 'information',
          type: 'navigation',
          onPress: () => router.push('/about'),
        },
        {
          id: 'help',
          label: 'Help & Support',
          icon: 'help-circle',
          type: 'navigation',
          onPress: () => router.push('/help'),
        },
        {
          id: 'version',
          label: 'App Version',
          icon: 'information-outline',
          type: 'info',
          value: '1.0.0',
        },
      ],
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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.settingItem}
                  onPress={item.onPress}
                  disabled={item.type === 'info' || item.type === 'switch'}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={24}
                    color={colors.textSecondary}
                    style={styles.settingIcon}
                  />
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  {item.type === 'switch' && (
                    <Switch
                      value={item.value}
                      onValueChange={item.onToggle}
                      trackColor={{ false: colors.divider, true: colors.buttonPrimary + '80' }}
                      thumbColor={item.value ? colors.buttonPrimary : colors.textTertiary}
                    />
                  )}
                  {item.type === 'info' && (
                    <Text style={styles.settingValue}>{item.value}</Text>
                  )}
                  {(item.type === 'navigation' || !item.type) && (
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={colors.textTertiary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="logout" size={24} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
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
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    fontFamily: typography.fontFamily,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  settingIcon: {
    marginRight: spacing.md,
    width: 24,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  settingValue: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: spacing.sm,
    fontFamily: typography.fontFamily,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    ...shadows.sm,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginLeft: spacing.sm,
    fontFamily: typography.fontFamily,
  },
});

