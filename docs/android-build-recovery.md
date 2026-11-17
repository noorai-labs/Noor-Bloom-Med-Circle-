# Android release build recovery — v1.0.7 (8)

Build 6fd639b7-d08f-46f3-84f6-a06e2b86bb43 failed at :app:minifyReleaseWithR8. Its only reported missing class was livekit.org.jni_zero.JniZeroJni, referenced by JniZero.setJniClassLoader in io.github.webrtc-sdk:android-prefixed:150.7871.04.

Inspection of the official Maven AAR's libs/shadow-all.jar confirmed the bridge is absent. Bytecode search found setJniClassLoader references only in JniZero and its Natives interface, and none in the installed LiveKit React Native Java/Kotlin integration. This is an unused custom class-loader bridge in the current integration. The app config adds one exact -dontwarn rule through expo-build-properties. Existing consumer keep rules, release shrinking and every other missing-class check remain enabled. No Java stub or handwritten generated Android directory is introduced.

This rule addresses the observed packaging blocker; it does not implement a missing JNI bridge if a future dependency starts calling that path. Recheck when upgrading WebRTC, and validate real two-device calls in the installed release.

The build's separate expo-doctor warning listed SDK 58 patch mismatches. Dependencies were aligned using expo install --fix before resubmission. Local checks and replacement build status are reported in the chat; the remote Gradle result is the authoritative release packaging check.

Local verification: Expo Doctor 20/20 passed; lint, TypeScript and clinic/auth/reminder tests passed. Official expo-build-properties purge/append transform checked for the exact rule, preservation of unrelated rules and repeatability. Expo introspection validates configuration but omits dangerous filesystem mods; the direct transform check covers rule generation. Remote Gradle build remains the final packaging validation.
