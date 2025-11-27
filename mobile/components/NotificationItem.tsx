import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../lib/theme';
import type { Notification } from '../types';

interface NotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onMarkAsRead: (id: string) => void;
}

export default function NotificationItem({
  notification,
  onPress,
  onMarkAsRead,
}: NotificationItemProps) {
  const getIcon = () => {
    switch (notification.type) {
      case 'report_created':
        return 'file-document-plus';
      case 'report_status_changed':
        return 'update';
      case 'report_commented':
        return 'comment-text';
      case 'report_assigned':
        return 'account-check';
      default:
        return 'bell';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={[styles.container, !notification.read && styles.unread]}
      onPress={() => {
        onPress();
        if (!notification.read) {
          onMarkAsRead(notification.id);
        }
      }}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons
          name={getIcon() as any}
          size={24}
          color={notification.read ? colors.textSecondary : colors.primary}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, !notification.read && styles.titleUnread]}>
          {notification.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.date}>{formatDate(notification.createdAt)}</Text>
      </View>
      {!notification.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  unread: {
    backgroundColor: colors.primaryLight + '10',
  },
  iconContainer: {
    marginRight: spacing.md,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
    fontFamily: typography.fontFamily,
  },
  titleUnread: {
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
    fontFamily: typography.fontFamily,
  },
  date: {
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    alignSelf: 'center',
    marginLeft: spacing.sm,
  },
});

