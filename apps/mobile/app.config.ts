import type { ConfigContext, ExpoConfig } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleJson = process.env.GOOGLE_SERVICES_JSON,
    googlePlist = process.env.GOOGLE_SERVICE_PLIST,
    rp = process.env.PASSKEY_RP_DOMAIN;
  const plugins = [...(config.plugins ?? [])];
  if (googleJson || googlePlist)
    plugins.push(
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      ["expo-build-properties", { ios: { useFrameworks: "static" } }],
    );
  else plugins.push("expo-build-properties");
  return {
    ...config,
    name: "Stocket",
    slug: "stocket",
    plugins,
    android: {
      ...config.android,
      ...(googleJson ? { googleServicesFile: googleJson } : {}),
    },
    ios: {
      ...config.ios,
      ...(googlePlist ? { googleServicesFile: googlePlist } : {}),
      ...(rp ? { associatedDomains: [`webcredentials:${rp}`] } : {}),
    },
  };
};
