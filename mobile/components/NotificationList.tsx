import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, typography, spacing } from '../lib/theme';
import { useNotifications } from '../hooks/useNotifications';
import NotificationItem from './NotificationItem';

export default function NotificationList() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleNotificationPress = (notification: any) => {
    if (notification.data?.reportId) {
      router.push(`/report/${notification.data.reportId}` as any);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  if (notifications.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons
          name="bell-off"
          size={64}
          color={colors.textTertiary}
        />
        <Text style={styles.emptyText}>No notifications</Text>
        <Text style={styles.emptySubtext}>
          You'll see notifications here when there are updates to your reports
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => handleNotificationPress(item)}
            onMarkAsRead={markAsRead}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    fontFamily: typography.fontFamily,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  markAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
});

