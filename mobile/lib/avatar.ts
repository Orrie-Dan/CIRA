import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { apiClient } from './api';

export interface AvatarUploadResult {
  success: boolean;
  avatarUrl?: string;
  error?: string;
}

/**
 * Request camera and media library permissions
 */
export async function requestAvatarPermissions(): Promise<boolean> {
  const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
  const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  return cameraStatus === 'granted' || mediaStatus === 'granted';
}

/**
 * Pick an avatar photo from the device
 */
export async function pickAvatarPhoto(): Promise<string | null> {
  try {
    const hasPermission = await requestAvatarPermissions();
    if (!hasPermission) {
      throw new Error('Camera and media library permissions are required');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    
    // Resize and compress the image
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return manipulated.uri;
  } catch (error) {
    console.error('Error picking avatar photo:', error);
    throw error;
  }
}

/**
 * Take an avatar photo with the camera
 */
export async function takeAvatarPhoto(): Promise<string | null> {
  try {
    const hasPermission = await requestAvatarPermissions();
    if (!hasPermission) {
      throw new Error('Camera and media library permissions are required');
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    
    // Resize and compress the image
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return manipulated.uri;
  } catch (error) {
    console.error('Error taking avatar photo:', error);
    throw error;
  }
}

/**
 * Upload avatar photo to the server
 */
export async function uploadAvatar(uri: string): Promise<AvatarUploadResult> {
  try {
    const result = await apiClient.uploadAvatar(uri);
    return {
      success: true,
      avatarUrl: result.user.avatarUrl || undefined,
    };
  } catch (error: any) {
    console.error('Error uploading avatar:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload avatar',
    };
  }
}

