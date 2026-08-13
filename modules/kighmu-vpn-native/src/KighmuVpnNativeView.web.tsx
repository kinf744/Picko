import * as React from 'react';

import { KighmuVpnNativeViewProps } from './KighmuVpnNative.types';

export default function KighmuVpnNativeView(props: KighmuVpnNativeViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
