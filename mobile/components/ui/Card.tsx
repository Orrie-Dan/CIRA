import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Card as PaperCard } from 'react-native-paper';
import { colors, borderRadius, shadows } from '../../lib/theme';

type PaperCardProps = ComponentProps<typeof PaperCard>;

type CustomCardProps = PaperCardProps & {
  variant?: 'default' | 'elevated' | 'outlined';
};

export function Card({ variant = 'default', style, ...props }: CustomCardProps) {
  const cardStyle = [
    styles.card,
    variant === 'elevated' ? styles.elevated : undefined,
    variant === 'outlined' ? styles.outlined : undefined,
    style,
  ];

  // PaperCard's props are a union over `mode`; the rest-spread loses the
  // discriminant, so restore the component's own prop type.
  return <PaperCard {...({ ...props, style: cardStyle } as PaperCardProps)} />;
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
