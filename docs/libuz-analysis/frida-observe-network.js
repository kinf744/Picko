// Observation Frida en lecture seule pour appareil Android de test autorisé.
// Ne modifie ni paramètres, ni paquets, ni authentification.
'use strict';

const names = [
  'libuz_core.so',
  'libkighmu.so',
  'libhev-socks5-tunnel.so',
  'libtun2socks.so'
];

function log(message) {
  send({ type: 'observation', message: message });
}

function hookExport(moduleName, exportName, callbacks) {
  const address = Module.findExportByName(moduleName, exportName);
  if (!address) return;
  Interceptor.attach(address, callbacks);
  log(moduleName + '!' + exportName + ' @ ' + address);
}

Java.perform(function () {
  log('Frida attach: Java VM disponible');
});

for (const name of names) {
  try {
    const module = Process.findModuleByName(name);
    if (module) log('module loaded: ' + name + ' base=' + module.base + ' size=' + module.size);
  } catch (e) {
    log('module query error ' + name + ': ' + e);
  }
}

const socketExports = [
  ['libc.so', 'connect'],
  ['libc.so', 'sendto'],
  ['libc.so', 'recvfrom'],
  ['libc.so', 'sendmsg'],
  ['libc.so', 'recvmsg'],
  ['libc.so', 'setsockopt'],
  ['libc.so', 'getsockopt'],
  ['libc.so', 'dlopen']
];

for (const [moduleName, exportName] of socketExports) {
  hookExport(moduleName, exportName, {
    onEnter(args) {
      this.name = exportName;
      if (exportName === 'dlopen' && !args[0].isNull()) {
        try { log('dlopen(' + args[0].readCString() + ')'); } catch (_) {}
      }
      if (exportName === 'connect' && !args[1].isNull()) {
        log('connect(fd=' + args[0].toInt32() + ', sockaddr=' + args[1] + ', len=' + args[2].toInt32() + ')');
      }
    },
    onLeave(retval) {
      if (this.name === 'connect' || this.name === 'dlopen') log(this.name + ' => ' + retval);
    }
  });
}

log('hooks installed; observation only');
