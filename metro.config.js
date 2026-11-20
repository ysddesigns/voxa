// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]').replace(/\./g, '\\.');
const ignore = (rel) => new RegExp(`^${escape(path.join(__dirname, rel))}([/\\\\].*)?$`);

// The native module's android/ folder holds ~470 MB of native libraries, models and Gradle
// output that JavaScript never imports. Hashing it makes Metro slow to start and can hang it.
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ignore('modules/voxa-engine/android'),
  ignore('modules/voxa-engine/ios'),
  ignore('.engine-cache'),
];

module.exports = config;
