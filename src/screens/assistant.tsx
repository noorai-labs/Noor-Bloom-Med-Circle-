import { cloudMode } from "../cloud-config";
import { providerFor } from "../provider-display";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useClinic } from "../store";
import { formatDate, visibleVisits } from "../clinic";
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Screen,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
export default function AssistantScreen() {
  if (cloudMode)
    return (
      <Screen title="Care navigation">
        <Card>
          <Title small>Open your care workspace</Title>
          <Body>
            Use your appointments, records and medicines directly. The assistant
            is not connected.
          </Body>
          <Button
            title="Open appointments"
            onPress={() => router.push("/(tabs)/appointments")}
          />
          <Button
            title="Open records"
            secondary
            onPress={() => router.push("/(tabs)/records")}
          />
        </Card>
      </Screen>
    );
  return <DemoAssistantScreen />;
}
function DemoAssistantScreen() {
  const { state } = useClinic();
  const [messages, setMessages] = useState([
    {
      mine: false,
      text: "Hi! I’m Bloom. I can help you find your care, records and daily routine. What would you like to do?",
    },
  ]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voice, setVoice] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function send(value: string) {
    if (!value.trim() || thinking) return;
    const t = value.toLowerCase();
    const next = visibleVisits(state).find(
      (v) => !["Completed", "Cancelled"].includes(v.status),
    );
    let reply =
      "I can help you navigate your care: appointments, reports, medicines and booking. I cannot diagnose symptoms or recommend treatment.";
    if (t.includes("appointment") || t.includes("visit"))
      reply = next
        ? "Your next care moment is with " +
          providerFor(next).name +
          " on " +
          formatDate(next.date) +
          " at " +
          next.time +
          ". It is " +
          next.status.toLowerCase() +
          "."
        : "Your care calendar is clear. Find a care professional to book your next visit.";
    else if (t.includes("report") || t.includes("record"))
      reply =
        "Your health folder has " +
        state.records.length +
        " documents and " +
        state.consultations.length +
        " care plans. Open Records to review them.";
    else if (t.includes("medicine") || t.includes("remind"))
      reply =
        "Open Medicines to track your prescribed routine and add a reminder. Follow your clinician’s prescription; I cannot recommend or change a dose.";
    else if (t.includes("book") || t.includes("doctor") || t.includes("nurse"))
      reply =
        "Find care lets you choose a doctor or nurse, view their profile, and book a time. Your care team can follow the visit through to completion.";
    else if (t.includes("diet"))
      reply =
        "Your clinician or a registered dietitian can help with a plan suited to your needs. This local assistant does not create medical diet plans.";
    setMessages((m) => [...m, { mine: true, text: value }]);
    setText("");
    setThinking(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m, { mine: false, text: reply }]);
      setThinking(false);
    }, 650);
  }
  return (
    <Screen
      title="A little help from Bloom"
      subtitle="Your companion for navigating care."
    >
      <Card style={{ backgroundColor: theme.blue }}>
        <View style={styles.row}>
          <Icon name="sparkles-outline" color="#557EB9" />
          <View style={{ flex: 1 }}>
            <Title small>Here for the everyday</Title>
            <Body muted>
              Local mock assistant. Not a substitute for a doctor.
            </Body>
          </View>
        </View>
      </Card>
      {messages.map((m, i) => (
        <View
          key={i}
          style={{
            backgroundColor: m.mine ? theme.green : "white",
            padding: 18,
            borderRadius: 22,
            borderBottomLeftRadius: m.mine ? 22 : 6,
            borderBottomRightRadius: m.mine ? 6 : 22,
            alignSelf: m.mine ? "flex-end" : "flex-start",
            maxWidth: "92%",
            borderWidth: m.mine ? 0 : 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 23,
              color: m.mine ? "white" : theme.ink,
            }}
          >
            {m.text}
          </Text>
        </View>
      ))}
      {thinking && <Body muted>Bloom is thinking…</Body>}
      <View style={styles.wrap}>
        {[
          "My next appointment",
          "Show my reports",
          "Medicine reminders",
          "Book a nurse",
        ].map((t) => (
          <Chip key={t} title={t} onPress={() => send(t)} />
        ))}
      </View>
      <Field
        label="Message Bloom"
        value={text}
        onChange={setText}
        placeholder="How can I help with your care?"
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            title="Send message"
            disabled={!text.trim() || thinking}
            icon="arrow-up"
            onPress={() => send(text)}
          />
        </View>
        <Touch
          label="Simulated voice assistant"
          onPress={() => setVoice(!voice)}
          style={[styles.iconButton, { height: 52, width: 52 }]}
        >
          <Icon name="mic-outline" />
        </Touch>
      </View>
      {voice && (
        <Card>
          <Title small>Try a voice command</Title>
          <Body muted>
            Simulated input · No microphone recording. Preferred language:{" "}
            {state.profile.language}.
          </Body>
          {[
            "Book a doctor",
            "Show my reports",
            "When is my next appointment?",
            "Remind me about my medicine",
          ].map((t) => (
            <Button
              key={t}
              title={t}
              secondary
              onPress={() => {
                send(t);
                setVoice(false);
              }}
            />
          ))}
        </Card>
      )}
      <Title small>Take the next step</Title>
      <View style={styles.wrap}>
        <Chip title="Find care →" onPress={() => router.push("/discover")} />
        <Chip
          title="Records →"
          onPress={() => router.push("/(tabs)/records")}
        />
        <Chip title="Medicines →" onPress={() => router.push("/medicines")} />
        <Chip
          title="Appointments →"
          onPress={() => router.push("/(tabs)/appointments")}
        />
      </View>
    </Screen>
  );
}
