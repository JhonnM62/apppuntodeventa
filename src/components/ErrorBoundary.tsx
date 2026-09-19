import React from 'react';
import { View, Text, ScrollView } from 'react-native';

export class ErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={{ flex: 1, padding: 20, backgroundColor: 'red' }}>
          <Text style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>Algo salio mal!</Text>
          <Text style={{ color: 'white', marginTop: 10 }}>{this.state.error?.toString()}</Text>
          <Text style={{ color: 'white', marginTop: 10 }}>{this.state.error?.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
