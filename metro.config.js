const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Obfuscation JS uniquement en release (apktool/hermes-dec) — pas en dev pour garder le debug lisible
if (process.env.NODE_ENV === "production") {
  try {
    const jsoMetroPlugin = require("obfuscator-io-metro-plugin")(
      {
        compact: true,
        controlFlowFlattening: false, // désactivé pour Hermes (perf + stack traces)
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false, // secureLog déjà gated __DEV__
        identifierNamesGenerator: "hexadecimal",
        renameGlobals: false,
        selfDefending: false,
        stringArray: true,
        stringArrayThreshold: 0.6,
        stringArrayEncoding: ["base64"],
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
      },
      {
        runInDev: false,
        logObfuscatedFiles: false,
      }
    );
    config.transformer = {
      ...config.transformer,
      ...jsoMetroPlugin,
    };
  } catch (_) {}
}

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
