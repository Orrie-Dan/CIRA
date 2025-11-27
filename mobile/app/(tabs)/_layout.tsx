import { Tabs, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';

export default function TabsLayout() {
  const { isAuthenticated, loading, isOfficer } = useAuth();

  if (loading) {
    return null; // Or a loading screen
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00b8d4',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map" size={size} color={color} />
          ),
        }}
      />
      {isOfficer ? (
        <Tabs.Screen
          name="officer-dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
            ),
          }}
        />
      ) : (
        <Tabs.Screen
          name="officer-dashboard"
          options={{
            href: null, // Hide the tab completely for citizens
          }}
        />
      )}
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
