import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ImageBackground, Image } from 'react-native';
import { TextInput, Button, Text, Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { colors, spacing, borderRadius, shadows } from '../../lib/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { register } = useAuth();

  const handleRegister = async () => {
    // Clear previous errors
    setError('');
    
    // Client-side validation
    if (!email || !password) {
      setError('Please fill in all required fields (email and password)');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    if (fullName && fullName.trim().length > 0 && fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters long');
      return;
    }
    
    if (phone && phone.trim().length > 0 && phone.trim().length < 10) {
      setError('Phone number must be at least 10 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await register(email, password, fullName || undefined, phone || undefined);
      
      // Check if verification is required
      if ((response as any).requiresVerification) {
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email, phone: phone || undefined },
        } as any);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Safely extract error message - always return a clean string
      let errorMessage: string = 'Registration failed. Please try again.';
      
      // Try to extract a clean error message
      if (err && typeof err === 'object') {
        if (typeof err.message === 'string' && err.message.length > 0) {
          const msg = err.message;
          // Check if message looks like a stringified object (Prisma schema, etc.)
          if (msg.includes('Object') || 
              msg.includes('Input') || 
              msg.includes('Prisma') ||
              msg.includes('CreateNested') ||
              msg.includes('passwordHash') ||
              msg.includes('providerId') ||
              msg.length > 500) {
            // This looks like a stringified object, use generic message
            errorMessage = 'Registration failed. Please check your information and try again.';
          } else {
            errorMessage = msg;
          }
        }
      } else if (err && typeof err === 'string') {
        // Check if string looks like stringified object
        if (!err.includes('Object') && !err.includes('Input') && !err.includes('Prisma') && err.length < 500) {
          errorMessage = err;
        }
      }
      
      // Format error message for display
      if (errorMessage.includes('already exists') || errorMessage.includes('USER_ALREADY_EXISTS') || errorMessage.includes('DUPLICATE')) {
        errorMessage = 'An account with this email already exists.\n\nPlease use a different email or try logging in instead.';
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('Network Error') || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to the server.\n\nTroubleshooting:\n• Check if API server is running\n• Verify API URL in .env file\n• Ensure device is on the same network';
      } else if (errorMessage.includes('timed out') || errorMessage.includes('ECONNABORTED')) {
        errorMessage = 'Request timed out. Please check your connection and try again.';
      } else if (errorMessage.includes('Database') || errorMessage.includes('DATABASE')) {
        errorMessage = 'Server database error. Please try again in a few moments.';
      }
      
      // Final safety check - if message still looks like an object, use generic
      if (errorMessage.includes('Object') || 
          errorMessage.includes('Input') || 
          errorMessage.includes('Prisma') ||
          errorMessage.includes('CreateNested') ||
          errorMessage.length > 500) {
        errorMessage = 'Registration failed. Please check your information and try again.';
      }
      
      // Log the full error for debugging
      console.log('Full error details:', {
        errorMessage,
        error: err,
        errorType: typeof err,
        errorMessageType: typeof err?.message,
        errorResponse: (err as any)?.response?.data,
      });
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ImageBackground
        source={require('../../assets/Infra1.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Image
                  source={require('../../assets/Coat_of_Arms_Rwanda-01.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
            </View>

          <Text variant="headlineLarge" style={styles.title}>
            Create Account
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            Join CIRA to help improve infrastructure in your community
          </Text>

          <View style={styles.form}>
            <TextInput
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              mode="outlined"
              autoCapitalize="words"
              left={<TextInput.Icon icon="account" />}
              style={styles.input}
              disabled={loading}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              placeholder="Optional"
            />

            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              left={<TextInput.Icon icon="email" />}
              style={styles.input}
              disabled={loading}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              required
            />

            <TextInput
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              mode="outlined"
              keyboardType="phone-pad"
              left={<TextInput.Icon icon="phone" />}
              style={styles.input}
              disabled={loading}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              placeholder="Optional"
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              autoComplete="password"
              left={<TextInput.Icon icon="lock" />}
              right={
                password.length > 0 ? (
                  <TextInput.Icon 
                    icon={showPassword ? "eye-off" : "eye"} 
                    onPress={() => setShowPassword(!showPassword)} 
                  />
                ) : null
              }
              style={styles.input}
              disabled={loading}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              required
              helperText={password.length > 0 && password.length < 6 ? "Password must be at least 6 characters" : ""}
            />

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading || !email || !password || password.length < 6}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              Create Account
            </Button>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              mode="outlined"
              onPress={() => router.back()}
              disabled={loading}
              style={styles.loginButton}
              contentStyle={styles.buttonContent}
            >
              Already have an account? Sign In
            </Button>
          </View>
        </View>
        </ScrollView>
      </ImageBackground>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3000}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.round,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xs,
    ...shadows.lg,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    color: '#F5F5F5',
    lineHeight: 22,
  },
  form: {
    marginTop: spacing.md,
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  button: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  buttonContent: {
    paddingVertical: spacing.sm,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    color: '#E0E0E0',
    fontSize: 14,
  },
  loginButton: {
    marginTop: spacing.sm,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
  },
});
