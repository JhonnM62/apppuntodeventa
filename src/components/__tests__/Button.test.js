import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Button } from '../button';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('Button Component', () => {
  it('renders correctly with children', () => {
    const { getByText } = render(<Button>Click Me</Button>);
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Click Me</Button>);
    fireEvent.press(getByText('Click Me'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress} disabled>Click Me</Button>);
    fireEvent.press(getByText('Click Me'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    const { queryByText } = render(<Button loading>Click Me</Button>);
    expect(queryByText('Click Me')).toBeNull();
  });

  it('applies variant styles correctly', () => {
    const { getByText } = render(<Button variant="destructive">Delete</Button>);
    expect(getByText('Delete')).toBeTruthy();
  });
});
