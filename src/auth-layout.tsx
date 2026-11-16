import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FocusedFieldContext, theme } from "./components";

/** Login uses a bounded native layout with an auto-revealing scrollable container; keyboard resize keeps all controls accessible. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const focused = useRef<TextInput | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
        const visibleBottom = Math.min(
          top + viewportHeight,
          keyboardTop.current ?? (top + viewportHeight),
        );
        const overlap = y + fieldHeight + 96 - visibleBottom;
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
      if (retry.current) clearTimeout(retry.current);
    };
  }, [scheduleReveal]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.bg }}
      edges={["top", "bottom", "left", "right"]}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -90,
          right: -90,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: "#E5F5EF80",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 10,
          left: -100,
          width: 230,
          height: 230,
          borderRadius: 115,
          backgroundColor: "#E8F0FF65",
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View ref={viewport} collapsable={false} style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            onScroll={(event) => {
              offset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onLayout={scheduleReveal}
            onContentSizeChange={scheduleReveal}
            contentContainerStyle={{
              flexGrow: 1,
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              paddingHorizontal: 20,
              paddingTop: keyboardOpen || height < 640 ? 12 : 18,
              paddingBottom: keyboardOpen ? 240 : Math.max(20, insets.bottom + 8),
              gap: 14,
              justifyContent: keyboardOpen || height < 640 ? "flex-start" : "center",
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <FocusedFieldContext.Provider
              value={(field) => {
                focused.current = field;
                if (field) scheduleReveal();
              }}
            >
              {children}
            </FocusedFieldContext.Provider>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
