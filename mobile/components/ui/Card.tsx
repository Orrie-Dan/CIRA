import { View, StyleSheet, ViewStyle } from 'react-native';
import { Card as PaperCard, CardProps } from 'react-native-paper';
import { colors, borderRadius, shadows } from '../../lib/theme';

interface CustomCardProps extends CardProps {
  variant?: 'default' | 'elevated' | 'outlined';
}

export function Card({ variant = 'default', style, ...props }: CustomCardProps) {
  const cardStyle = [
    styles.card,
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    style,
  ];

  return <PaperCard style={cardStyle} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
  },
  elevated: {
    ...shadows.md,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
});



