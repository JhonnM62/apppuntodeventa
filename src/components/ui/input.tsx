import * as React from 'react';
import { View, TextInput, Text, Pressable } from 'react-native';
import { cn } from '../../lib/utils';
import { COLORS } from '../../lib/theme';

export interface InputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {
  error?: string;
  label?: string;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
  ({ className, error, label, rightIcon, ...props }, ref) => {
    return (
      <View className="w-full">
        {label && (
          <Text className="text-sm font-semibold text-gray-800 mb-2 ml-1 tracking-wide">
            {label}
          </Text>
        )}
        <View className="relative">
          <TextInput
            ref={ref}
            className={cn(
              'h-12 px-3 pr-10 rounded-xl border text-base bg-white text-gray-900',
              props.multiline && 'h-auto py-3',
              error
                ? 'border-destructive focus:border-destructive'
                : 'border-input focus:border-primary',
              className
            )}
            placeholderTextColor="#9ca3af"
            textAlignVertical={props.multiline ? "top" : "center"}
            {...props}
          />
          {rightIcon && (
            <View className="absolute right-4 top-0 bottom-0 justify-center">
              {rightIcon}
            </View>
          )}
        </View>
        {error && (
          <Text className="text-xs text-destructive mt-1.5 ml-1 font-medium">{error}</Text>
        )}
      </View>
    );
  }
);
Input.displayName = 'Input';

export { Input, TextInput };
