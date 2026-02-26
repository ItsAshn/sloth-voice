import { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SectionList,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useStore } from "../store/useStore";
import { fetchChannels, configureApi } from "../api/server";
import type { RootStackParamList } from "../../App";
import type { Channel } from "../types";
import { C } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Server">;
type Route = RouteProp<RootStackParamList, "Server">;

export default function ServerScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { serverId } = route.params;
  const {
    savedServers,
    sessions,
    channels,
    setChannels,
    setActiveServer,
    setActiveChannel,
  } = useStore();

  const server = savedServers.find((s) => s.id === serverId);
  const session = server ? sessions[server.id] : undefined;

  useEffect(() => {
    if (!server) return;
    setActiveServer(server);
    nav.setOptions({ title: server.name });
    if (!session) {
      nav.navigate("Auth", {
        serverId: server.id,
        serverUrl: server.url,
        serverName: server.name,
      });
      return;
    }
    configureApi(server.url, session.token);
    fetchChannels().then(setChannels).catch(console.error);
  }, [server?.id, session?.token]);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  const sections = [
    { title: "// text channels", data: textChannels, icon: ">" },
    { title: "// voice channels", data: voiceChannels, icon: "~" },
  ];

  const handleChannel = (channel: Channel) => {
    setActiveChannel(channel);
    nav.navigate("Channel", {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
    });
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 12 }}
      style={{ backgroundColor: C.bg }}
      renderSectionHeader={({ section }) => (
        <Text style={[styles.sectionHeader, { color: C.muted }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item, section }) => (
        <TouchableOpacity
          style={[styles.channelRow, { backgroundColor: C.surface }]}
          onPress={() => handleChannel(item)}
          activeOpacity={0.7}
        >
          <Text style={{ color: "#7b72f0", fontSize: 13, width: 16 }}>
            {(section as any).icon}
          </Text>
          <Text style={{ color: C.text, fontSize: 14 }}>{item.name}</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <Text
          style={{
            color: C.muted,
            textAlign: "center",
            marginTop: 40,
            fontSize: 13,
          }}
        >
          no channels yet.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
});
