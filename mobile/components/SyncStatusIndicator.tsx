import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { colors } from '../lib/theme';

export function SyncStatusIndicator() {
  const { pendingCount, isSyncing, syncNow } = useOfflineSync();
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isSyncing, spinValue]);

  if (pendingCount === 0 && !isSyncing) {
    return null; // Don't show if nothing to sync
  }

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={syncNow}
      disabled={isSyncing}
      activeOpacity={0.7}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <MaterialCommunityIcons
          name={isSyncing ? 'sync' : 'cloud-upload'}
          size={16}
          color={colors.buttonPrimary}
        />
      </Animated.View>
      <Text style={styles.text}>
        {isSyncing 
          ? 'Syncing...' 
          : `${pendingCount} pending`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  text: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});

