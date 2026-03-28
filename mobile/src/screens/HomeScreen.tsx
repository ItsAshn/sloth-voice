import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useStore } from "../store/useStore";
import { fetchServerInfo, resolveInviteCode } from "../api/server";
import type { RootStackParamList } from "../../App";
import type { SavedServer } from "../types";
import { C } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

function isInviteCode(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(".");
  if (parts.length !== 2) return false;
  const [encoded, token] = parts;
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return base64urlPattern.test(encoded) && base64urlPattern.test(token);
}

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { savedServers, addServer, removeServer, sessions } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = (server: SavedServer) => {
    const session = sessions[server.id];
    if (!session) {
      nav.navigate("Auth", {
        serverId: server.id,
        serverUrl: server.url,
        serverName: server.name,
      });
    } else {
      nav.navigate("Server", { serverId: server.id });
    }
  };

  const normalizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
  };

  const handleAdd = async () => {
    setError("");
    setLoading(true);
    try {
      const trimmed = input.trim();
      let serverUrl: string;
      let name: string;

      if (isInviteCode(trimmed)) {
        const resolved = await resolveInviteCode(trimmed);
        serverUrl = resolved.serverUrl;
        name = resolved.name;
      } else {
        serverUrl = normalizeUrl(trimmed);
        const info = await fetchServerInfo(serverUrl);
        name = info.name;
      }

      const saved = await addServer({
        name,
        url: serverUrl,
      });
      setShowAdd(false);
      setInput("");
      nav.navigate("Auth", {
        serverId: saved.id,
        serverUrl: saved.url,
        serverName: saved.name,
      });
    } catch {
      setError(
        isInviteCode(input.trim())
          ? "Invalid or expired invite code."
          : "Could not reach server. Check the URL or code."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (id: string, name: string) => {
    Alert.alert("Remove Server", `Remove "${name}" from your list?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeServer(id) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <FlatList
        data={savedServers}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: C.text }]}>
              No servers yet
            </Text>
            <Text style={{ color: C.muted, textAlign: "center" }}>
              Tap + to add a server by URL or invite code.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.serverRow, { backgroundColor: C.surface }]}
            onPress={() => handleSelect(item)}
            onLongPress={() => handleRemove(item.id, item.name)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: C.brand }]}>
              <Text style={styles.avatarText}>
                {item.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: "600", fontSize: 15 }}>
                {item.name}
              </Text>
              <Text style={{ color: C.muted, fontSize: 12 }} numberOfLines={1}>
                {item.url}
              </Text>
            </View>
            {sessions[item.id] && (
              <View style={[styles.badge, { backgroundColor: "#3fc87e" }]}>
                <Text
                  style={{ color: "#050508", fontSize: 9, fontWeight: "700" }}
                >
                  ✓
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: C.brand }]}
        onPress={() => setShowAdd(true)}
      >
        <Text style={{ color: "#fff", fontSize: 24, lineHeight: 28 }}>+</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>
              Add a Server
            </Text>
            <Text style={[styles.label, { color: C.muted }]}>
              SERVER URL OR INVITE CODE
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.low, color: C.text }]}
              placeholder="http://192.168.1.100:5000 or code"
              placeholderTextColor={C.muted}
              value={input}
              onChangeText={setInput}
              autoCapitalize="none"
              keyboardType="url"
            />
            {error ? (
              <Text style={{ color: C.danger, marginBottom: 8 }}>{error}</Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setShowAdd(false);
                  setError("");
                }}
                style={styles.btnGhost}
              >
                <Text style={{ color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={loading || !input.trim()}
                style={[styles.btnPrimary, { backgroundColor: C.brand }]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#c9cef0", fontWeight: "700", fontSize: 12 },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 16 },
  label: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 1,
  },
  input: {
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  btnGhost: { paddingHorizontal: 16, paddingVertical: 10 },
  btnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    minWidth: 60,
    alignItems: "center",
  },
});