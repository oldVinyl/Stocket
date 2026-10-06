import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

/** Drag the handle to expand, settle, or dismiss; form scrolling stays independent. */
export default function BottomSheet({
  visible,
  onClose,
  children,
  backgroundColor,
  handleColor,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor: string;
  handleColor: string;
}) {
  const { height } = useWindowDimensions();
  const sheetHeight = height * 0.92;
  const resting = sheetHeight * 0.2;
  const y = useRef(new Animated.Value(resting)).current;
  const position = useRef(resting),
    start = useRef(resting);
  const close = useRef(onClose);
  close.current = onClose;
  const settle = (value: number) => {
    position.current = value;
    Animated.spring(y, {
      toValue: value,
      useNativeDriver: false,
      damping: 25,
      stiffness: 240,
      mass: 1,
    }).start();
  };
  const dismiss = () =>
    Animated.timing(y, {
      toValue: sheetHeight,
      duration: 180,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) close.current();
    });
  useEffect(() => {
    if (visible) {
      y.setValue(sheetHeight);
      settle(resting);
    }
    const keyboard = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        if (visible) settle(0);
      },
    );
    return () => keyboard.remove();
  }, [visible, sheetHeight]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () =>
          y.stopAnimation((value) => {
            start.current = value;
          }),
        onPanResponderMove: (_, gesture) =>
          y.setValue(Math.max(0, start.current + gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          const next = start.current + gesture.dy;
          if (next > sheetHeight * 0.55 || gesture.vy > 1.5) dismiss();
          else settle(next < resting / 2 ? 0 : resting);
        },
        onPanResponderTerminate: () => settle(position.current),
      }),
    [sheetHeight],
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss bottom sheet"
          onPress={dismiss}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ height: sheetHeight, justifyContent: "flex-end" }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor,
                maxHeight: "100%",
                height: y.interpolate({
                  inputRange: [0, sheetHeight],
                  outputRange: [sheetHeight, 0],
                  extrapolate: "clamp",
                }),
              },
            ]}
            accessibilityViewIsModal
          >
            <View
              {...pan.panHandlers}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Bottom sheet: drag to expand or dismiss"
              accessibilityActions={[
                { name: "increment", label: "Expand" },
                { name: "decrement", label: "Collapse" },
              ]}
              onAccessibilityAction={(event) =>
                settle(
                  event.nativeEvent.actionName === "increment" ? 0 : resting,
                )
              }
              style={styles.grabber}
            >
              <View style={[styles.handle, { backgroundColor: handleColor }]} />
            </View>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#081F5C80",
  },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  grabber: { height: 36, alignItems: "center", justifyContent: "center" },
  handle: { width: 44, height: 5, borderRadius: 4 },
});
