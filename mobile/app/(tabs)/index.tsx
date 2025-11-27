import { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../lib/api';
import { getCurrentLocation } from '../../lib/location';
import { colors, typography, spacing, borderRadius, shadows } from '../../lib/theme';
import type { Report, ReportType } from '../../types';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sidebar from '../../components/Sidebar';
import ReportFormModal from '../../components/ReportFormModal';
import { SyncStatusIndicator } from '../../components/SyncStatusIndicator';

const { width, height } = Dimensions.get('window');
const SEARCH_BAR_HEIGHT = 56;

const REPORT_TYPE_COLORS: Record<ReportType, string> = {
  roads: '#FF6B6B',
  bridges: '#4ECDC4',
  water: '#45B7D1',
  power: '#FFA07A',
  sanitation: '#98D8C8',
  telecom: '#F7DC6F',
  public_building: '#BB8FCE',
  pothole: '#FF6B6B',
  streetlight: '#FFD93D',
  sidewalk: '#6BCF7F',
  drainage: '#4A90E2',
  other: '#95A5A6',
};

export default function MapScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>({
    latitude: -1.9441, // Kigali default
    longitude: 30.0619,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<Array<{ latitude: number; longitude: number; displayName: string; address: any }>>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [showAddressResults, setShowAddressResults] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ startReport?: string }>();
  
  // Refs to prevent duplicate requests
  const loadingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);
  const addressSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load location on mount only
  useEffect(() => {
    loadInitialLocation();
  }, []);

  // Auto-trigger report mode if startReport parameter is present
  useEffect(() => {
    if (params.startReport === 'true' && !reportMode) {
      setReportMode(true);
    }
  }, [params.startReport, reportMode]);

  // Debounced load reports when region or filter changes
  useEffect(() => {
    // Skip initial load - it will be handled by loadInitialLocation
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(() => {
      loadReports();
    }, 500); // Wait 500ms after user stops moving map

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [region, selectedType]);

  async function loadInitialLocation() {
    try {
      const location = await getCurrentLocation();
      const newRegion = {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setRegion(newRegion);
      // Load reports after setting initial location
      await loadReportsWithRegion(newRegion);
    } catch (error) {
      console.error('Failed to get location:', error);
      // Still load reports with default region
      await loadReportsWithRegion(region);
    }
  }

  async function loadReports() {
    await loadReportsWithRegion(region);
  }

  async function loadReportsWithRegion(currentRegion: Region) {
    // Prevent concurrent requests
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    
    try {
      // Calculate bounding box from region
      const bbox = [
        currentRegion.longitude - currentRegion.longitudeDelta,
        currentRegion.latitude - currentRegion.latitudeDelta,
        currentRegion.longitude + currentRegion.longitudeDelta,
        currentRegion.latitude + currentRegion.latitudeDelta,
      ].join(',');

      const response = await apiClient.getReports(bbox, 200);
      let filteredReports = response.data;

      if (selectedType) {
        filteredReports = filteredReports.filter((r) => r.type === selectedType);
      }

      setReports(filteredReports);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  const handleRegionChangeComplete = useCallback((newRegion: Region) => {
    setRegion(newRegion);
  }, []);

  const handleAddPress = () => {
    if (reportMode) {
      // Cancel report mode
      setReportMode(false);
      setSelectedLocation(null);
      setReportModalVisible(false);
    } else {
      // Enter report mode
      setReportMode(true);
      // Optionally, you can also use current location as default
      // getCurrentLocation().then(loc => {
      //   setSelectedLocation({ latitude: loc.latitude, longitude: loc.longitude });
      //   setReportModalVisible(true);
      //   setReportMode(false);
      // });
    }
  };

  const handleMapPress = (e: any) => {
    // Close address search results when map is pressed
    if (showAddressResults) {
      setShowAddressResults(false);
    }
    
    if (reportMode) {
      const coordinate = e.nativeEvent?.coordinate || e.nativeEvent?.position;
      if (coordinate) {
        const { latitude, longitude } = coordinate;
        console.log('Map pressed, setting location:', { latitude, longitude });
        setSelectedLocation({ latitude, longitude });
        setReportModalVisible(true);
        setReportMode(false);
      } else {
        console.log('Map pressed but no coordinate found:', e.nativeEvent);
      }
    }
  };

  const handleReportSuccess = () => {
    // Reload reports after successful submission
    loadReports();
    // Clear address search
    setAddressQuery('');
    setAddressResults([]);
    setShowAddressResults(false);
  };

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
    
    // Set selected location and update map region
    const newLocation = {
      latitude: result.latitude,
      longitude: result.longitude,
    };
    setSelectedLocation(newLocation);
    
    // Update map region to show the selected location
    setRegion({
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    
    // Open report form modal
    setReportModalVisible(true);
    setReportMode(false);
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (addressSearchTimeoutRef.current) {
        clearTimeout(addressSearchTimeoutRef.current);
      }
    };
  }, []);

  const reportTypes: ReportType[] = [
    'roads',
    'bridges',
    'water',
    'power',
    'sanitation',
    'telecom',
    'public_building',
    'pothole',
    'streetlight',
    'sidewalk',
    'drainage',
    'other',
  ];

  const headerHeight = 60;
  const totalHeaderHeight = headerHeight + insets.top;
  const searchBarTop = totalHeaderHeight + 8;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { height: totalHeaderHeight, paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => setSidebarVisible(true)}
          style={styles.headerIcon}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="menu" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncStatusIndicator />
          <TouchableOpacity
            style={styles.headerIcon}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="bell-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Address Search Bar - Always visible at top */}
      <View style={[styles.searchBarContainer, { top: searchBarTop }]}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="map-marker"
            size={20}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Manually enter location"
            placeholderTextColor={colors.textTertiary}
            value={addressQuery}
            onChangeText={handleAddressQueryChange}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {searchingAddress && (
            <ActivityIndicator size="small" color={colors.buttonPrimary} style={styles.searchLoader} />
          )}
          {addressQuery.length > 0 && !searchingAddress && (
            <TouchableOpacity
              onPress={() => {
                setAddressQuery('');
                setAddressResults([]);
                setShowAddressResults(false);
              }}
              style={styles.clearButton}
            >
              <MaterialCommunityIcons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Address Search Results */}
        {showAddressResults && addressResults.length > 0 && (
          <View style={styles.addressResultsContainer}>
            <ScrollView
              style={styles.addressResultsScroll}
              keyboardShouldPersistTaps="handled"
            >
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
            </ScrollView>
          </View>
        )}

        {showAddressResults && addressResults.length === 0 && addressQuery.trim().length >= 3 && !searchingAddress && (
          <View style={styles.noResultsContainer}>
            <Text style={styles.noResultsText}>No locations found</Text>
          </View>
        )}
      </View>

      {/* Map Container */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={[styles.map, { 
          top: searchBarTop + SEARCH_BAR_HEIGHT + 8,
          bottom: 0,
        }]}
        region={region}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        onLongPress={reportMode ? handleMapPress : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={[]}
      >
        {reports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.latitude,
              longitude: report.longitude,
            }}
            pinColor={REPORT_TYPE_COLORS[report.type] || '#95A5A6'}
            onPress={(e) => {
              if (!reportMode) {
                e.stopPropagation();
                router.push(`/report/${report.id}`);
              } else {
                // In report mode, allow the press to pass through to map
                handleMapPress(e);
              }
            }}
          />
        ))}
        {selectedLocation && (
          <Marker
            coordinate={selectedLocation}
            pinColor={colors.buttonPrimary}
            title="Selected Location"
          />
        )}
      </MapView>

      {/* Report Mode Indicator */}
      {reportMode && (
        <View style={[styles.reportModeIndicator, { top: searchBarTop + SEARCH_BAR_HEIGHT + 16 }]}>
          <MaterialCommunityIcons
            name="map-marker-plus"
            size={24}
            color={colors.buttonPrimary}
          />
          <Text style={styles.reportModeText}>
            Tap on the map to select location
          </Text>
          <TouchableOpacity
            onPress={() => setReportMode(false)}
            style={styles.cancelReportButton}
          >
            <Text style={styles.cancelReportText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.buttonPrimary} />
        </View>
      )}

      {/* Add Button */}
      <TouchableOpacity
        style={[
          styles.addButton,
          reportMode && styles.addButtonActive,
        ]}
        onPress={handleAddPress}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons
          name={reportMode ? 'close' : 'plus'}
          size={24}
          color={reportMode ? '#FFFFFF' : colors.textPrimary}
        />
        <Text
          style={[
            styles.addButtonText,
            reportMode && styles.addButtonTextActive,
          ]}
        >
          {reportMode ? 'Cancel' : 'Add'}
        </Text>
      </TouchableOpacity>

      {/* Report Form Modal */}
      {selectedLocation && (
        <ReportFormModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setSelectedLocation(null);
          }}
          initialLocation={selectedLocation}
          onSuccess={handleReportSuccess}
        />
      )}

      {/* Sidebar */}
      <Sidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.headerBackground,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    minHeight: 60,
  },
  headerIcon: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    width,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 10,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    zIndex: 10,
  },
  addButtonText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
    marginTop: 2,
    fontFamily: typography.fontFamily,
  },
  addButtonActive: {
    backgroundColor: colors.buttonPrimary,
  },
  addButtonTextActive: {
    color: '#FFFFFF',
  },
  reportModeIndicator: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.md,
    zIndex: 10,
  },
  reportModeText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  cancelReportButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cancelReportText: {
    fontSize: 14,
    color: colors.buttonPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '600',
  },
  // Address Search Styles
  searchBarContainer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
    elevation: 10, // For Android
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: SEARCH_BAR_HEIGHT,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    elevation: 8, // For Android shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    paddingVertical: 0,
  },
  searchLoader: {
    marginLeft: spacing.xs,
  },
  clearButton: {
    marginLeft: spacing.xs,
    padding: spacing.xs,
  },
  addressResultsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    maxHeight: 300,
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    elevation: 5, // For Android shadow
    zIndex: 102,
  },
  addressResultsScroll: {
    maxHeight: 300,
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
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  noResultsText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
});
