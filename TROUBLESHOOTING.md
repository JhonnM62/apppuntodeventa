# Frontend Troubleshooting & Known Issues

This document acts as the AI and Developer Memory for the Q Hubo Mor POS frontend. It contains hard-learned lessons from past iterations. **Always consult this file before debugging UI or layout issues.**

## 1. UI & Layout Issues

### The Android "Overflow-Hidden + Shadow" Collapse Bug
- **Symptom**: Cards or containers completely disappear or cut off their content on Android devices.
- **Cause**: Android's rendering engine conflicts when `overflow: 'hidden'` is combined with shadows (`elevation` or Tailwind `shadow-*`) and border radius.
- **Fix**: Never use `overflow-hidden` with shadows on Android. Remove `overflow-hidden` and apply shadows directly to the parent, or wrap the content in a separate child container for clipping.

### The "Unreachable Scroll Bottom" Bug (Floating Dock)
- **Symptom**: Users cannot tap buttons at the very bottom of a `ScrollView` because they are blocked by the floating dock or safe area.
- **Fix**: Use the custom `useScrollDirection()` hook to dynamically hide the Floating Dock when the user reaches the absolute bottom. Alternatively, ensure `contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}` is applied.

### Tablet Letterboxing
- **Symptom**: The app runs with black bars on the sides on Android tablets in landscape mode.
- **Cause**: Expo's `app.json` orientation locking combined with Android's compatibility mode.
- **Fix**: Set `"orientation": "default"` in `app.json` and programmatically unlock it in `App.tsx` using `ScreenOrientation.unlockAsync()`.

## 2. Interaction & Forms

### The "Double Tap Required" Bug
- **Symptom**: Users have to tap twice on horizontal filters, dropdowns, or list items to trigger the `onPress` event.
- **Cause**: The parent `ScrollView`, `FlatList`, or `FlashList` intercepts the first tap to dismiss the keyboard or change focus.
- **Fix**: ALWAYS add `keyboardShouldPersistTaps="handled"` to the scrollable container.

### DateTimePicker Keyboard Conflict
- **Symptom**: When editing a date (e.g., in `HistorialVentasScreen`), the keyboard pops up and blocks the calendar.
- **Fix**: Replace `TextInput` with a `TouchableOpacity` that calls `Keyboard.dismiss()` before setting `showDatePicker(true)`. Use `@react-native-community/datetimepicker`.

## 3. Media & Images

### Expo-Image Native Module Crash
- **Symptom**: App crashes with `Cannot find native module 'ExpoImage'`.
- **Cause**: Using `expo-image` without a properly compiled Dev Client (e.g., standard Expo Go).
- **Fix**: Use a graceful fallback in the code:
  ```typescript
  import { Image as RNImage } from 'react-native';
  let ImageComponent: any = RNImage;
  try {
    const ExpoImageModule = require('expo-image');
    if (ExpoImageModule && ExpoImageModule.Image) ImageComponent = ExpoImageModule.Image;
  } catch (error) { /* Fallback */ }
  ```

### Cropped Images
- **Symptom**: Product or receipt images have their edges cut off.
- **Fix**: Do not use `resizeMode="cover"`. Always use `resizeMode="contain"` (or `contentFit="contain"`) with a solid background color (e.g., `#ffffff`).

## 4. DevOps & EAS

### Re-linking EAS Accounts
- **Symptom**: Cannot deploy because the project is linked to another EAS account.
- **Fix**: 
  1. Remove `"owner"` and `"projectId"` from `app.json`.
  2. Run `eas logout`.
  3. Run `eas login` with the new account.
  4. Run `eas init` to generate a new Project ID.
