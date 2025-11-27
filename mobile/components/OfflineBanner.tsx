import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkStatus } from '../lib/network';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { colors } from '../lib/theme';

export function OfflineBanner() {
  const { isConnected } = useNetworkStatus();
  const { pendingCount } = useOfflineSync();

  // Only show if offline and there are pending items
  if (isConnected || pendingCount === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="wifi-off" size={20} color={colors.textPrimary} />
      <Text style={styles.text}>
        Offline - {pendingCount} report{pendingCount !== 1 ? 's' : ''} will sync when online
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});

