import { registerWebModule, NativeModule } from 'expo';

import { KighmuVpnNativeModuleEvents } from './KighmuVpnNative.types';

class KighmuVpnNativeModule extends NativeModule<KighmuVpnNativeModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(KighmuVpnNativeModule, 'KighmuVpnNativeModule');
