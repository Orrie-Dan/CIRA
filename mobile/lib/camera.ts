import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export async function takePhoto(): Promise<string | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) {
    throw new Error('Camera permission denied');
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.8,
    aspect: [4, 3],
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  // Compress and resize image
  const manipulated = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  return manipulated.uri;
}

export async function pickFromGallery(): Promise<string | null> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Media library permission denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    quality: 0.8,
    aspect: [4, 3],
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  // Compress and resize image
  const manipulated = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 1920 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  return manipulated.uri;
}

export async function pickMultiplePhotos(maxCount: number = 10): Promise<string[]> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Media library permission denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    quality: 0.8,
    allowsMultipleSelection: true,
    selectionLimit: maxCount,
  });

  if (result.canceled || !result.assets.length) {
    return [];
  }

  // Compress and resize all images
  const manipulatedImages = await Promise.all(
    result.assets.map((asset) =>
      ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1920 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      )
    )
  );

  return manipulatedImages.map((img) => img.uri);
}



