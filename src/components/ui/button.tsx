import * as React from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { COLORS, SHADOWS, ANIMATION } from '../../lib/theme';

const buttonVariants = cva(
  'flex flex-row items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm',
        outline: 'border-2 border-border bg-background',
        secondary: 'bg-secondary text-secondary-foreground',
        ghost: 'active:bg-accent',
        link: 'text-primary underline-offset-4 active:underline',
      },
      size: {
        default: 'h-12 px-5 py-3',
        sm: 'h-10 px-4 py-2 rounded-lg',
        lg: 'h-14 px-8 py-4 rounded-xl text-base',
        icon: 'h-11 w-11 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<typeof Pressable>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            colorClassName={variant === 'outline' || variant === 'ghost' || variant === 'secondary' ? 'accent-foreground' : 'accent-white'}
            className="mr-2"
          />
        ) : null}
        <Text
          className={cn(
            'font-semibold text-center',
            variant === 'default' || variant === 'destructive' ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {children}
        </Text>
      </Pressable>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
