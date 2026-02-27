const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Watch packages/shared so Metro picks up changes outside mobile/
config.watchFolders = [path.resolve(__dirname, "../packages")];

// Ensure axios (and other deps) imported from packages/shared resolve to mobile's node_modules
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
