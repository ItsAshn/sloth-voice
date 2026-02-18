import { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useStore } from "./src/store/useStore";
import HomeScreen from "./src/screens/HomeScreen";
import ServerScreen from "./src/screens/ServerScreen";
import AuthScreen from "./src/screens/AuthScreen";
import ChannelScreen from "./src/screens/ChannelScreen";

export type RootStackParamList = {
  Home: undefined;
  Auth: { serverId: string; serverUrl: string; serverName: string };
  Server: { serverId: string };
  Channel: {
    channelId: string;
    channelName: string;
    channelType: "text" | "voice";
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const darkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#050508",
    card: "#0c0d17",
    text: "#c9cef0",
    border: "#1e1f38",
    primary: "#7b72f0",
  },
};

export default function App() {
  const loadServers = useStore((s) => s.loadServers);

  useEffect(() => {
    loadServers();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={darkTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#0c0d17" },
            headerTintColor: "#c9cef0",
            headerTitleStyle: { fontWeight: "600", fontFamily: "monospace" },
            contentStyle: { backgroundColor: "#050508" },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "discard" }}
          />
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ title: "sign in" }}
          />
          <Stack.Screen name="Server" component={ServerScreen} />
          <Stack.Screen name="Channel" component={ChannelScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
