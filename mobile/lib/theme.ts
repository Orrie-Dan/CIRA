export const colors = {
  // Modern color palette
  headerBackground: '#0d3d4d', // Dark teal
  buttonPrimary: '#0EA5E9', // Sky blue
  buttonPrimaryHover: '#0284C7', // Darker sky blue for hover
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  placeholder: '#cccccc',
  inputBorder: '#e0e0e0',
  inputBorderFocus: '#0EA5E9',
  menuItemTap: '#f5f5f5',
  divider: '#e0e0e0',
  dividerLight: '#f0f0f0',
  
  // Status colors with better saturation
  primary: '#0EA5E9', // Sky blue
  primaryDark: '#0284C7',
  primaryLight: '#38BDF8',
  secondary: '#10B981', // Emerald
  accent: '#F59E0B', // Amber
  error: '#EF4444', // Red with more saturation
  warning: '#F59E0B', // Amber
  success: '#10B981', // Emerald
  background: '#FFFFFF', // White for cards
  surface: '#F8FAFC', // Very light gray-blue for main background
  surfaceVariant: '#F1F5F9', // Slightly darker gray-blue
  text: '#1a1a1a',
  textTertiary: '#999999',
  border: '#E5E7EB',
  shadow: 'rgba(0, 0, 0, 0.08)',
  
  // Status-specific colors
  statusAssigned: '#9C27B0',
  statusInProgress: '#F59E0B', // Amber instead of red
  statusResolved: '#10B981', // Emerald
  statusNew: '#0EA5E9', // Sky blue
  
  // Map marker colors
  markerRestaurant: '#ff9800', // Orange
  markerHotel: '#e91e63', // Pink/magenta
  markerStadium: '#4caf50', // Green
  markerOther: '#9c27b0', // Purple
  markerCurrentLocation: '#2196f3', // Blue
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  // Additional spacing for better hierarchy
  section: 32,
  cardPadding: 20,
};

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
  full: 9999, // Alias for round
};

export const typography = {
  // System font stack
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  
  h1: {
    fontSize: 36,
    fontWeight: '800' as const,
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  h2: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  h3: {
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  header: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
};

export const shadows = {
  sm: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
};



