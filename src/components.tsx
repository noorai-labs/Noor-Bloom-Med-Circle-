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
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { canRead, providers, Role } from "./clinic";
import { useClinic } from "./store";
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
    <Ionicons
      name={name}
      size={size}
      color={typeof color === "number" ? theme.green : color || theme.green}
    />
  );
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
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
export const FocusedFieldContext = createContext<
  (field: React.ComponentRef<typeof TextInput> | null) => void
>(
  () => {},
);
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
  containerStyle,
  label,
  disabled,
  selected,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
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
  const flat = StyleSheet.flatten(style);
  const layoutStyle = flat
    ? {
        flex: flat.flex,
        flexGrow: flat.flexGrow,
        flexShrink: flat.flexShrink,
        width: flat.width,
        maxWidth: flat.maxWidth,
        minWidth: flat.minWidth,
        alignSelf: flat.alignSelf,
      }
    : undefined;
  const pressableStyle = flat
    ? (() => {
        const {
          flex: _flex,
          flexGrow: _flexGrow,
          flexShrink: _flexShrink,
          width: _width,
          maxWidth: _maxWidth,
          minWidth: _minWidth,
          alignSelf: _alignSelf,
          ...rest
        } = flat;
        return [
          rest,
          flat.width !== undefined || flat.flex !== undefined
            ? { width: "100%" as const }
            : undefined,
        ];
      })()
    : style;
  return (
    <Animated.View
      style={[
        layoutStyle,
        containerStyle,
        { transform: [{ scale }], opacity: disabled ? 0.45 : 1 },
      ]}
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
        style={pressableStyle}
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
export function SlideDownFade({
  children,
  duration = 450,
  distance = 18,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  duration?: number;
  distance?: number;
  delay?: number;
  style?: ViewStyle | ViewStyle[];
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
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [delay, duration, reduced, value]);
  return (
    <Animated.View
      style={[
        {
          opacity: value,
          transform: [
            {
              translateY: value.interpolate({
                inputRange: [0, 1],
                outputRange: [-distance, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
}: {
  width?: number | `${number}%` | "auto";
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [pulse] = useState(() => new Animated.Value(0.35));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0.5);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.75,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, reduced]);
  return (
    <Animated.View
      accessibilityElementsHidden={true}
      importantForAccessibility="no"
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: "#DCE5E8",
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.row}>
        <Skeleton width={52} height={52} borderRadius={18} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <View style={styles.divider} />
      <View style={{ gap: 8 }}>
        <Skeleton width="85%" height={14} />
        {lines > 1 && <Skeleton width="55%" height={14} />}
      </View>
    </Card>
  );
}

export function SkeletonList({
  count = 3,
  lines = 2,
}: {
  count?: number;
  lines?: number;
}) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </View>
  );
}

export function ErrorBanner({
  title,
  message,
  onRetry,
  retryLabel = "Retry",
  onDismiss,
  style,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SlideDownFade duration={320} distance={10}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          {
            backgroundColor: "#FDF2F3",
            borderColor: "#F7C3C8",
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 10,
          },
          style,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#FDE0E3",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            <Icon name="alert-circle" color={theme.red} size={18} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            {title && (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: "#9C2636",
                  lineHeight: 18,
                }}
              >
                {title}
              </Text>
            )}
            <Text
              style={{
                fontSize: 13,
                color: "#7D1D2B",
                lineHeight: 19,
                flexShrink: 1,
              }}
            >
              {message}
            </Text>
          </View>
          {onDismiss && (
            <Touch
              label="Dismiss alert"
              onPress={onDismiss}
              style={{ padding: 4 }}
            >
              <Icon name="close" size={16} color="#9C2636" />
            </Touch>
          )}
        </View>
        {onRetry && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Touch
              label={retryLabel}
              onPress={onRetry}
              style={{
                backgroundColor: theme.red,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                alignSelf: "flex-start",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="refresh" size={14} color="white" />
                <Text
                  style={{
                    color: "white",
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {retryLabel}
                </Text>
              </View>
            </Touch>
          </View>
        )}
      </View>
    </SlideDownFade>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  secondaryAction,
  onSecondaryPress,
  icon = "cloud-offline-outline",
  style,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: string;
  onSecondaryPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SlideDownFade duration={360} distance={14}>
      <Card
        style={[
          {
            alignItems: "center",
            paddingVertical: 36,
            paddingHorizontal: 24,
            gap: 16,
            borderColor: "#F7C3C8",
            backgroundColor: "#FFFBFB",
          },
          style,
        ]}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#FDE0E3",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#F7C3C8",
            marginBottom: 2,
          }}
        >
          <Icon name={icon} size={30} color={theme.red} />
        </View>
        <View style={{ gap: 6, alignItems: "center", width: "100%" }}>
          <Text
            style={[
              styles.cardTitle,
              {
                textAlign: "center",
                color: "#9C2636",
                fontSize: 19,
                lineHeight: 26,
                flexShrink: 1,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.body,
              {
                color: "#7D1D2B",
                textAlign: "center",
                lineHeight: 22,
                maxWidth: 400,
                flexShrink: 1,
              },
            ]}
          >
            {message}
          </Text>
        </View>
        {(onRetry || secondaryAction) && (
          <View
            style={{
              width: "100%",
              maxWidth: 280,
              gap: 10,
              marginTop: 4,
            }}
          >
            {onRetry && (
              <Button
                title={retryLabel}
                icon="refresh"
                danger
                onPress={onRetry}
              />
            )}
            {secondaryAction && onSecondaryPress && (
              <Button
                title={secondaryAction}
                secondary
                onPress={onSecondaryPress}
              />
            )}
          </View>
        )}
      </Card>
    </SlideDownFade>
  );
}

export function Button({
  title,
  onPress,
  secondary,
  outline,
  danger,
  disabled,
  icon,
  loading,
  loadingTitle,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  outline?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
  loading?: boolean;
  loadingTitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const displayTitle = loading ? loadingTitle || title : title;
  return (
    <Touch
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: outline
            ? "#FFFFFF"
            : secondary
              ? theme.mint
              : danger
                ? theme.red
                : theme.green,
          borderWidth: outline ? 1.5 : 0,
          borderColor: outline ? theme.border : "transparent",
        },
        style,
      ]}
      label={displayTitle}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
          width: "100%",
        }}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={outline ? theme.ink : secondary ? theme.green : "white"}
          />
        ) : (
          icon && (
            <Icon
              name={icon}
              color={outline ? theme.ink : secondary ? theme.green : "white"}
              size={18}
            />
          )
        )}
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: outline ? theme.ink : secondary ? theme.green : "white",
            textAlign: "center",
            flexShrink: 1,
          }}
        >
          {displayTitle}
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
  style?: StyleProp<ViewStyle>;
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
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.body, muted && { color: theme.muted }, style]}>
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
  icon,
  style,
}: {
  title: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = !onPress
    ? title === "Cancelled"
      ? "#FDEDF0"
      : title === "In Progress"
        ? "#FFF3DB"
        : theme.mint
    : active
      ? theme.green
      : "white";
  const border = active ? theme.green : theme.border;
  const textColor = !onPress
    ? title === "Cancelled"
      ? theme.red
      : title === "In Progress"
        ? "#A16207"
        : theme.green
    : active
      ? "white"
      : theme.ink;

  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flexShrink: 1,
      }}
    >
      {icon && <Icon name={icon} size={14} color={textColor} />}
      <Text style={[styles.chipText, { color: textColor, flexShrink: 1 }]}>
        {title}
      </Text>
    </View>
  );

  if (!onPress)
    return (
      <View
        style={[
          styles.chip,
          {
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: "transparent",
          },
          style,
        ]}
      >
        {content}
      </View>
    );
  return (
    <Touch
      selected={active}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        },
        style,
      ]}
    >
      {content}
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
        aria-invalid={!!error}
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
            backgroundColor: error ? "#FFF9FA" : "white",
          },
          multiline && { minHeight: 100, textAlignVertical: "top" },
          inputProps?.style,
        ]}
      />
      {!!error && (
        <SlideDownFade duration={250} distance={6}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <Icon name="alert-circle" size={14} color={theme.red} />
            <Text
              style={{
                color: theme.red,
                fontSize: 12,
                lineHeight: 18,
                fontWeight: "600",
                flexShrink: 1,
              }}
            >
              {error}
            </Text>
          </View>
        </SlideDownFade>
      )}
    </View>
  );
}
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  autoFocus = false,
  editable = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  error?: string;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const reveal = useContext(FocusedFieldContext);

  const digits = Array.from({ length }, (_, i) => value[i] || "");

  function handleChange(text: string) {
    if (!editable) return;
    const cleaned = text.replace(/\D/g, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) {
      onComplete?.(cleaned);
    }
  }

  return (
    <View style={{ gap: 8, width: "100%" }}>
      <Touch
        disabled={!editable}
        label="Enter 6-digit verification code"
        onPress={() => inputRef.current?.focus()}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
          paddingVertical: 4,
        }}
      >
        {digits.map((digit, idx) => {
          const isCurrent =
            focus && idx === Math.min(value.length, length - 1);
          const isFilled = digit.length > 0;
          return (
            <View
              key={idx}
              style={{
                flex: 1,
                maxWidth: 48,
                minHeight: 52,
                paddingVertical: 4,
                borderRadius: 14,
                borderWidth: isCurrent || (error && !isFilled) ? 2 : 1.5,
                borderColor: error
                  ? theme.red
                  : isCurrent
                    ? theme.green
                    : isFilled
                      ? "#1E6B52"
                      : "#DDE7E2",
                backgroundColor: error
                  ? "#FFF9FA"
                  : isCurrent
                    ? "#F3F9F6"
                    : isFilled
                      ? "#F9FCFB"
                      : "white",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: isFilled ? theme.ink : "#BAC7C1",
                }}
              >
                {digit || (isCurrent ? "·" : "—")}
              </Text>
            </View>
          );
        })}
      </Touch>

      {/* Hidden real input for accessibility, keyboard input, copy/paste, and auto-focus */}
      <TextInput
        editable={editable}
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={32}
        autoFocus={autoFocus}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        accessibilityLabel="6-digit verification code"
        onFocus={() => {
          setFocus(true);
          reveal(inputRef.current);
        }}
        onBlur={() => {
          setFocus(false);
          reveal(null);
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.01,
          color: "transparent",
        }}
        caretHidden
      />

      {!!error && (
        <SlideDownFade duration={250} distance={6}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <Icon name="alert-circle" size={14} color={theme.red} />
            <Text
              style={{
                color: theme.red,
                fontSize: 12,
                lineHeight: 18,
                fontWeight: "600",
                flexShrink: 1,
              }}
            >
              {error}
            </Text>
          </View>
        </SlideDownFade>
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
        {p?.initials || "AS"}
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
  secondaryAction,
  onSecondaryPress,
  style,
}: {
  title: string;
  body: string;
  icon?: IconName;
  action?: string;
  onPress?: () => void;
  secondaryAction?: string;
  onSecondaryPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [iconValue] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      iconValue.setValue(1);
      return;
    }
    iconValue.setValue(0);
    const animation = Animated.timing(iconValue, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [iconValue, reduced]);

  return (
    <SlideDownFade duration={380} distance={12}>
      <Card
        style={[
          {
            alignItems: "center",
            paddingVertical: 36,
            paddingHorizontal: 24,
            gap: 16,
          },
          style,
        ]}
      >
        <Animated.View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: theme.mint,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "#D3EBE2",
            marginBottom: 2,
            opacity: iconValue,
            transform: [
              {
                translateY: iconValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
              {
                scale: iconValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          }}
        >
          <Icon name={icon} size={30} color={theme.green} />
        </Animated.View>
        <View style={{ gap: 6, alignItems: "center", width: "100%" }}>
          <Text
            style={[
              styles.cardTitle,
              {
                textAlign: "center",
                fontSize: 18,
                lineHeight: 25,
                flexShrink: 1,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.body,
              {
                color: theme.muted,
                textAlign: "center",
                lineHeight: 22,
                maxWidth: 380,
                flexShrink: 1,
              },
            ]}
          >
            {body}
          </Text>
        </View>
        {(action || secondaryAction) && (
          <View
            style={{
              width: "100%",
              maxWidth: 280,
              gap: 10,
              marginTop: 4,
            }}
          >
            {action && onPress && <Button title={action} onPress={onPress} />}
            {secondaryAction && onSecondaryPress && (
              <Button
                title={secondaryAction}
                secondary
                onPress={onSecondaryPress}
              />
            )}
          </View>
        )}
      </Card>
    </SlideDownFade>
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
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef<React.ComponentRef<typeof View>>(null);
  const focused = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const retries = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const clearRetries = useCallback(() => {
    retries.current.forEach(clearTimeout);
    retries.current = [];
  }, []);
  const revealFocused = useCallback(() => {
    const field = focused.current;
    const scroller = scroll.current;
    if (!field || !scroller) return;
    if (Platform.OS === "web") {
      try {
        (field as unknown as { scrollIntoView?: (opt: object) => void })?.scrollIntoView?.({
          behavior: "smooth",
          block: "center",
        });
      } catch {}
      return;
    }
    viewport.current?.measureInWindow((_x, top, _width, viewportHeight) => {
      field.measureInWindow((_fieldX, y, _fieldWidth, fieldHeight) => {
        // Leave generous clearance for the submit button and action rows below the input
        const visibleBottom = Math.min(
          top + viewportHeight,
          keyboardTop.current ?? top + viewportHeight,
        );
        const overlap = y + fieldHeight + 175 - visibleBottom;
        if (y < top + 16) {
          scroller.scrollTo({
            y: Math.max(0, offset.current + y - top - 16),
            animated: true,
          });
        } else if (overlap > 0) {
          const maxScrollUp = Math.max(0, y - (top + 16));
          const scrollDelta = Math.min(overlap + 24, maxScrollUp);
          scroller.scrollTo({
            y: Math.max(0, offset.current + scrollDelta),
            animated: true,
          });
        }
      });
    });
  }, []);
  const scheduleReveal = useCallback(() => {
    clearRetries();
    retries.current.push(setTimeout(revealFocused, 50));
    retries.current.push(setTimeout(revealFocused, 180));
    retries.current.push(setTimeout(revealFocused, 350));
  }, [clearRetries, revealFocused]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardOpen(true);
      scheduleReveal();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
      clearRetries();
    };
  }, [clearRetries, scheduleReveal]);
  if (!ready) return null;
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
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
              paddingBottom: keyboardOpen ? 320 : Math.max(36, insets.bottom + 24),
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
          alignItems: "center",
          backgroundColor: "#142A3866",
        }}
      >
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: "white",
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            width: "100%",
            maxWidth: 600,
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
  label: { color: theme.muted, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  button: {
    borderRadius: 16,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.green, lineHeight: 18 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.ink,
    fontSize: 16,
    lineHeight: 22,
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
    minWidth: 130,
    padding: 17,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
});
