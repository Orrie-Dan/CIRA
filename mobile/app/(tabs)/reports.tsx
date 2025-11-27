import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Pressable,
  Linking,
  Share,
  Platform,
  Image,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../lib/api';

// Get API base URL - use the same one as apiClient
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://cira-backend-1.onrender.com';
import { useAuth } from '../../hooks/useAuth';
import { colors, typography, spacing, borderRadius, shadows } from '../../lib/theme';
import type { Report, AdminReport, ReportType, ReportStatus } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  new: '#0EA5E9',
  triaged: '#F59E0B',
  assigned: '#9C27B0',
  in_progress: '#F59E0B', // Amber
  resolved: '#10B981', // Emerald
  rejected: '#9E9E9E',
};

const STATUS_BG_COLORS: Record<string, string> = {
  new: '#E0F2FE',
  triaged: '#FEF3C7',
  assigned: '#F3E5F5',
  in_progress: '#FEF3C7', // Light amber
  resolved: '#D1FAE5', // Light emerald
  rejected: '#F5F5F5',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
};

const PRIORITY_BG_COLORS: Record<string, string> = {
  low: '#D1FAE5',
  medium: '#FEF3C7',
  high: '#FEE2E2',
};

type ViewMode = 'all' | 'my' | 'assigned';
type SortOption = 'date_desc' | 'date_asc' | 'priority_desc' | 'priority_asc' | 'status' | 'title_asc' | 'title_desc';

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        selected && styles.filterChipSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          selected && styles.filterChipTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getReportAge(createdAt: string): { text: string; color: string; isOverdue: boolean } {
  const now = new Date();
  const created = new Date(createdAt);
  const diffInHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInHours / 24);
  
  if (diffInHours < 24) {
    return { text: `${diffInHours}h ago`, color: '#10B981', isOverdue: false };
  } else if (diffInDays === 1) {
    return { text: '1 day ago', color: '#F59E0B', isOverdue: false };
  } else if (diffInDays < 7) {
    return { text: `${diffInDays} days ago`, color: '#F59E0B', isOverdue: diffInDays > 3 };
  } else {
    return { text: `${diffInDays} days ago`, color: '#EF4444', isOverdue: true };
  }
}

function getRelativeTime(date: string): string {
  const now = new Date();
  const reportDate = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - reportDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w ago`;
  return reportDate.toLocaleDateString();
}

// Unified Report Card Component
function ReportCard({ 
  report, 
  onPress 
}: { 
  report: Report | AdminReport; 
  onPress: () => void;
}) {
  const [expandedAddress, setExpandedAddress] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // Debug: Log photos if available
  if (__DEV__ && report.photos) {
    console.log(`Report ${report.id} has ${report.photos.length} photos:`, report.photos);
  }

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${report.title}\n\n${report.description}\n\nLocation: ${report.addressText || 'N/A'}`,
        title: report.title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleNavigate = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${report.latitude},${report.longitude}`,
      android: `geo:0,0?q=${report.latitude},${report.longitude}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`
        );
      });
    }
  };

  const statusColor = STATUS_COLORS[report.status] || colors.textSecondary;
  const statusBgColor = STATUS_BG_COLORS[report.status] || colors.surface;
  const priorityColor = PRIORITY_COLORS[report.severity] || colors.textSecondary;
  const priorityBgColor = PRIORITY_BG_COLORS[report.severity] || colors.surface;
  const age = getReportAge(report.createdAt);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { borderLeftColor: statusColor + '80' }]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {report.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {report.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.description} numberOfLines={2}>
          {report.description}
        </Text>

        {/* Tags Row */}
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <MaterialCommunityIcons name="tag" size={14} color={colors.textSecondary} />
            <Text style={styles.tagText}>
              {report.type.replace('_', ' ').charAt(0).toUpperCase() + report.type.replace('_', ' ').slice(1)}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: priorityBgColor }]}>
            <MaterialCommunityIcons
              name="alert-circle"
              size={14}
              color={priorityColor}
            />
            <Text style={[styles.tagText, { color: priorityColor }]}>
              {report.severity.charAt(0).toUpperCase() + report.severity.slice(1)}
            </Text>
          </View>
        </View>

        {/* Photos Thumbnails */}
        {report.photos && report.photos.length > 0 && (
          <View style={styles.photosContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photosScrollContent}
            >
              {report.photos.slice(0, 3).map((photo) => {
                // Construct photo URL - handle both absolute and relative URLs
                let photoUrl = '';
                if (photo.url) {
                  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
                    // Already absolute URL
                    photoUrl = photo.url;
                  } else if (photo.url.startsWith('/')) {
                    // Relative URL starting with /
                    photoUrl = `${API_BASE}${photo.url}`;
                  } else {
                    // Relative URL without leading /
                    photoUrl = `${API_BASE}/${photo.url}`;
                  }
                }
                
                if (!photoUrl) {
                  if (__DEV__) {
                    console.warn('Invalid photo URL for photo:', photo);
                  }
                  return null;
                }
                
                if (__DEV__) {
                  console.log('Loading image from URL:', photoUrl);
                }
                
                return (
                  <Image
                    key={photo.id}
                    source={{ uri: photoUrl }}
                    style={styles.photoThumbnail}
                    resizeMode="cover"
                    onError={(e) => {
                      if (__DEV__) {
                        console.log('Image load error for URL:', photoUrl, 'Error:', e.nativeEvent.error);
                      }
                    }}
                    onLoad={() => {
                      if (__DEV__) {
                        console.log('Image loaded successfully:', photoUrl);
                      }
                    }}
                  />
                );
              }).filter(Boolean)}
            </ScrollView>
            {report.photos.length > 3 && (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText}>+{report.photos.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* Location */}
        {report.addressText && (
          <Pressable
            onPress={() => setExpandedAddress(!expandedAddress)}
            style={styles.locationContainer}
          >
            <MaterialCommunityIcons
              name="map-marker"
              size={16}
              color={colors.textSecondary}
            />
            <Text
              style={styles.addressText}
              numberOfLines={expandedAddress ? undefined : 1}
            >
              {report.addressText}
            </Text>
            {!expandedAddress && (
              <Text style={styles.expandHint}>Tap to expand</Text>
            )}
          </Pressable>
        )}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.timeContainer}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={14}
              color={colors.textTertiary}
            />
            <Text style={styles.relativeTime}>{getRelativeTime(report.createdAt)}</Text>
            <Text style={styles.exactDate}>
              {` • ${new Date(report.createdAt).toLocaleDateString()}`}
            </Text>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleNavigate();
              }}
              style={styles.actionButton}
            >
              <MaterialCommunityIcons name="navigation" size={18} color={colors.buttonPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              style={styles.actionButton}
            >
              <MaterialCommunityIcons name="share-variant" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ReportsScreen() {
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [adminReports, setAdminReports] = useState<AdminReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<(Report | AdminReport)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  
  const router = useRouter();
  const { user, isOfficer } = useAuth();
  const params = useLocalSearchParams<{ viewMode?: string }>();

  useEffect(() => {
    if (params.viewMode) {
      setViewMode(params.viewMode as ViewMode);
    }
    if (user) {
      loadReports().then(() => setInitialLoadDone(true));
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [allReports, adminReports, viewMode, searchQuery, sortBy]);

  // Reload when status filter or view mode changes
  useEffect(() => {
    if (user && initialLoadDone) {
      loadReports();
    }
  }, [viewMode]);

  async function loadReports() {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      if (isOfficer && (viewMode === 'assigned' || viewMode === 'my')) {
        // Load admin reports for officers
        const apiFilters: any = {
          limit: 200,
        };
        
        if (viewMode === 'assigned') {
          apiFilters.assigneeId = user.id;
        }

        const response = await apiClient.getAdminReports(apiFilters);
        
        if (__DEV__) {
          console.log('Admin reports loaded:', response.data.length);
          if (response.data.length > 0) {
            console.log('First report photos:', response.data[0].photos);
          }
        }
        
        if (viewMode === 'assigned') {
          // Filter to only show reports assigned to current officer
          const assignedReports = response.data.filter(
            (r) => r.currentAssignment?.assignee?.id === user.id
          );
          setAdminReports(assignedReports);
        } else {
          setAdminReports(response.data);
        }
        setAllReports([]);
      } else {
        // Load regular reports for all view
        const response = await apiClient.getReports();
        
        if (__DEV__) {
          console.log('Reports loaded:', response.data.length);
          if (response.data.length > 0) {
            console.log('First report photos:', response.data[0].photos);
          }
        }
        
        setAllReports(response.data);
        setAdminReports([]);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
      setAllReports([]);
      setAdminReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function applyFilters() {
    const reportsToFilter = viewMode === 'assigned' || (isOfficer && viewMode === 'my' && adminReports.length > 0)
      ? adminReports
      : allReports;

    let filtered: (Report | AdminReport)[] = [...reportsToFilter];

    // View mode filter
    if (viewMode === 'my' && user?.id) {
      if (isOfficer && adminReports.length > 0) {
        // For officers, filter admin reports by reporter
        filtered = filtered.filter((r) => (r as AdminReport).reporter?.id === user.id);
      } else {
        // For citizens, filter by reporterId
        filtered = filtered.filter((r) => (r as Report).reporterId === user.id);
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    applySorting(filtered);

    setFilteredReports(filtered);
  }

  function applySorting(reports: (Report | AdminReport)[]) {
    reports.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'priority':
          // Use priority score if available, otherwise use severity
          const aPriority = (a as any).priorityScore || (a.severity === 'high' ? 3 : a.severity === 'medium' ? 2 : 1);
          const bPriority = (b as any).priorityScore || (b.severity === 'high' ? 3 : b.severity === 'medium' ? 2 : 1);
          comparison = bPriority - aPriority; // Higher priority first
          break;
        case 'status':
          const statusOrder = ['new', 'triaged', 'assigned', 'in_progress', 'resolved', 'rejected'];
          comparison = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
          break;
        case 'newest':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          break;
        case 'oldest':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'most_urgent':
          // High severity first, then by age (oldest first)
          if (a.severity === 'high' && b.severity !== 'high') return -1;
          if (b.severity === 'high' && a.severity !== 'high') return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'least_urgent':
          // Low severity first, then by age (newest first)
          if (a.severity === 'low' && b.severity !== 'low') return -1;
          if (b.severity === 'low' && a.severity !== 'low') return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
      
      return comparison;
    });
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
  };

  // Get available view modes based on user role
  const getViewModes = (): { label: string; mode: ViewMode }[] => {
    if (isOfficer) {
      return [
        { label: 'All Reports', mode: 'all' },
        { label: 'My Reports', mode: 'my' },
        { label: 'Assigned', mode: 'assigned' },
      ];
    }
    return [
      { label: 'All Reports', mode: 'all' },
      { label: 'My Reports', mode: 'my' },
    ];
  };

  const viewModes = getViewModes();
  const totalCount = filteredReports.length;
  const viewModeCounts = {
    all: isOfficer && adminReports.length > 0 ? adminReports.length : allReports.length,
    my: user?.id 
      ? (isOfficer && adminReports.length > 0
          ? adminReports.filter((r) => r.reporter?.id === user.id).length
          : allReports.filter((r) => r.reporterId === user.id).length)
      : 0,
    assigned: isOfficer && adminReports.length > 0
      ? adminReports.filter((r) => r.currentAssignment?.assignee?.id === user?.id).length
      : 0,
  };

  if (loading && filteredReports.length === 0 && user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.buttonPrimary} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.buttonPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
          <Text style={styles.headerSubtitle}>
            {`${totalCount} ${totalCount === 1 ? 'report' : 'reports'}`}
          </Text>
        </View>
      </View>

      {/* View Mode Tabs */}
      <View style={styles.tabContainer}>
        {viewModes.map(({ label, mode }) => (
          <TouchableOpacity
            key={mode}
            style={[styles.tab, viewMode === mode && styles.tabActive]}
            onPress={() => setViewMode(mode)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, viewMode === mode && styles.tabTextActive]}>
              {label}
            </Text>
            {viewMode === mode && viewModeCounts[mode] > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{viewModeCounts[mode]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reports..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.searchActions}>
          {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => setSearchQuery('')}
                style={styles.searchActionButton}
              >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
              style={[styles.sortButtonInline, showSortMenu && styles.sortButtonInlineActive]}
            onPress={() => setShowSortMenu(!showSortMenu)}
          >
            <MaterialCommunityIcons
              name="sort"
                size={20}
              color={showSortMenu ? '#FFFFFF' : colors.buttonPrimary}
            />
          </TouchableOpacity>
          </View>
        </View>
        {showSortMenu && (
          <>
            <TouchableOpacity
              style={styles.sortMenuOverlay}
              activeOpacity={1}
              onPress={() => setShowSortMenu(false)}
            />
            <View style={styles.sortMenu}>
              <View style={styles.sortSection}>
                <Text style={styles.sortSectionTitle}>Date</Text>
              <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'date_desc' && styles.sortOptionSelected]}
                onPress={() => {
                    setSortBy('date_desc');
                  setShowSortMenu(false);
                }}
              >
                  <MaterialCommunityIcons
                    name="sort-calendar-descending"
                    size={18}
                    color={sortBy === 'date_desc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'date_desc' && styles.sortOptionTextSelected]}>
                    Newest First
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'date_asc' && styles.sortOptionSelected]}
                onPress={() => {
                    setSortBy('date_asc');
                  setShowSortMenu(false);
                }}
              >
                  <MaterialCommunityIcons
                    name="sort-calendar-ascending"
                    size={18}
                    color={sortBy === 'date_asc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'date_asc' && styles.sortOptionTextSelected]}>
                    Oldest First
                </Text>
              </TouchableOpacity>
              </View>

              <View style={styles.sortSection}>
                <Text style={styles.sortSectionTitle}>Priority</Text>
              <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'priority_desc' && styles.sortOptionSelected]}
                onPress={() => {
                    setSortBy('priority_desc');
                  setShowSortMenu(false);
                }}
              >
                  <MaterialCommunityIcons
                    name="sort-descending"
                    size={18}
                    color={sortBy === 'priority_desc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'priority_desc' && styles.sortOptionTextSelected]}>
                    High to Low
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'priority_asc' && styles.sortOptionSelected]}
                onPress={() => {
                    setSortBy('priority_asc');
                  setShowSortMenu(false);
                }}
              >
                  <MaterialCommunityIcons
                    name="sort-ascending"
                    size={18}
                    color={sortBy === 'priority_asc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'priority_asc' && styles.sortOptionTextSelected]}>
                    Low to High
                </Text>
              </TouchableOpacity>
              </View>

              <View style={[styles.sortSection, styles.sortSectionLast]}>
                <Text style={styles.sortSectionTitle}>Other</Text>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'status' && styles.sortOptionSelected]}
                  onPress={() => {
                    setSortBy('status');
                    setShowSortMenu(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="sort-alphabetical-variant"
                    size={18}
                    color={sortBy === 'status' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'status' && styles.sortOptionTextSelected]}>
                    By Status
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'title_asc' && styles.sortOptionSelected]}
                  onPress={() => {
                    setSortBy('title_asc');
                    setShowSortMenu(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="sort-alphabetical-ascending"
                    size={18}
                    color={sortBy === 'title_asc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'title_asc' && styles.sortOptionTextSelected]}>
                    Title (A-Z)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortOption, sortBy === 'title_desc' && styles.sortOptionSelected]}
                  onPress={() => {
                    setSortBy('title_desc');
                    setShowSortMenu(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="sort-alphabetical-descending"
                    size={18}
                    color={sortBy === 'title_desc' ? colors.buttonPrimary : colors.textSecondary}
                    style={styles.sortOptionIcon}
                  />
                  <Text style={[styles.sortOptionText, sortBy === 'title_desc' && styles.sortOptionTextSelected]}>
                    Title (Z-A)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Reports List */}
      <FlatList
        data={filteredReports}
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            onPress={() => router.push(`/report/${item.id}` as any)}
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={64}
              color={colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>
              {`No ${viewMode === 'my' ? 'my ' : viewMode === 'assigned' ? 'assigned ' : ''}reports`}
            </Text>
            <Text style={styles.emptyText}>
              {viewMode === 'my'
                ? "You haven't created any reports yet."
                : viewMode === 'assigned'
                ? "You don't have any assigned reports yet."
                : 'There are no reports available at the moment.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + 26,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
    ...shadows.sm,
  },
  header: {
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    marginBottom: spacing.xs,
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    marginHorizontal: spacing.md,
    marginTop: spacing.md + 4,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg + 2,
    padding: 8,
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.buttonPrimary,
    ...shadows.md,
    shadowColor: colors.buttonPrimary + '40',
    shadowOpacity: 0.3,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: borderRadius.round,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.fontFamily,
  },
  searchContainer: {
    padding: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
    position: 'relative',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.dividerLight,
    ...shadows.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    marginRight: spacing.xs,
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchActionButton: {
    padding: 2,
  },
  sortButtonInline: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.buttonPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortButtonInlineActive: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
  },
  filterChip: {
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.dividerLight,
    marginRight: spacing.sm,
    ...shadows.sm,
  },
  filterChipSelected: {
    backgroundColor: colors.buttonPrimary,
    borderColor: colors.buttonPrimary,
    ...shadows.md,
    shadowColor: colors.buttonPrimary + '40',
    shadowOpacity: 0.3,
  },
  filterChipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  sortMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  sortMenu: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    ...shadows.lg,
    position: 'absolute',
    top: '100%',
    right: spacing.md,
    left: spacing.md,
    zIndex: 10,
    marginTop: spacing.xs,
    maxHeight: 400,
  },
  sortSection: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerLight,
  },
  sortSectionLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  sortSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  sortOptionIcon: {
    marginRight: spacing.sm,
  },
  sortOptionSelected: {
    backgroundColor: colors.buttonPrimary + '15',
  },
  sortOptionText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    fontWeight: '500',
  },
  sortOptionTextSelected: {
    color: colors.buttonPrimary,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.md + 6,
    paddingBottom: spacing.xl + 8,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.cardPadding,
    marginBottom: spacing.md + 4,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    ...shadows.lg,
    borderLeftWidth: 4,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cardHeader: {
    marginBottom: spacing.sm,
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
    marginRight: spacing.sm,
    fontFamily: typography.fontFamily,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    gap: 5,
    ...shadows.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  description: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.sm + 2,
    marginTop: spacing.sm,
    lineHeight: 22,
    fontFamily: typography.fontFamily,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    gap: 5,
    ...shadows.sm,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  photosContainer: {
    marginBottom: spacing.sm,
    position: 'relative',
  },
  photosScrollContent: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 0,
    right: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontFamily: typography.fontFamily,
    lineHeight: 18,
  },
  expandHint: {
    fontSize: 11,
    color: colors.buttonPrimary,
    marginLeft: spacing.xs,
    fontFamily: typography.fontFamily,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.dividerLight,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  relativeTime: {
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
  exactDate: {
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: typography.fontFamily,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dividerLight,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2.5,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    marginTop: spacing.md + 4,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    textAlign: 'center',
    marginBottom: spacing.md + 4,
    lineHeight: 22,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
});

