import * as React from 'react';
import { Text as RNText, TextProps as RNTextProps, Pressable } from 'react-native';
import { cn } from '../../lib/utils';

export interface LinkProps extends RNTextProps {
  onPress?: () => void;
}

const Link = React.forwardRef<RNText, LinkProps>(
  ({ className, onPress, children, ...props }, ref) => (
    <Pressable onPress={onPress}>
      <RNText
        ref={ref}
        className={cn(
          'text-base font-medium text-primary underline-offset-4 active:underline',
          className
        )}
        {...props}
      >
        {children}
      </RNText>
    </Pressable>
  )
);
Link.displayName = 'Link';

export { Link };
