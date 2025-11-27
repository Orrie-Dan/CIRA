import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Image,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  TextInput as RNTextInput,
} from 'react-native';
import {
  TextInput,
  Button,
  Text,
  Chip,
  ActivityIndicator,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../lib/api';
import { takePhoto, pickFromGallery, pickMultiplePhotos } from '../lib/camera';
import { getCurrentLocation } from '../lib/location';
import { useAuth } from '../hooks/useAuth';
import { colors, typography, spacing, borderRadius, shadows } from '../lib/theme';
import { addToSyncQueue, getSyncQueue, removeFromSyncQueue } from '../lib/storage';
import { isOnline } from '../lib/network';
import { syncPendingReports } from '../lib/sync';
import type { ReportType } from '../types';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const REPORT_TYPES: { 
  label: string; 
  value: ReportType;
  icon: string;
  color: string;
}[] = [
  { label: 'Roads', value: 'roads', icon: 'road', color: '#FF6B6B' },
  { label: 'Bridges', value: 'bridges', icon: 'bridge', color: '#4ECDC4' },
  { label: 'Water', value: 'water', icon: 'water', color: '#45B7D1' },
  { label: 'Power', value: 'power', icon: 'lightning-bolt', color: '#FFA07A' },
  { label: 'Sanitation', value: 'sanitation', icon: 'toilet', color: '#98D8C8' },
  { label: 'Telecom', value: 'telecom', icon: 'cellphone', color: '#F7DC6F' },
  { label: 'Public Building', value: 'public_building', icon: 'office-building', color: '#BB8FCE' },
  { label: 'Pothole', value: 'pothole', icon: 'alert-circle', color: '#FF6B6B' },
  { label: 'Streetlight', value: 'streetlight', icon: 'lightbulb', color: '#FFD93D' },
  { label: 'Sidewalk', value: 'sidewalk', icon: 'walk', color: '#6BCF7F' },
  { label: 'Drainage', value: 'drainage', icon: 'pipe', color: '#4A90E2' },
  { label: 'Other', value: 'other', icon: 'dots-horizontal', color: '#95A5A6' },
];

const SEVERITY_OPTIONS: {
  label: string;
  value: 'low' | 'medium' | 'high';
  color: string;
  bgColor: string;
}[] = [
  { label: 'Low', value: 'low', color: '#4CAF50', bgColor: '#E8F5E9' },
  { label: 'Medium', value: 'medium', color: '#FF9800', bgColor: '#FFF3E0' },
  { label: 'High', value: 'high', color: '#F44336', bgColor: '#FFEBEE' },
];

interface ReportFormModalProps {
  visible: boolean;
  onClose: () => void;
  initialLocation: {
    latitude: number;
    longitude: number;
  };
  onSuccess?: () => void;
}

// Floating Label Input Component
function FloatingLabelInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  error,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  error?: string;
  [key: string]: any;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(labelAnim, {
      toValue: isFocused || value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, value]);

  const labelStyle = {
    position: 'absolute' as const,
    left: spacing.md,
    top: labelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 8],
    }),
    fontSize: labelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 12],
    }),
    color: labelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.textSecondary, colors.buttonPrimary],
    }),
    fontWeight: '500' as const,
    zIndex: 1,
  };

  return (
    <View style={styles.inputWrapper}>
      <Animated.Text style={labelStyle}>{label}</Animated.Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        mode="outlined"
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[
          styles.modernInput,
          isFocused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholder={isFocused ? placeholder : ''}
        placeholderTextColor={colors.placeholder}
        error={!!error}
        {...props}
      />
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

export default function ReportFormModal({
  visible,
  onClose,
  initialLocation,
  onSuccess,
}: ReportFormModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ReportType | null>(null);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
    province?: string;
    district?: string;
    sector?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<Array<{ latitude: number; longitude: number; displayName: string; address: any }>>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showAddressResults, setShowAddressResults] = useState(false);
  const addressSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [sectorMenuVisible, setSectorMenuVisible] = useState(false);
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(false);

  useEffect(() => {
    if (visible && initialLocation) {
      loadLocationDetails(initialLocation.latitude, initialLocation.longitude);
    }
  }, [visible, initialLocation]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  }, [visible]);

  // Track form changes
  useEffect(() => {
    if (title || description || type || severity || photos.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [title, description, type, severity, photos]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      // Clear any pending address search
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
        addressSearchTimeoutRef.current = null;
      }
      
      setTimeout(() => {
        setTitle('');
        setDescription('');
        setType(null);
        setSeverity(null);
        setPhotos([]);
        setLocation(null);
        setError('');
        setErrors({});
        setHasUnsavedChanges(false);
        setAddressQuery('');
        setAddressResults([]);
        setShowAddressResults(false);
        setSectorMenuVisible(false);
        setAvailableSectors([]);
      }, 300);
    }
  }, [visible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }
    };
  }, []);

  // Real-time validation
  useEffect(() => {
    const newErrors: Record<string, string> = {};
    
    if (title && title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    
    if (description && description.length < 5) {
      newErrors.description = 'Description must be at least 5 characters';
    }
    
    setErrors(newErrors);
  }, [title, description]);

  // Fetch sectors when district is available
  useEffect(() => {
    async function fetchSectors() {
      if (!location?.district) {
        setAvailableSectors([]);
        return;
      }

      setLoadingSectors(true);
      try {
        const response = await apiClient.getSectorsByDistrict(location.district);
        setAvailableSectors(response.sectors || []);
        
        // If current sector is not in the list, keep it but mark as custom
        // This allows users to keep manually entered sectors
      } catch (err: any) {
        console.error('Failed to fetch sectors:', err);
        setAvailableSectors([]);
      } finally {
        setLoadingSectors(false);
      }
    }

    fetchSectors();
  }, [location?.district]);

  async function loadLocationDetails(lat: number, lng: number) {
    setLoadingLocation(true);
    try {
      const geocodeData = await apiClient.reverseGeocode(lat, lng);
      const addressText = geocodeData.addressText || geocodeData.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocation({
        latitude: lat,
        longitude: lng,
        address: addressText,
        province: geocodeData.province,
        district: geocodeData.district,
        sector: geocodeData.sector,
      });
      // Update address query if it's empty
      if (!addressQuery) {
        setAddressQuery(addressText);
      }
    } catch (err: any) {
      console.error('Geocoding error:', err);
      const fallbackAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLocation({
        latitude: lat,
        longitude: lng,
        address: fallbackAddress,
      });
      if (!addressQuery) {
        setAddressQuery(fallbackAddress);
      }
    } finally {
      setLoadingLocation(false);
    }
  }

  async function searchAddress(query: string) {
    if (!query || query.trim().length < 3) {
      setAddressResults([]);
      setShowAddressResults(false);
      return;
    }

    setSearchingAddress(true);
    try {
      const response = await apiClient.forwardGeocode(query.trim());
      setAddressResults(response.results || []);
      setShowAddressResults(true);
    } catch (err: any) {
      console.error('Address search error:', err);
      setAddressResults([]);
      setShowAddressResults(false);
    } finally {
      setSearchingAddress(false);
    }
  }

  function handleAddressQueryChange(text: string) {
    setAddressQuery(text);
    
    // Clear previous timeout
    if (addressSearchTimeoutRef.current) {
      clearTimeout(addressSearchTimeoutRef.current);
    }

    // Debounce search
    if (text.trim().length >= 3) {
      addressSearchTimeoutRef.current = setTimeout(() => {
        searchAddress(text);
      }, 500);
    } else {
      setAddressResults([]);
      setShowAddressResults(false);
    }
  }

  function handleSelectAddress(result: { latitude: number; longitude: number; displayName: string; address: any }) {
    setAddressQuery(result.displayName);
    setShowAddressResults(false);
    setAddressResults([]);
    
    // Load location details and update map
    loadLocationDetails(result.latitude, result.longitude);
  }

  async function handleUseCurrentLocation() {
    try {
      setLoadingLocation(true);
      const loc = await getCurrentLocation();
      await loadLocationDetails(loc.latitude, loc.longitude);
    } catch (err: any) {
      setError('Failed to get current location');
    } finally {
      setLoadingLocation(false);
    }
  }

  async function handleTakePhoto() {
    try {
      const uri = await takePhoto();
      if (uri && photos.length < 10) {
        setPhotos([...photos, uri]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to take photo');
    }
  }

  async function handlePickPhotos() {
    try {
      const uris = await pickMultiplePhotos(10 - photos.length);
      if (uris.length > 0) {
        setPhotos([...photos, ...uris]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to pick photos');
    }
  }

  function removePhoto(index: number) {
    setPhotos(photos.filter((_, i) => i !== index));
  }

  function handleClose() {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  }

  function calculateProgress() {
    let filled = 0;
    const total = 5;
    if (title) filled++;
    if (description) filled++;
    if (type) filled++;
    if (severity) filled++;
    if (location) filled++;
    return (filled / total) * 100;
  }

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    
    if (!title || title.length < 3) {
      newErrors.title = 'Title is required (min 3 characters)';
    }
    if (!description || description.length < 5) {
      newErrors.description = 'Description is required (min 5 characters)';
    }
    if (!type) {
      newErrors.type = 'Please select a type';
    }
    if (!severity) {
      newErrors.severity = 'Please select a severity';
    }
    if (!location) {
      newErrors.location = 'Location is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check if online
      const online = await isOnline();
      
      if (!online) {
        // Save to sync queue for offline submission
        await addToSyncQueue(
          {
            title,
            description,
            type: type!,
            severity: severity!,
            latitude: location.latitude,
            longitude: location.longitude,
            addressText: location.address,
            province: location.province,
            district: location.district,
            sector: location.sector,
          },
          photos
        );

        Alert.alert(
          'Saved Offline',
          'Your report has been saved and will be submitted automatically when you\'re back online.',
          [
            {
              text: 'OK',
              onPress: () => {
                onClose();
                if (onSuccess) {
                  onSuccess();
                }
              },
            },
          ]
        );
        return;
      }

      // Online - submit normally
      const report = await apiClient.createReport({
        title,
        description,
        type,
        severity,
        latitude: location.latitude,
        longitude: location.longitude,
        addressText: location.address,
        province: location.province,
        district: location.district,
        sector: location.sector,
        ...(user?.id && { reporterId: user.id }),
      });

      // Upload photos
      if (photos.length > 0) {
        await Promise.all(
          photos.map((uri) => apiClient.uploadPhoto(report.id, uri))
        );
      }

      // IMPORTANT: Remove any matching items from sync queue to prevent duplicates
      // This handles the case where user tried to submit offline, then submitted online
      try {
        const queue = await getSyncQueue();
        const matchingItems = queue.filter((item) => {
          // Match by location (within 10 meters) and similar title/description
          const distance = Math.sqrt(
            Math.pow(item.reportData.latitude - location.latitude, 2) +
            Math.pow(item.reportData.longitude - location.longitude, 2)
          ) * 111000; // Convert to meters (rough approximation)
          
          const sameTitle = item.reportData.title === title;
          const sameDescription = item.reportData.description === description;
          const sameType = item.reportData.type === type;
          
          // Remove if same location (within 10m) and same content
          return distance < 10 && sameTitle && sameDescription && sameType;
        });
        
        // Remove matching items from queue
        for (const item of matchingItems) {
          await removeFromSyncQueue(item.id);
        }
        
        if (matchingItems.length > 0) {
          console.log(`Removed ${matchingItems.length} duplicate item(s) from sync queue`);
        }
      } catch (queueError) {
        console.warn('Failed to clean sync queue:', queueError);
        // Don't fail the submission if queue cleanup fails
      }

      // After successful submission, try to sync any remaining pending items
      try {
        await syncPendingReports();
      } catch (syncError) {
        // Don't fail the submission if sync fails
        console.warn('Failed to sync pending reports:', syncError);
      }

      Alert.alert('Success', 'Report submitted successfully!', [
        {
          text: 'OK',
          onPress: () => {
            onClose();
            if (onSuccess) {
              onSuccess();
            }
          },
        },
      ]);
    } catch (err: any) {
      console.error('Submit error:', err);
      
      // Check if it's a network error
      const isNetworkError = 
        err.code === 'ECONNABORTED' || 
        err.code === 'ECONNREFUSED' ||
        err.message?.includes('Network Error') ||
        err.message?.includes('timeout') ||
        !err.response;

      if (isNetworkError) {
        // Network error - save to sync queue
        try {
          await addToSyncQueue(
            {
              title,
              description,
              type: type!,
              severity: severity!,
              latitude: location.latitude,
              longitude: location.longitude,
              addressText: location.address,
              province: location.province,
              district: location.district,
              sector: location.sector,
            },
            photos
          );

          Alert.alert(
            'Saved Offline',
            'Your report has been saved and will be submitted automatically when you\'re back online.',
            [
              {
                text: 'OK',
                onPress: () => {
                  onClose();
                  if (onSuccess) {
                    onSuccess();
                  }
                },
              },
            ]
          );
        } catch (queueError) {
          console.error('Failed to save to sync queue:', queueError);
          setError('Failed to submit report. Please check your connection and try again.');
        }
      } else {
        // Validation or other error - show error message
        setError(err.message || 'Failed to submit report. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const progress = calculateProgress();
  const canSubmit = title && description && type && severity && location && 
                    !errors.title && !errors.description;

  return (
    <>
      {/* Main Form Modal */}
      <Modal
        visible={visible}
        animationType="none"
        transparent={true}
        onRequestClose={handleClose}
        statusBarTranslucent={true}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={handleClose}
          />
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [{ translateY: slideAnim }],
                opacity: (typeMenuVisible || sectorMenuVisible) ? 0.3 : 1,
              },
            ]}
            pointerEvents={(typeMenuVisible || sectorMenuVisible) ? 'none' : 'auto'}
          >
          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: `${progress}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}% Complete</Text>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Report an Issue</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {/* Location Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <MaterialCommunityIcons name="map-marker" size={18} color={colors.buttonPrimary} /> Location
              </Text>
              {errors.location && (
                <Text style={styles.errorText}>{errors.location}</Text>
              )}

              {/* Address Search Input - Always visible at the top */}
              <View style={styles.addressSearchSection}>
                <Text style={styles.addressSearchLabel}>
                  Search by Address
                </Text>
                <View style={styles.addressSearchContainer}>
                  <MaterialCommunityIcons
                    name="magnify"
                    size={20}
                    color={colors.buttonPrimary}
                    style={styles.searchIcon}
                  />
                  <RNTextInput
                    style={styles.addressInput}
                    placeholder="Enter street address, road name, or location..."
                    placeholderTextColor={colors.textTertiary}
                    value={addressQuery}
                    onChangeText={handleAddressQueryChange}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {searchingAddress && (
                    <ActivityIndicator size="small" color={colors.buttonPrimary} style={styles.searchLoader} />
                  )}
                </View>
              </View>

              {/* Address Search Results */}
              {showAddressResults && addressResults.length > 0 && (
                <View style={styles.addressResultsContainer}>
                  {addressResults.map((result, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.addressResultItem}
                      onPress={() => handleSelectAddress(result)}
                    >
                      <MaterialCommunityIcons
                        name="map-marker-outline"
                        size={20}
                        color={colors.buttonPrimary}
                      />
                      <View style={styles.addressResultText}>
                        <Text style={styles.addressResultName} numberOfLines={1}>
                          {result.displayName}
                        </Text>
                        {result.address.road && (
                          <Text style={styles.addressResultDetails} numberOfLines={1}>
                            {[result.address.road, result.address.sector, result.address.district]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {showAddressResults && addressResults.length === 0 && addressQuery.trim().length >= 3 && !searchingAddress && (
                <View style={styles.noResultsContainer}>
                  <Text style={styles.noResultsText}>No locations found</Text>
                </View>
              )}
              
              {loadingLocation ? (
                <View style={styles.locationLoading}>
                  <ActivityIndicator size="small" color={colors.buttonPrimary} />
                  <Text style={styles.loadingText}>Loading location...</Text>
                </View>
              ) : location ? (
                <>

                  {/* Location Display */}
                  <View style={styles.locationBox}>
                    <MaterialCommunityIcons
                      name="map-marker"
                      size={24}
                      color={colors.buttonPrimary}
                    />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationText}>
                        {location.address}
                      </Text>
                      {(location.province || location.district) && (
                        <Text style={styles.locationDetails}>
                          {[location.province, location.district, location.sector]
                            .filter(Boolean)
                            .join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Location Actions */}
                  <View style={styles.locationActions}>
                    <TouchableOpacity
                      style={styles.locationActionButton}
                      onPress={handleUseCurrentLocation}
                    >
                      <MaterialCommunityIcons
                        name="crosshairs-gps"
                        size={18}
                        color={colors.buttonPrimary}
                      />
                      <Text style={styles.locationActionText}>Use Current</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Sector Selection */}
                  {location.district && (
                    <View style={styles.sectorInputSection}>
                      <View style={styles.sectorInputLabel}>
                        <MaterialCommunityIcons name="map-marker-edit" size={16} color={colors.textSecondary} />
                        <Text style={styles.sectorInputLabelText}>
                          Sector (Optional - Select or edit if geocoding is inaccurate)
                        </Text>
                      </View>
                      {loadingSectors ? (
                        <View style={styles.sectorLoadingContainer}>
                          <ActivityIndicator size="small" color={colors.buttonPrimary} />
                          <Text style={styles.sectorLoadingText}>Loading sectors...</Text>
                        </View>
                      ) : availableSectors.length > 0 ? (
                        <TouchableOpacity
                          style={styles.dropdownButton}
                          onPress={() => setSectorMenuVisible(true)}
                          activeOpacity={0.7}
                        >
                          {location.sector ? (
                            <Text style={styles.dropdownSelectedText}>{location.sector}</Text>
                          ) : (
                            <Text style={styles.dropdownPlaceholder}>Select Sector</Text>
                          )}
                          <MaterialCommunityIcons
                            name={sectorMenuVisible ? 'chevron-up' : 'chevron-down'}
                            size={24}
                            color={colors.textSecondary}
                          />
                        </TouchableOpacity>
                      ) : (
                        <FloatingLabelInput
                          label="Sector"
                          value={location.sector || ''}
                          onChangeText={(text) => {
                            setLocation({
                              ...location,
                              sector: text.trim() || undefined,
                            });
                          }}
                          placeholder="Enter sector name manually"
                        />
                      )}
                    </View>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={styles.getLocationButton}
                  onPress={handleUseCurrentLocation}
                >
                  <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.buttonPrimary} />
                  <Text style={styles.getLocationText}>Get Current Location</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Title */}
            <FloatingLabelInput
              label="Title *"
              value={title}
              onChangeText={setTitle}
              placeholder="Brief description of the issue"
              error={errors.title}
            />

            {/* Description */}
            <FloatingLabelInput
              label="Description *"
              value={description}
              onChangeText={setDescription}
              placeholder="Provide detailed information about the issue"
              multiline
              numberOfLines={4}
              error={errors.description}
            />

            {/* Type Selection - Dropdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <MaterialCommunityIcons name="tag" size={18} color={colors.buttonPrimary} /> Type *
              </Text>
              {errors.type && (
                <Text style={styles.errorText}>{errors.type}</Text>
              )}
              <TouchableOpacity
                style={[
                  styles.dropdownButton,
                  errors.type && styles.dropdownButtonError,
                ]}
                onPress={() => setTypeMenuVisible(true)}
                activeOpacity={0.7}
              >
                {type ? (
                  <View style={styles.dropdownSelected}>
                    <MaterialCommunityIcons
                      name={REPORT_TYPES.find(t => t.value === type)?.icon as any || 'tag'}
                      size={20}
                      color={REPORT_TYPES.find(t => t.value === type)?.color || colors.buttonPrimary}
                    />
                    <Text style={styles.dropdownSelectedText}>
                      {REPORT_TYPES.find(t => t.value === type)?.label}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.dropdownPlaceholder}>Select a type</Text>
                )}
                <MaterialCommunityIcons
                  name={typeMenuVisible ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Severity Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <MaterialCommunityIcons name="alert-circle" size={18} color={colors.buttonPrimary} /> Severity *
              </Text>
              {errors.severity && (
                <Text style={styles.errorText}>{errors.severity}</Text>
              )}
              <View style={styles.severityContainer}>
                {SEVERITY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.severityChip,
                      severity === option.value && [
                        styles.severityChipSelected,
                        { backgroundColor: option.bgColor, borderColor: option.color },
                      ],
                    ]}
                    onPress={() => setSeverity(option.value)}
                  >
                    <View style={[styles.severityDot, { backgroundColor: option.color }]} />
                    <Text
                      style={[
                        styles.severityText,
                        severity === option.value && { color: option.color, fontWeight: '600' },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Photos Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <MaterialCommunityIcons name="camera" size={18} color={colors.buttonPrimary} /> Photos ({photos.length}/10)
              </Text>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.photoActionButton}
                  onPress={handleTakePhoto}
                  disabled={photos.length >= 10}
                >
                  <MaterialCommunityIcons
                    name="camera"
                    size={20}
                    color={photos.length >= 10 ? colors.textTertiary : colors.buttonPrimary}
                  />
                  <Text
                    style={[
                      styles.photoActionText,
                      photos.length >= 10 && styles.photoActionTextDisabled,
                    ]}
                  >
                    Take Photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoActionButton}
                  onPress={handlePickPhotos}
                  disabled={photos.length >= 10}
                >
                  <MaterialCommunityIcons
                    name="image"
                    size={20}
                    color={photos.length >= 10 ? colors.textTertiary : colors.buttonPrimary}
                  />
                  <Text
                    style={[
                      styles.photoActionText,
                      photos.length >= 10 && styles.photoActionTextDisabled,
                    ]}
                  >
                    Pick from Gallery
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Photo Thumbnails */}
              {photos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photosContainer}
                  contentContainerStyle={styles.photosContent}
                >
                  {photos.map((uri, index) => (
                    <View key={index} style={styles.photoItem}>
                      <Image source={{ uri }} style={styles.photoThumbnail} />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => removePhoto(index)}
                      >
                        <MaterialCommunityIcons name="close-circle" size={24} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit || loading}
              style={[
                styles.submitButton,
                !canSubmit && styles.submitButtonDisabled,
              ]}
              contentStyle={styles.submitButtonContent}
              labelStyle={styles.submitButtonLabel}
            >
              {loading ? 'Submitting...' : 'Submit Report'}
            </Button>
          </View>
        </Animated.View>

        {/* Type Dropdown - Overlay outside form content */}
        {typeMenuVisible && (
          <View style={styles.dropdownOverlay}>
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => setTypeMenuVisible(false)}
            />
            <View style={styles.dropdownModal}>
              <View style={styles.dropdownHeader}>
                <Text style={styles.dropdownHeaderText}>Select Type</Text>
                <TouchableOpacity
                  onPress={() => setTypeMenuVisible(false)}
                  style={styles.dropdownCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.dropdownList} 
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {REPORT_TYPES.map((reportType) => (
                  <TouchableOpacity
                    key={reportType.value}
                    style={[
                      styles.dropdownItem,
                      type === reportType.value && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      setType(reportType.value);
                      setTypeMenuVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={reportType.icon as any}
                      size={22}
                      color={type === reportType.value ? reportType.color : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.dropdownItemText,
                        type === reportType.value && {
                          color: reportType.color,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {reportType.label}
                    </Text>
                    {type === reportType.value && (
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={reportType.color}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Sector Dropdown - Overlay outside form content */}
        {sectorMenuVisible && (
          <View style={styles.dropdownOverlay}>
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => setSectorMenuVisible(false)}
            />
            <View style={styles.dropdownModal}>
              <View style={styles.dropdownHeader}>
                <Text style={styles.dropdownHeaderText}>
                  Select Sector {location?.district ? `(${location.district})` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => setSectorMenuVisible(false)}
                  style={styles.dropdownCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.dropdownList} 
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {availableSectors.map((sector) => (
                  <TouchableOpacity
                    key={sector}
                    style={[
                      styles.dropdownItem,
                      location?.sector === sector && styles.dropdownItemSelected,
                    ]}
                    onPress={() => {
                      setLocation({ ...location!, sector });
                      setSectorMenuVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="map-marker"
                      size={22}
                      color={location?.sector === sector ? colors.buttonPrimary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.dropdownItemText,
                        location?.sector === sector && {
                          color: colors.buttonPrimary,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {sector}
                    </Text>
                    {location?.sector === sector && (
                      <MaterialCommunityIcons
                        name="check"
                        size={20}
                        color={colors.buttonPrimary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: SCREEN_HEIGHT * 0.9,
    ...shadows.lg,
  },
  progressContainer: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.dividerLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.buttonPrimary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // Location Styles
  addressSearchSection: {
    marginBottom: spacing.md,
  },
  addressSearchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  addressSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.buttonPrimary,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  addressInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    paddingVertical: spacing.sm,
  },
  searchLoader: {
    marginLeft: spacing.xs,
  },
  addressResultsContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    marginBottom: spacing.sm,
    maxHeight: 200,
    ...shadows.sm,
  },
  addressResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
    gap: spacing.sm,
  },
  addressResultText: {
    flex: 1,
  },
  addressResultName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    marginBottom: spacing.xs / 2,
  },
  addressResultDetails: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  noResultsContainer: {
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  noResultsText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
    fontFamily: typography.fontFamily,
  },
  locationDetails: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontFamily,
  },
  locationActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  locationActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  locationActionText: {
    fontSize: 14,
    color: colors.buttonPrimary,
    fontWeight: '500',
    fontFamily: typography.fontFamily,
  },
  getLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.buttonPrimary,
    borderStyle: 'dashed',
  },
  getLocationText: {
    fontSize: 15,
    color: colors.buttonPrimary,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  // Sector Input Styles
  sectorInputSection: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  sectorInputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  sectorInputLabelText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  sectorLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    justifyContent: 'center',
  },
  sectorLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  // Input Styles
  inputWrapper: {
    marginBottom: spacing.md,
  },
  modernInput: {
    backgroundColor: colors.background,
    fontSize: 16,
    fontFamily: typography.fontFamily,
  },
  inputFocused: {
    borderColor: colors.buttonPrimary,
  },
  inputError: {
    borderColor: colors.error,
  },
  // Type Dropdown Styles
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
    minHeight: 56,
  },
  dropdownButtonError: {
    borderColor: colors.error,
  },
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dropdownSelectedText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: colors.placeholder,
    fontFamily: typography.fontFamily,
    flex: 1,
  },
  // Type Dropdown Overlay Styles
  dropdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  dropdownModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.6,
    zIndex: 1001,
    elevation: 1001,
    ...shadows.lg,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  dropdownHeaderText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  dropdownCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownList: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  dropdownItemSelected: {
    backgroundColor: colors.surface,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },
  // Severity Styles
  severityContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  severityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  severityChipSelected: {
    borderWidth: 2,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  // Photo Styles
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  photoActionText: {
    fontSize: 14,
    color: colors.buttonPrimary,
    fontWeight: '500',
    fontFamily: typography.fontFamily,
  },
  photoActionTextDisabled: {
    color: colors.textTertiary,
  },
  photosContainer: {
    marginTop: spacing.sm,
  },
  photosContent: {
    gap: spacing.sm,
  },
  photoItem: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  // Error Styles
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: '#FFEBEE',
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    fontFamily: typography.fontFamily,
    flex: 1,
  },
  // Footer Styles
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.dividerLight,
    backgroundColor: colors.background,
  },
  submitButton: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: borderRadius.md,
  },
  submitButtonDisabled: {
    backgroundColor: colors.divider,
    opacity: 0.6,
  },
  submitButtonContent: {
    paddingVertical: spacing.sm,
  },
  submitButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
});
