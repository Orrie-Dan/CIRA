import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAvatarPhoto, takeAvatarPhoto, uploadAvatar } from '../lib/avatar';
import { apiClient } from '../lib/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);

  const handleChangePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library', 'Remove Photo'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            await handleTakePhoto();
          } else if (buttonIndex === 2) {
            await handlePickPhoto();
          } else if (buttonIndex === 3) {
            await handleRemovePhoto();
          }
        }
      );
    } else {
      Alert.alert(
        'Change Photo',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: handleTakePhoto },
          { text: 'Choose from Library', onPress: handlePickPhoto },
          { text: 'Remove Photo', style: 'destructive', onPress: handleRemovePhoto },
        ]
      );
    }
  };

  const handleTakePhoto = async () => {
    try {
      const uri = await takeAvatarPhoto();
      if (uri) {
        await handleUpload(uri);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to take photo');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const uri = await pickAvatarPhoto();
      if (uri) {
        await handleUpload(uri);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick photo');
    }
  };

  const handleUpload = async (uri: string) => {
    try {
      setUploading(true);
      const result = await uploadAvatar(uri);
      console.log('Upload result:', result);
      if (result.success && result.avatarUrl) {
        console.log('Avatar URL from upload:', result.avatarUrl);
        await refreshUser();
        // Force a small delay to ensure state updates
        setTimeout(() => {
          console.log('User after refresh:', user);
        }, 100);
        Alert.alert('Success', 'Profile photo updated successfully');
      } else {
        Alert.alert('Error', result.error || 'Failed to upload photo');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement remove avatar endpoint on backend
            Alert.alert('Info', 'Remove photo feature coming soon');
          },
        },
      ]
    );
  };

  const getInitials = (name: string | null): string => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Use the same API base as the API client
  const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://cira-backend-1.onrender.com';
  const getAvatarUrl = (avatarUrl?: string | null): string | null => {
    if (!avatarUrl) {
      if (__DEV__) console.log('[Profile] No avatarUrl provided, user:', user?.email);
      return null;
    }
    if (avatarUrl.startsWith('http')) {
      if (__DEV__) console.log('[Profile] Avatar URL is already full URL:', avatarUrl);
      return avatarUrl;
    }
    const fullUrl = `${API_BASE}${avatarUrl}`;
    if (__DEV__) console.log('[Profile] Constructed avatar URL:', fullUrl, 'from:', avatarUrl);
    return fullUrl;
  };
  
  // Log user state changes
  React.useEffect(() => {
    if (__DEV__) {
      console.log('[Profile] User state updated:', {
        email: user?.email,
        avatarUrl: user?.avatarUrl,
        fullName: user?.fullName,
      });
    }
  }, [user]);

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
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleChangePhoto}
            disabled={uploading}
          >
            {uploading ? (
              <View style={styles.avatar}>
                <ActivityIndicator size="large" color={colors.buttonPrimary} />
              </View>
            ) : getAvatarUrl(user?.avatarUrl) ? (
              <Image
                source={{ uri: getAvatarUrl(user.avatarUrl)! }}
                style={styles.avatarImage}
                onError={(e) => {
                  console.error('Image load error:', e.nativeEvent.error);
                }}
                onLoad={() => {
                  console.log('Image loaded successfully:', getAvatarUrl(user.avatarUrl));
                }}
              />
            ) : user?.fullName ? (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user.fullName)}
                </Text>
              </View>
            ) : (
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="account" size={48} color={colors.headerBackground} />
              </View>
            )}
            <View style={styles.changePhotoButton}>
              <MaterialCommunityIcons name="camera" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>
            {user?.fullName || 'Not set'}
          </Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          {user?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Account Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Full Name</Text>
            <Text style={styles.infoValue}>{user?.fullName || 'Not set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || 'Not set'}</Text>
          </View>

          {user?.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user.phone}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{user?.role || 'Citizen'}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert('Edit Profile', 'Profile editing feature coming soon!')}
          >
            <MaterialCommunityIcons name="pencil" size={20} color={colors.buttonPrimary} />
            <Text style={styles.actionButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/settings')}
          >
            <MaterialCommunityIcons name="cog" size={20} color={colors.textSecondary} />
            <Text style={styles.actionButtonText}>Settings</Text>
          </TouchableOpacity>
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
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  changePhotoButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.buttonPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '600',
    color: colors.headerBackground,
    fontFamily: typography.fontFamily,
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily,
  },
  roleBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.headerBackground + '20',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.headerBackground,
    fontFamily: typography.fontFamily,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    fontFamily: typography.fontFamily,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginLeft: spacing.md,
    fontFamily: typography.fontFamily,
  },
});

