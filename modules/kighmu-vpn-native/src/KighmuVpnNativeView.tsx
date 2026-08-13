import { requireNativeView } from 'expo';
import * as React from 'react';

import { KighmuVpnNativeViewProps } from './KighmuVpnNative.types';

const NativeView: React.ComponentType<KighmuVpnNativeViewProps> =
  requireNativeView('KighmuVpnNative');

export default function KighmuVpnNativeView(props: KighmuVpnNativeViewProps) {
  return <NativeView {...props} />;
}
