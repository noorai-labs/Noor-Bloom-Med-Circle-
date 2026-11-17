import React, { useState } from "react";
import { Image, Platform, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useClinic } from "../store";
import { dayKey, formatDate, id, providers } from "../clinic";
import {
  Body,
  Button,
  Card,
  Chip,
  Chips,
  Confirm,
  Empty,
  Field,
  Icon,
  Label,
  Screen,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
export function RecordsScreen() {
  const { state, dispatch, notify, cloud } = useClinic();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("Lab report");
  async function addDocument() {
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset.size && asset.size > 15 * 1024 * 1024)
        return notify("Choose a file smaller than 15 MB.");
      let uri: string | undefined;
      let fileId: string | undefined;
      if (cloud) {
        const uploaded = await cloud.upload(asset);
        fileId = uploaded.fileId;
      } else if (Platform.OS !== "web") {
        const dir = new Directory(Paths.document, "bloom-records");
        dir.create({ idempotent: true, intermediates: true });
        const destination = new File(
          dir,
          id("file") + "-" + asset.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
        );
        new File(asset.uri).copy(destination);
        uri = destination.uri;
      }
      if (
        dispatch({
          type: "record",
          record: {
            name: asset.name,
            category,
            date: dayKey(),
            uri,
            mime: asset.mimeType,
            fileId,
            detail: cloud
              ? "Private cloud attachment. Available to authorized members of this care space."
              : uri
                ? "Stored on this device. Your demo care team can open the attachment."
                : "Browser preview contains metadata only. Use the native app to store and share files.",
          },
        })
      )
        notify(
          cloud
            ? "Document uploaded. Saving your cloud record…"
            : uri
              ? "Document saved on your device."
              : "Document metadata saved. Native app stores the attachment.",
        );
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "Could not save that file. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const hasRecords = state.records.length > 0;
  const records = state.records.filter(
    (r) =>
      (filter === "All" || r.category === filter) &&
      r.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Screen
      title="Your health folder"
      subtitle="A clearer picture of your care."
    >
      <Field
        label="Search records"
        value={search}
        onChange={setSearch}
        placeholder="Report or prescription name"
      />
      <Chips
        values={["All", "Lab report", "Prescription", "History", "Care plans"]}
        value={filter}
        onChange={setFilter}
      />
      {["All", "History"].includes(filter) && (
        <Card>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Icon name="pulse-outline" />
            </View>
            <Title small>Your health context</Title>
          </View>
          <Body>
            Conditions: {state.profile.conditions || "None entered"}
            {"\n"}Allergies: {state.profile.allergies || "None entered"}
            {"\n"}Medicines: {state.profile.medicines || "None entered"}
          </Body>
          <Body muted>{state.profile.notes}</Body>
        </Card>
      )}
      {filter !== "Care plans" &&
        records.map((r) => (
          <Touch
            key={r.id}
            onPress={() =>
              router.push({ pathname: "/record/[id]", params: { id: r.id } })
            }
          >
            <Card>
              <View style={styles.row}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor:
                        r.category === "Prescription"
                          ? theme.lilac
                          : theme.blue,
                    },
                  ]}
                >
                  <Icon name="document-text-outline" />
                </View>
                <View style={{ flex: 1 }}>
                  <Title small>{r.name}</Title>
                  <Body muted>
                    {r.category} · {formatDate(r.date)}
                  </Body>
                  <Text style={{ color: theme.green, fontSize: 11 }}>
                    {r.uri ? "Attachment saved" : "Sample record"}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} />
              </View>
            </Card>
          </Touch>
        ))}
      {["All", "Care plans", "Prescription"].includes(filter) &&
        state.consultations.map((n) => (
          <Card key={n.id}>
            <View style={styles.row}>
              <Icon name="clipboard-outline" />
              <Title small>Consultation care plan</Title>
            </View>
            <Body muted>
              {providers.find((p) => p.id === n.providerId)?.name ||
                "Care team"}
            </Body>
            <Body>{n.text}</Body>
            <Label>PRESCRIPTION / INSTRUCTIONS</Label>
            <Body>{n.prescription || "None entered"}</Body>
            {n.followUp && (
              <Chip title={"Follow-up · " + formatDate(n.followUp)} />
            )}
            {n.visitId && (
              <Button
                title="Open visit & follow-up"
                secondary
                onPress={() =>
                  router.push({
                    pathname: "/visit/[id]",
                    params: { id: n.visitId },
                  })
                }
              />
            )}
          </Card>
        ))}
      {!records.length && !["History", "Care plans"].includes(filter) && (
        <Empty
          title={
            hasRecords ? "No matching records found" : "No health records yet"
          }
          body={
            hasRecords
              ? "Try adjusting your search query or category filter to find what you need."
              : "Keep all your lab reports, prescriptions, and health summaries organized in one secure place."
          }
          icon="folder-open-outline"
        />
      )}
      {["Patient", "Admin"].includes(state.session?.role || "") && (
        <Card>
          <Title small>Add to your health story</Title>
          <Label>Document category</Label>
          <Chips
            values={["Lab report", "Prescription", "Other"]}
            value={category}
            onChange={setCategory}
          />
          <Button
            title="Choose a document"
            icon="cloud-upload-outline"
            loading={busy}
            onPress={addDocument}
          />
          <Body muted>
            PDF or image · Up to 15 MB · Stored locally on your phone. Use
            fictional files for this demo.
          </Body>
        </Card>
      )}
    </Screen>
  );
}
export function RecordScreen() {
  const { id: recordId } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch, notify, cloud } = useClinic();
  const record = state.records.find((r) => r.id === recordId);
  const [remove, setRemove] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [previewUri, setPreviewUri] = useState("");
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    try {
      const uri =
        record?.fileId && cloud
          ? await cloud.download(record.fileId)
          : record?.uri;
      if (!uri || Platform.OS === "web")
        return notify("Open this attachment in the native mobile app.");
      setPreviewUri(uri);
      if (!new File(uri).exists)
        return notify(
          "This attachment is no longer on the device. Add the file again.",
        );
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(uri, {
          mimeType: record?.mime,
          dialogTitle: "Open or share document",
        });
      else notify("File sharing is not available on this device.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not open this attachment.",
      );
    } finally {
      setOpening(false);
    }
  }
  if (!record)
    return (
      <Screen title="Health record" back>
        <Empty
          title="Record not found"
          body="This record may have been removed."
          icon="document-text-outline"
          action="Back to records"
          onPress={() => router.replace("/(tabs)/records")}
        />
      </Screen>
    );
  return (
    <Screen title="Health record" back>
      <Card>
        <View style={styles.iconBox}>
          <Icon name="document-text-outline" size={26} />
        </View>
        <Title>{record.name}</Title>
        <View style={styles.wrap}>
          <Chip title={record.category} />
          <Chip title={formatDate(record.date)} />
        </View>
        <Body>{record.detail}</Body>
        {(previewUri || record.uri) &&
          record.mime?.startsWith("image/") &&
          !unavailable && (
            <Image
              source={{ uri: previewUri || record.uri }}
              onError={() => setUnavailable(true)}
              resizeMode="contain"
              style={{
                width: "100%",
                height: 320,
                borderRadius: 16,
                backgroundColor: theme.bg,
              }}
            />
          )}
        {unavailable && <Body muted>The saved image could not be loaded.</Body>}
        {(record.uri || record.fileId) && (
          <Button
            title={opening ? "Opening attachment…" : "Open / share attachment"}
            disabled={opening}
            icon="share-outline"
            onPress={open}
          />
        )}
      </Card>
      {["Patient", "Admin"].includes(state.session?.role || "") && (
        <Button
          title="Remove this record"
          secondary
          onPress={() => setRemove(true)}
        />
      )}
      <Confirm
        visible={remove}
        title="Remove this record?"
        body={
          cloud
            ? "This removes the record and its cloud attachment for everyone in this care space. Your original selected document is unchanged."
            : "This removes the record and its local copy from this app. Your original selected document is unchanged."
        }
        confirm="Remove record"
        danger
        onClose={() => setRemove(false)}
        onConfirm={() => {
          if (dispatch({ type: "deleteRecord", recordId })) {
            try {
              if (record.uri && Platform.OS !== "web") {
                const file = new File(record.uri);
                if (file.exists) file.delete();
              }
            } catch {
              notify("Record removed; the local file could not be cleaned up.");
            }
            router.back();
          }
        }}
      />
    </Screen>
  );
}
export function MedicinesScreen() {
  const { state, dispatch } = useClinic();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [time, setTime] = useState("08:00");
  const [frequency, setFrequency] = useState("Once daily");
  const [duration, setDuration] = useState("As prescribed");
  const [archive, setArchive] = useState("");
  const meds = state.medicines.filter((m) => m.active),
    date = dayKey();
  const done = meds.filter((m) => !!m.logs[date]).length;
  const readonly = ["Doctor", "Nurse", "Admin"].includes(
    state.session?.role || "",
  );
  return (
    <Screen
      title="Small steps, better days"
      subtitle="Your medicine routine, made simpler."
      back
    >
      <Image
        source={require("../../assets/wellness-routine.png")}
        accessibilityLabel="A calm daily wellness routine with a medicine organizer and water"
        resizeMode="cover"
        style={{ width: "100%", height: 150, borderRadius: 22 }}
      />
      <Card style={{ backgroundColor: theme.mint }}>
        <View style={styles.row}>
          <Icon name="sunny-outline" />
          <Title small>{formatDate(date)}</Title>
        </View>
        <Title>
          {done} / {meds.length} doses updated
        </Title>
        <Body muted>
          Follow your clinician’s prescribed dosage and schedule.
        </Body>
      </Card>
      {meds.map((m) => (
        <Card key={m.id}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: theme.lilac }]}>
              <Icon name="medical-outline" color="#7960AD" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>{m.name}</Title>
              <Body muted>{m.dosage}</Body>
            </View>
            <Chip title={m.logs[date] || "Pending"} />
          </View>
          <Body>
            {m.time} · {m.frequency}
          </Body>
          <Body muted>{m.duration}</Body>
          {!readonly && (
            <>
              <View style={styles.wrap}>
                {["Taken", "Skipped", "Pending"].map((status) => (
                  <Chip
                    key={status}
                    title={status === "Pending" ? "Undo" : status}
                    active={m.logs[date] === status}
                    onPress={() =>
                      dispatch({
                        type: "dose",
                        medicineId: m.id,
                        status: status as "Taken" | "Skipped" | "Pending",
                      })
                    }
                  />
                ))}
                <Chip title="Archive" onPress={() => setArchive(m.id)} />
              </View>
            </>
          )}
          <View style={styles.row}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - 6 + i);
              const key = dayKey(d);
              return (
                <View
                  key={key}
                  style={{ flex: 1, alignItems: "center", gap: 7 }}
                >
                  <Text style={{ color: theme.muted, fontSize: 10 }}>
                    {d.toLocaleDateString("en-IN", { weekday: "narrow" })}
                  </Text>
                  <View
                    style={{
                      height: 18,
                      width: 18,
                      borderRadius: 9,
                      backgroundColor:
                        m.logs[key] === "Taken"
                          ? theme.green
                          : m.logs[key] === "Skipped"
                            ? "#EAB580"
                            : theme.border,
                    }}
                  />
                </View>
              );
            })}
          </View>
          <Body muted>Past 7 days · Green: taken · Amber: skipped</Body>
        </Card>
      ))}
      {!meds.length && (
        <Empty
          title="No medicine reminders yet"
          body="Track daily doses, stay on schedule, and keep your care team informed."
          icon="medical-outline"
          action={!readonly ? "Add a medicine reminder" : undefined}
          onPress={!readonly ? () => setShowForm(true) : undefined}
        />
      )}
      {!readonly && (
        <>
          <Button
            title={
              showForm ? "Close reminder form" : "Add a prescribed medicine"
            }
            icon="add"
            secondary
            onPress={() => setShowForm(!showForm)}
          />
          {showForm && (
            <Card>
              <Title small>A reminder, just for you</Title>
              <Field label="Medicine name" value={name} onChange={setName} />
              <Field
                label="Prescribed dosage"
                value={dosage}
                onChange={setDosage}
              />
              <Field
                label="Reminder time (HH:MM)"
                value={time}
                onChange={setTime}
              />
              <Field
                label="Frequency"
                value={frequency}
                onChange={setFrequency}
              />
              <Field label="Duration" value={duration} onChange={setDuration} />
              <Button
                title="Save medicine reminder"
                onPress={() => {
                  if (
                    dispatch({
                      type: "medicine",
                      medicine: { name, dosage, time, frequency, duration },
                    })
                  ) {
                    setShowForm(false);
                    setName("");
                    setDosage("");
                  }
                }}
              />
            </Card>
          )}
        </>
      )}
      <Body muted>
        Daily status is saved by date. Reminders appear in your in-app routine;
        background push notifications are not enabled.
      </Body>
      <Confirm
        visible={!!archive}
        title="Archive this reminder?"
        body="It will leave your active routine. Your recorded dose history stays in local storage."
        confirm="Archive reminder"
        onClose={() => setArchive("")}
        onConfirm={() => {
          dispatch({ type: "archiveMedicine", medicineId: archive });
          setArchive("");
        }}
      />
    </Screen>
  );
}
