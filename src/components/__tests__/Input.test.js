import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Input } from '../input';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('Input Component', () => {
  it('renders correctly with label', () => {
    const { getByText } = render(
      <Input label="Email" placeholder="Enter email" value="" onChangeText={() => {}} />
    );
    expect(getByText('Email')).toBeTruthy();
  });

  it('shows error message when error prop is provided', () => {
    const { getByText } = render(
      <Input label="Email" placeholder="Enter email" value="" onChangeText={() => {}} error="Email is required" />
    );
    expect(getByText('Email is required')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <Input label="Email" placeholder="Enter email" value="" onChangeText={onChangeText} />
    );
    fireEvent.changeText(getByPlaceholderText('Enter email'), 'test@example.com');
    expect(onChangeText).toHaveBeenCalledWith('test@example.com');
  });

  it('does not render error icon when there is no error and no value', () => {
    const { queryByTestId } = render(
      <Input label="Email" placeholder="Enter email" value="" onChangeText={() => {}} />
    );
    expect(queryByTestId('error-icon')).toBeNull();
  });
});
