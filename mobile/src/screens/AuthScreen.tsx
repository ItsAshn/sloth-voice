import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useStore } from "../store/useStore";
import { login, register, fetchServerInfo } from "../api/server";
import type { RootStackParamList } from "../../App";

type Nav = NativeStackNavigationProp<RootStackParamList, "Auth">;
type Route = RouteProp<RootStackParamList, "Auth">;

const C = {
  bg: "#050508",
  surface: "#0c0d17",
  low: "#111228",
  brand: "#7b72f0",
  text: "#c9cef0",
  muted: "#4c5280",
  danger: "#e05a5a",
};

export default function AuthScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { serverId, serverUrl, serverName } = route.params;
  const setSession = useStore((s) => s.setSession);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [serverPassword, setServerPassword] = useState("");
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchServerInfo(serverUrl)
      .then((info) => setPasswordProtected(info.passwordProtected))
      .catch(() => {});
  }, [serverUrl]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? await login(serverUrl, username, password)
          : await register(
              serverUrl,
              username,
              password,
              displayName || username,
              serverPassword || undefined,
            );
      setSession(serverId, {
        serverId,
        token: result.token,
        user: result.user,
      });
      nav.replace("Server", { serverId });
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          "Authentication failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.card, { backgroundColor: C.surface }]}>
        <Text style={[styles.title, { color: C.text }]}>
          {mode === "login" ? "welcome back" : "create account"}
        </Text>
        <Text
          style={{ color: C.brand, fontWeight: "600", marginBottom: 20 }}
          numberOfLines={1}
        >
          {serverName}
        </Text>

        <Text style={[styles.label, { color: C.muted }]}>USERNAME</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.low, color: C.text }]}
          placeholder="username"
          placeholderTextColor={C.muted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === "register" && (
          <>
            <Text style={[styles.label, { color: C.muted }]}>DISPLAY NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.low, color: C.text }]}
              placeholder="Your Name"
              placeholderTextColor={C.muted}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </>
        )}

        <Text style={[styles.label, { color: C.muted }]}>PASSWORD</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.low, color: C.text }]}
          placeholder="••••••••"
          placeholderTextColor={C.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {mode === "register" && passwordProtected && (
          <>
            <Text style={[styles.label, { color: C.muted }]}>
              SERVER PASSWORD
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.low, color: C.text }]}
              placeholder="••••••••"
              placeholderTextColor={C.muted}
              value={serverPassword}
              onChangeText={setServerPassword}
              secureTextEntry
            />
          </>
        )}

        {error ? (
          <Text style={{ color: C.danger, marginBottom: 12, fontSize: 13 }}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: C.brand }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
              {mode === "login" ? "Sign In" : "Register"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode(mode === "login" ? "register" : "login")}
          style={{ marginTop: 16, alignItems: "center" }}
        >
          <Text style={{ color: C.muted }}>
            {mode === "login" ? "no account? " : "already registered? "}
            <Text style={{ color: C.brand }}>
              {mode === "login" ? "register" : "sign in"}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  card: {
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
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
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1e1f38",
  },
  btnPrimary: { borderRadius: 4, paddingVertical: 13, alignItems: "center" },
});
