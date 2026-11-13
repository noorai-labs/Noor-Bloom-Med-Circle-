import { providers } from "./provider-display";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  ColorValue,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { canRead, Role } from "./clinic";
import { useClinic } from "./store";
import { StartupLoader } from "./branding";
export const theme = {
  bg: "#F6F8FA",
  ink: "#162C35",
  muted: "#657882",
  green: "#147D68",
  mint: "#E5F5EF",
  border: "#E7EDF0",
  red: "#C44C5C",
  lilac: "#EEEAFB",
  blue: "#E8F0FF",
};
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  color = theme.green,
  size = 22,
}: {
  name: IconName;
  color?: ColorValue;
  size?: number;
}) {
  return (
    <Ionicons name={name} size={size} style={{ color: color ?? theme.green }} />
  );
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => listener.remove();
  }, []);
  return reduced;
}
const FocusedFieldContext = createContext<
  (field: React.ComponentRef<typeof TextInput> | null) => void
>(() => {});
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}
export function Touch({
  children,
  onPress,
  style,
  label,
  disabled,
  selected,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  label?: string;
  disabled?: boolean;
  selected?: boolean;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  const spring = (value: number) => {
    if (!reduced)
      Animated.spring(scale, {
        toValue: value,
        speed: 28,
        bounciness: 3,
        useNativeDriver: Platform.OS !== "web",
      }).start();
  };
  return (
    <Animated.View
      style={{ transform: [{ scale }], opacity: disabled ? 0.45 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, selected: !!selected }}
        disabled={disabled}
        onPressIn={() => spring(0.97)}
        onPressOut={() => spring(1)}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
export function Entrance({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const [value] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: 360,
      delay,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [delay, reduced, value]);
  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
        gap: 18,
      }}
    >
      {children}
    </Animated.View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  danger,
  disabled,
  icon,
  loading,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <Touch
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: secondary
            ? theme.mint
            : danger
              ? theme.red
              : theme.green,
        },
      ]}
      label={title}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          icon && (
            <Icon
              name={icon}
              color={secondary ? theme.green : "white"}
              size={18}
            />
          )
        )}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: secondary ? theme.green : "white",
          }}
        >
          {title}
        </Text>
      </View>
    </Touch>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Title({
  children,
  small,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Text style={small ? styles.cardTitle : styles.title}>{children}</Text>
  );
}
export function Body({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Text style={[styles.body, muted && { color: theme.muted }]}>
      {children}
    </Text>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Chip({
  title,
  active,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress?: () => void;
}) {
  if (!onPress)
    return (
      <View
        style={[
          styles.chip,
          {
            backgroundColor:
              title === "Cancelled"
                ? "#FDEDF0"
                : title === "In Progress"
                  ? "#FFF3DB"
                  : theme.mint,
          },
        ]}
      >
        <Text style={styles.chipText}>{title}</Text>
      </View>
    );
  return (
    <Touch
      selected={active}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.green : "white",
          borderWidth: 1,
          borderColor: active ? theme.green : theme.border,
        },
      ]}
    >
      <Text style={[styles.chipText, active && { color: "white" }]}>
        {title}
      </Text>
    </Touch>
  );
}
export function Chips({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      {values.map((t) => (
        <Chip
          key={t}
          title={t}
          active={value === t}
          onPress={() => onChange(t)}
        />
      ))}
    </View>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  numeric,
  inputProps,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  inputProps?: TextInputProps;
  error?: string;
}) {
  const [focus, setFocus] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const reveal = useContext(FocusedFieldContext);
  return (
    <View style={{ gap: 8, width: "100%", minWidth: 0 }}>
      <Label>{label}</Label>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94A3AD"
        keyboardType={numeric ? "number-pad" : "default"}
        multiline={multiline}
        {...inputProps}
        onFocus={(event) => {
          setFocus(true);
          reveal(input.current);
          inputProps?.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocus(false);
          reveal(null);
          inputProps?.onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            borderColor: error ? theme.red : focus ? theme.green : theme.border,
          },
          multiline && { minHeight: 100, textAlignVertical: "top" },
          inputProps?.style,
        ]}
      />
      {!!error && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.red, fontSize: 12, lineHeight: 18 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
export function Avatar({
  providerId,
  size = 54,
}: {
  providerId?: string;
  size?: number;
}) {
  const p = providers.find((v) => v.id === providerId);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: p?.color || theme.mint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ fontSize: size * 0.3, fontWeight: "700", color: theme.ink }}
      >
        {p?.initials || <Icon name="person-outline" size={size * 0.4} />}
      </Text>
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      <Title small>{title}</Title>
      {action && onPress && (
        <Touch onPress={onPress}>
          <Text
            style={{
              color: theme.green,
              fontWeight: "600",
              paddingVertical: 10,
            }}
          >
            {action} →
          </Text>
        </Touch>
      )}
    </View>
  );
}
export function Empty({
  title,
  body,
  icon = "leaf-outline",
  action,
  onPress,
}: {
  title: string;
  body: string;
  icon?: IconName;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 36 }}>
      <View style={styles.iconBox}>
        <Icon name={icon} size={28} />
      </View>
      <Title small>{title}</Title>
      <Body muted>{body}</Body>
      {action && onPress && <Button title={action} onPress={onPress} />}
    </Card>
  );
}
export function Hero({
  eyebrow,
  title,
  body,
  button,
  onPress,
}: {
  eyebrow: string;
  title: string;
  body: string;
  button?: string;
  onPress?: () => void;
}) {
  return (
    <LinearGradient
      colors={["#157D6A", "#0F574E"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View
        style={{
          position: "absolute",
          width: 190,
          height: 190,
          borderRadius: 95,
          right: -65,
          top: -45,
          borderWidth: 30,
          borderColor: "#FFFFFF0C",
        }}
      />
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 2,
          color: "#ACE4D7",
          fontWeight: "700",
        }}
      >
        {eyebrow}
      </Text>
      <Text
        style={{
          fontSize: 27,
          lineHeight: 34,
          fontWeight: "700",
          color: "white",
          letterSpacing: -0.8,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 21, color: "#D0EDE6" }}>
        {body}
      </Text>
      {button && onPress && (
        <Touch
          onPress={onPress}
          style={{
            backgroundColor: "white",
            padding: 14,
            borderRadius: 14,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: theme.green, fontWeight: "700" }}>
            {button} ↗
          </Text>
        </Touch>
      )}
    </LinearGradient>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  back,
  allowed,
  noGuard = false,
  maxWidth = 760,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  allowed?: Role[];
  noGuard?: boolean;
  maxWidth?: number;
}) {
  const { state, ready, toast } = useClinic();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef<React.ComponentRef<typeof View>>(null);
  const focused = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealFocused = useCallback(() => {
    if (Platform.OS === "web") return;
    const field = focused.current;
    const scroller = scroll.current;
    if (!field || !scroller) return;
    viewport.current?.measureInWindow((_x, top, _width, viewportHeight) => {
      field.measureInWindow((_fieldX, y, _fieldWidth, fieldHeight) => {
        // Leave space for the submit button, not just the input's lower edge.
        const visibleBottom = Math.min(
          top + viewportHeight,
          keyboardTop.current ?? Infinity,
        );
        const overlap = y + fieldHeight + 88 - visibleBottom;
        if (overlap > 0)
          scroller.scrollTo({
            y: Math.max(0, offset.current + overlap),
            animated: true,
          });
        else if (y < top + 16)
          scroller.scrollTo({
            y: Math.max(0, offset.current + y - top - 16),
            animated: true,
          });
      });
    });
  }, []);
  const scheduleReveal = useCallback(() => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = setTimeout(revealFocused, 120);
  }, [revealFocused]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      scheduleReveal();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
      if (retry.current) clearTimeout(retry.current);
    };
  }, [scheduleReveal]);
  if (!ready) return <StartupLoader />;
  if (
    !noGuard &&
    (!canRead(state) || (allowed && !allowed.includes(state.session!.role)))
  )
    return (
      <SafeAreaView style={styles.loading}>
        <Empty
          title={state.session ? "Access is restricted" : "Sign in to continue"}
          body={
            state.session?.role === "Family"
              ? "Enable family consent in the patient profile first."
              : "This screen is available to the assigned care role."
          }
          icon="lock-closed-outline"
          action="Go to profile"
          onPress={() =>
            router.replace(state.session ? "/(tabs)/profile" : "/sign-in")
          }
        />
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.bg }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {title && (
          <View
            style={[
              styles.row,
              {
                padding: 20,
                width: "100%",
                maxWidth,
                alignSelf: "center",
              },
            ]}
          >
            {back && (
              <Touch
                label="Go back"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/(tabs)")
                }
                style={styles.iconButton}
              >
                <Icon name="arrow-back" color={theme.ink} />
              </Touch>
            )}
            <View style={{ flex: 1 }}>
              <Title>{title}</Title>
              {subtitle && <Body muted>{subtitle}</Body>}
            </View>
          </View>
        )}
        <View ref={viewport} collapsable={false} style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            onScroll={(event) => {
              offset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onLayout={scheduleReveal}
            onContentSizeChange={scheduleReveal}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 20,
              paddingTop: title ? 0 : 20,
              paddingBottom: 36,
              width: "100%",
              maxWidth,
              alignSelf: "center",
            }}
          >
            <FocusedFieldContext.Provider
              value={(field) => {
                focused.current = field;
                if (field) scheduleReveal();
              }}
            >
              <Entrance>{children}</Entrance>
            </FocusedFieldContext.Provider>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
      {!!toast && (
        <View accessibilityLiveRegion="polite" style={styles.toast}>
          <Icon name="information-circle-outline" color="white" />
          <Text style={{ color: "white", flex: 1, lineHeight: 20 }}>
            {toast}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
export function Confirm({
  visible,
  title,
  body,
  confirm,
  onConfirm,
  onClose,
  danger,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#142A3866",
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: "white",
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
          }}
        >
          <View
            style={{
              padding: 26,
              gap: 20,
              maxWidth: 760,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 4,
                backgroundColor: theme.border,
                alignSelf: "center",
              }}
            />
            <Title>{title}</Title>
            <Body>{body}</Body>
            <Button title={confirm} onPress={onConfirm} danger={danger} />
            <Button title="Keep as is" secondary onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    borderRadius: 22,
    padding: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: theme.border,
    gap: 14,
  },
  title: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  cardTitle: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  body: { fontSize: 14, color: theme.ink, lineHeight: 22 },
  label: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  button: {
    borderRadius: 15,
    minHeight: 52,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 13,
    minHeight: 44,
    justifyContent: "center",
  },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.green },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    color: theme.ink,
    fontSize: 16,
    minHeight: 52,
  },
  iconBox: {
    width: 48,
    height: 48,
    backgroundColor: theme.mint,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: theme.border,
  },
  hero: { padding: 24, gap: 14, borderRadius: 25, overflow: "hidden" },
  loading: {
    flex: 1,
    padding: 24,
    gap: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
  },
  toast: {
    position: "absolute",
    bottom: 25,
    left: 20,
    right: 20,
    maxWidth: 680,
    alignSelf: "center",
    borderRadius: 18,
    padding: 18,
    backgroundColor: theme.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  divider: { height: 1, backgroundColor: theme.border },
  stat: {
    flex: 1,
    padding: 17,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
});
