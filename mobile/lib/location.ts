import * as Location from 'expo-location';
import { apiClient } from './api';

export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  province?: string;
  district?: string;
  sector?: string;
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<LocationData> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission denied');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const { latitude, longitude } = location.coords;

  // Try to reverse geocode
  try {
    const geocodeData = await apiClient.reverseGeocode(latitude, longitude);
    return {
      latitude,
      longitude,
      address: geocodeData.addressText,
      province: geocodeData.province,
      district: geocodeData.district,
      sector: geocodeData.sector,
    };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return {
      latitude,
      longitude,
    };
  }
}

export async function watchPosition(
  callback: (location: LocationData) => void
): Promise<Location.LocationSubscription> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission denied');
  }

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 1000,
      distanceInterval: 10,
    },
    async (location) => {
      const { latitude, longitude } = location.coords;
      try {
        const geocodeData = await apiClient.reverseGeocode(latitude, longitude);
        callback({
          latitude,
          longitude,
          address: geocodeData.addressText,
          province: geocodeData.province,
          district: geocodeData.district,
          sector: geocodeData.sector,
        });
      } catch (error) {
        console.error('Reverse geocoding failed:', error);
        callback({
          latitude,
          longitude,
        });
      }
    }
  );
}



