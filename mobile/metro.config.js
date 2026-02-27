const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Watch packages/shared so Metro picks up changes outside mobile/
config.watchFolders = [path.resolve(__dirname, "../packages")];

module.exports = config;
