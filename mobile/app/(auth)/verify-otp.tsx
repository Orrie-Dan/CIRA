import { useState, useRef } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ImageBackground, Image, TextInput as RNTextInput } from 'react-native';
import { Text, Button, Snackbar } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../lib/api';
import { colors, spacing, borderRadius, shadows } from '../../lib/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function VerifyOTPScreen() {
  const params = useLocalSearchParams<{ email?: string; phone?: string }>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const router = useRouter();
  const inputRefs = useRef<(RNTextInput | null)[]>([]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const pastedOtp = value.slice(0, 6).split('');
      const newOtp = [...otp];
      pastedOtp.forEach((char, i) => {
        if (index + i < 6 && /^\d$/.test(char)) {
          newOtp[index + i] = char;
        }
      });
      setOtp(newOtp);
      // Focus last filled input
      const lastFilledIndex = Math.min(index + pastedOtp.length - 1, 5);
      inputRefs.current[lastFilledIndex]?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiClient.verifyOTP({
        code,
        email: params.email,
        phone: params.phone,
      });

      if (response.token) {
        await apiClient.setToken(response.token);
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setError(err.message || 'Verification failed. Please check your code and try again.');
      // Clear OTP on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');

    try {
      await apiClient.sendOTP({
        email: params.email,
        phone: params.phone,
      });
      setError('Verification code resent successfully');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const identifier = params.email || params.phone || 'your email/phone';

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
              Verify Your Account
            </Text>
            <Text variant="bodyLarge" style={styles.subtitle}>
              Enter the 6-digit code sent to{'\n'}
              {identifier}
            </Text>

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <RNTextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  style={styles.otpInput}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(index, value)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={index === 0}
                />
              ))}
            </View>

            <Button
              mode="contained"
              onPress={handleVerify}
              loading={loading}
              disabled={loading || otp.join('').length !== 6}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              Verify
            </Button>

            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code?</Text>
              <Button
                mode="text"
                onPress={handleResend}
                disabled={resending || loading}
                loading={resending}
                style={styles.resendButton}
              >
                Resend Code
              </Button>
            </View>
          </View>
        </ScrollView>
      </ImageBackground>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={4000}
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
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  otpInput: {
    flex: 1,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: borderRadius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    borderWidth: 2,
    borderColor: colors.border,
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
  resendContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  resendText: {
    color: '#E0E0E0',
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  resendButton: {
    marginTop: spacing.xs,
  },
});





