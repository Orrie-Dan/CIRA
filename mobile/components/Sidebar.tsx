import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../hooks/useNotifications';
import NotificationBadge from './NotificationBadge';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(width * 0.85, 320);

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  onPress?: () => void;
  separator?: boolean;
}

export default function Sidebar({ visible, onClose }: SidebarProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const slideAnim = React.useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleMenuItemPress = (item: MenuItem) => {
    if (item.onPress) {
      item.onPress();
    } else if (item.route) {
      router.push(item.route as any);
      onClose();
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
    onClose();
  };

  const handleNavigateToTab = (tabName: string, params?: Record<string, string>) => {
    onClose();
    
    // Use a small delay to ensure sidebar closes first
    setTimeout(() => {
      if (params) {
        // Build query string for params
        const queryString = Object.entries(params)
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('&');
        // Use push with params - this will update the route even if already on the tab
        router.push({
          pathname: `/(tabs)/${tabName}`,
          params: params
        } as any);
      } else {
        // For navigation without params, use push
        router.push(`/(tabs)/${tabName}` as any);
      }
    }, 150);
  };

  const menuItems: MenuItem[] = [
    { 
      id: 'home', 
      label: 'Map View', 
      icon: 'map', 
      onPress: () => handleNavigateToTab('index')
    },
    { 
      id: 'report', 
      label: 'Report an Issue', 
      icon: 'plus-circle', 
      onPress: () => handleNavigateToTab('index', { startReport: 'true' })
    },
    { 
      id: 'reports', 
      label: 'Reports', 
      icon: 'clipboard-list', 
      onPress: () => handleNavigateToTab('reports')
    },
    { 
      id: 'notifications', 
      label: 'Notifications', 
      icon: 'bell', 
      route: '/notifications'
    },
    { 
      id: 'profile', 
      label: 'My Profile', 
      icon: 'account', 
      route: '/profile'
    },
    { 
      id: 'help', 
      label: 'Help & Support', 
      icon: 'help-circle', 
      route: '/help'
    },
    { 
      id: 'separator1', 
      label: '', 
      icon: '', 
      separator: true 
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      icon: 'cog', 
      route: '/settings'
    },
    { 
      id: 'about', 
      label: 'About CIRA', 
      icon: 'information', 
      route: '/about'
    },
    { 
      id: 'logout', 
      label: 'Logout', 
      icon: 'logout', 
      onPress: handleLogout 
    },
  ];

  const mainMenuItems = menuItems.filter((item) => !item.separator && item.id !== 'settings' && item.id !== 'about' && item.id !== 'logout');
  const bottomMenuItems = menuItems.filter((item) => item.id === 'settings' || item.id === 'about' || item.id === 'logout');

  if (!visible) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.sidebar,
          {
            transform: [{ translateX: slideAnim }],
            paddingTop: insets.top,
          },
        ]}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              {user?.fullName ? (
                <Text style={styles.avatarText}>
                  {user.fullName.charAt(0).toUpperCase()}
                </Text>
              ) : (
                <MaterialCommunityIcons name="account" size={40} color={colors.headerBackground} />
              )}
            </View>
            <Text style={styles.userName}>
              {user?.fullName || user?.email?.split('@')[0] || 'Citizen'}
            </Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
            {user?.role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Main Menu Items */}
          <View style={styles.menuSection}>
            {mainMenuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => handleMenuItemPress(item)}
                activeOpacity={0.7}
              >
                {item.icon && (
                  <View style={styles.iconWrapper}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={24}
                    color={colors.textSecondary}
                    style={styles.menuIcon}
                  />
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <View style={styles.badgeWrapper}>
                        <NotificationBadge count={unreadCount} size={18} />
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.menuText}>{item.label}</Text>
                {item.route && (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textTertiary}
                    style={styles.chevronIcon}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            {bottomMenuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.bottomMenuItem}
                onPress={() => handleMenuItemPress(item)}
                activeOpacity={0.7}
              >
                {item.icon && (
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={20}
                    color={item.id === 'logout' ? colors.error : colors.textSecondary}
                    style={styles.bottomMenuIcon}
                  />
                )}
                <Text
                  style={[
                    styles.bottomMenuText,
                    item.id === 'logout' && styles.logoutText,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.background,
    zIndex: 1000,
    ...shadows.lg,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    backgroundColor: colors.headerBackground,
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
    fontFamily: typography.fontFamily,
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: typography.fontFamily,
  },
  menuSection: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  iconWrapper: {
    position: 'relative',
    marginRight: 16,
  },
  menuIcon: {
    width: 24,
  },
  badgeWrapper: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    flex: 1,
  },
  chevronIcon: {
    marginLeft: 'auto',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.headerBackground,
    fontFamily: typography.fontFamily,
  },
  roleBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: typography.fontFamily,
  },
  bottomSection: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: 'auto',
  },
  bottomMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  bottomMenuIcon: {
    marginRight: 16,
    width: 20,
  },
  bottomMenuText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  logoutText: {
    color: colors.error,
  },
});

