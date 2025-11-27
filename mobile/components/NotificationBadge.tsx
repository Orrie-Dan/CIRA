import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

interface NotificationBadgeProps {
  count: number;
  size?: number;
}

export default function NotificationBadge({ count, size = 18 }: NotificationBadgeProps) {
  if (count === 0) return null;

  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.text, { fontSize: size * 0.6 }]}>
        {count > 99 ? '99+' : count.toString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

