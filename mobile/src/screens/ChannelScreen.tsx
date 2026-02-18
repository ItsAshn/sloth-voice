import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { format } from "date-fns";
import { useStore } from "../store/useStore";
import {
  fetchMessages,
  sendMessage,
  fetchMembers,
  configureApi,
} from "../api/server";
import { useSocket } from "../hooks/useSocket";
import type { RootStackParamList } from "../../App";
import type { Message } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Channel">;
type Route = RouteProp<RootStackParamList, "Channel">;

const C = {
  bg: "#050508",
  surface: "#0c0d17",
  low: "#111228",
  brand: "#7b72f0",
  text: "#c9cef0",
  muted: "#4c5280",
  danger: "#e05a5a",
};

export default function ChannelScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { channelId, channelName, channelType } = route.params;

  const { activeServer, sessions, messages, setMessages, members, setMembers } =
    useStore();
  const session = activeServer ? sessions[activeServer.id] : undefined;
  const socketRef = useSocket(activeServer?.url ?? "", session?.token);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    nav.setOptions({ title: `#${channelName}` });
    if (!activeServer || !session) return;
    configureApi(activeServer.url, session.token);
    fetchMessages(channelId).then(setMessages).catch(console.error);
    fetchMembers().then(setMembers).catch(console.error);
  }, [channelId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeServer || !session) return;
    setSending(true);
    configureApi(activeServer.url, session.token);
    try {
      const msg = await sendMessage(channelId, text);
      setMessages([
        ...messages,
        {
          ...msg,
          display_name: session.user.display_name,
          username: session.user.username,
        },
      ]);
      setInput("");
    } finally {
      setSending(false);
    }
  };

  const getMemberName = (msg: Message) =>
    msg.display_name ||
    msg.username ||
    members.find((m) => m.id === msg.user_id)?.display_name ||
    "Unknown";

  if (channelType === "voice") {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Text style={{ fontSize: 40 }}>🔊</Text>
        <Text style={[styles.title, { color: C.text, marginTop: 12 }]}>
          {channelName}
        </Text>
        <Text style={{ color: C.muted, marginTop: 8 }}>
          Voice calls on mobile coming soon.
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          Use the desktop app for voice.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 4 }}
        ListEmptyComponent={
          <Text style={{ color: C.muted, textAlign: "center", marginTop: 40 }}>
            No messages yet. Say something!
          </Text>
        }
        renderItem={({ item }) => {
          const isOwn = item.user_id === session?.user.id;
          const name = getMemberName(item);
          return (
            <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
              <View style={[styles.avatar, { backgroundColor: C.brand }]}>
                <Text style={styles.avatarText}>
                  {name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.bubble,
                  isOwn
                    ? { backgroundColor: "#7b72f015", borderColor: "#7b72f030" }
                    : { backgroundColor: C.surface },
                ]}
              >
                <Text style={{ color: C.muted, fontSize: 11, marginBottom: 2 }}>
                  {name} · {format(new Date(item.created_at), "HH:mm")}
                </Text>
                <Text style={{ color: C.text, fontSize: 14 }}>
                  {item.content}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.inputRow, { backgroundColor: C.surface }]}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: C.low, color: C.text, flex: 1 },
          ]}
          placeholder={`Message #${channelName}`}
          placeholderTextColor={C.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || !input.trim()}
          style={[
            styles.sendBtn,
            {
              backgroundColor: C.brand,
              opacity: !input.trim() || sending ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050508" },
  title: { fontSize: 18, fontWeight: "700" },
  msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  msgRowOwn: { flexDirection: "row-reverse" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#7b72f0",
    backgroundColor: "#1e1f38",
  },
  avatarText: { color: "#c9cef0", fontSize: 11, fontWeight: "700" },
  bubble: {
    borderRadius: 4,
    padding: 8,
    maxWidth: "80%",
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#1e1f38",
  },
  input: {
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
