import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography } from '../lib/theme';

interface AvatarProps {
  user?: {
    avatarUrl?: string | null;
    fullName?: string | null;
  } | null;
  size?: number;
  style?: ViewStyle;
}

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://cira-backend-1.onrender.com';

export function Avatar({ user, size = 40, style }: AvatarProps) {
  const getInitials = (name: string | null): string => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const getAvatarUrl = (avatarUrl?: string | null): string | null => {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http')) return avatarUrl;
    return `${API_BASE}${avatarUrl}`;
  };

  const avatarUrl = getAvatarUrl(user?.avatarUrl);
  const initials = getInitials(user?.fullName || null);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : initials ? (
        <View style={[styles.initialsContainer, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.4 },
            ]}
          >
            {initials}
          </Text>
        </View>
      ) : (
        <View style={[styles.defaultContainer, { width: size, height: size, borderRadius: size / 2 }]}>
          <MaterialCommunityIcons
            name="account"
            size={size * 0.6}
            color={colors.textSecondary}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceVariant,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initialsContainer: {
    backgroundColor: colors.buttonPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  defaultContainer: {
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

