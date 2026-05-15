import * as React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface TextProps extends RNTextProps {
  className?: string;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'muted' | 'caption';
}

const Text = React.forwardRef<RNText, TextProps>(
  ({ className, variant = 'body', ...props }, ref) => {
    const variantClasses = {
      h1: 'text-3xl font-extrabold text-foreground',
      h2: 'text-2xl font-bold text-foreground',
      h3: 'text-xl font-semibold text-foreground',
      body: 'text-base text-foreground',
      muted: 'text-sm text-muted-foreground',
      caption: 'text-xs text-muted-foreground',
    };

    return (
      <RNText
        ref={ref}
        className={cn(variantClasses[variant], className)}
        {...props}
      />
    );
  }
);
Text.displayName = 'Text';

export { Text };
