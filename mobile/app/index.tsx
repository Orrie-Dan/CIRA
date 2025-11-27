import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

export default function Index() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
