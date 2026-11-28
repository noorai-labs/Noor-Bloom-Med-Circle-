import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
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
const RECORD_TYPES = [
  "Lab report",
  "Prescription",
  "Doctor note",
  "Discharge summary",
  "Other",
];

export function RecordsScreen() {
  const { upload } = useLocalSearchParams<{ upload?: string }>();
  const { state, dispatch, notify, cloud } = useClinic();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(upload === "1");
  const [category, setCategory] = useState("Lab report");
  const [docTitle, setDocTitle] = useState("");
  const [clinicianName, setClinicianName] = useState("");
  const [pickedAsset, setPickedAsset] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadError, setUploadError] = useState("");

  const canUpload =
    state.session?.role === "Patient" ||
    (!cloud && state.session?.role === "Admin");

  function closeUploadModal() {
    setShowUploadModal(false);
    setCategory("Lab report");
    setDocTitle("");
    setClinicianName("");
    setPickedAsset(null);
    setUploadError("");
  }

  async function pickFile() {
    setUploadError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset.size && asset.size > 15 * 1024 * 1024) {
        setUploadError("Choose a file smaller than 15 MB.");
        return;
      }
      setPickedAsset(asset);
      if (!docTitle.trim()) {
        setDocTitle(asset.name.replace(/\.[^.]+$/, ""));
      }
    } catch (e) {
      setUploadError(
        e instanceof Error
          ? e.message
          : "Could not open document picker. Please try again.",
      );
    }
  }

  async function saveDocument() {
    const finalTitle = docTitle.trim() || pickedAsset?.name || "";
    if (finalTitle.length < 2) {
      setUploadError("Enter a document title or choose a file to upload.");
      return;
    }
    if (!pickedAsset) {
      setUploadError("Choose a PDF or image file to attach.");
      return;
    }
    setBusy(true);
    setUploadError("");
    try {
      let uri: string | undefined;
      let fileId: string | undefined;
      if (cloud) {
        const uploaded = await cloud.upload(pickedAsset);
        fileId = uploaded.fileId;
      } else if (Platform.OS !== "web") {
        const dir = new Directory(Paths.document, "bloom-records");
        dir.create({ idempotent: true, intermediates: true });
        const destination = new File(
          dir,
          id("file") + "-" + pickedAsset.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
        );
        new File(pickedAsset.uri).copy(destination);
        uri = destination.uri;
      }
      const sourceNote = clinicianName.trim()
        ? `From ${clinicianName.trim()}. `
        : "";
      const storageNote = cloud
        ? "Private cloud attachment. Available to authorized members of this care space."
        : uri
          ? "Stored on this device."
          : "Only document metadata is saved. The attachment is not stored.";

      if (
        dispatch({
          type: "record",
          record: {
            name: finalTitle,
            category,
            date: dayKey(),
            uri,
            mime: pickedAsset.mimeType,
            fileId,
            detail: sourceNote + storageNote,
          },
        })
      ) {
        closeUploadModal();
        notify(
          cloud
            ? "Document uploaded. Saving your cloud record…"
            : uri
              ? "Document saved on your device."
              : "Document metadata saved. Native app stores the attachment.",
        );
      } else {
        setUploadError("Could not save record. Please check your details.");
      }
    } catch (e) {
      setUploadError(
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
      {canUpload && (
        <Card
          style={{
            backgroundColor: "#F2F9F5",
            borderColor: "#D2E9DC",
            padding: 14,
            gap: 8,
          }}
        >
          <Button
            title="Upload medical record"
            icon="cloud-upload-outline"
            onPress={() => {
              setUploadError("");
              setShowUploadModal(true);
            }}
            style={{ minHeight: 48 }}
          />
          <Body muted style={{ fontSize: 12, textAlign: "center" }}>
            Prescriptions, lab reports, doctor notes & summaries
          </Body>
        </Card>
      )}
      <Field
        label="Search records"
        value={search}
        onChange={setSearch}
        placeholder="Report or prescription name"
      />
      <View style={{ gap: 8 }}>
        {[
          [
            { label: "All", flex: 0.65 },
            { label: "Lab report", flex: 1 },
            { label: "Prescription", flex: 1.15 },
            { label: "History", flex: 0.85 },
          ],
          [
            { label: "Doctor note", flex: 1 },
            { label: "Discharge summary", flex: 1.45 },
            { label: "Care plans", flex: 1 },
          ],
        ].map((row, idx) => (
          <View key={idx} style={{ flexDirection: "row", gap: 8 }}>
            {row.map((item) => {
              const active = filter === item.label;
              return (
                <Touch
                  key={item.label}
                  label={item.label}
                  selected={active}
                  onPress={() => setFilter(item.label)}
                  style={{
                    flex: item.flex,
                    paddingVertical: 9,
                    paddingHorizontal: 6,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? theme.green : "white",
                    borderWidth: 1,
                    borderColor: active ? theme.green : theme.border,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: active ? "white" : theme.ink,
                      textAlign: "center",
                    }}
                  >
                    {item.label}
                  </Text>
                </Touch>
              );
            })}
          </View>
        ))}
      </View>
      {["All", "History"].includes(filter) && (cloud && !cloud.recordsAccessible ? (
        <Body muted>Health records are not shared with you.</Body>
      ) : (
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
      ))}
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
                    {r.uri || r.fileId ? "Attachment saved" : "Sample record"}
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
            {!!n.followUp && (
              <Chip title={"Follow-up · " + formatDate(n.followUp)} />
            )}
            {!!n.visitId && (
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
      {cloud && !cloud.recordsAccessible && ["Lab report", "Prescription"].includes(filter) ? (
        <Body muted>Health records are not shared with you.</Body>
      ) : (
        !records.length &&
        !["History", "Care plans"].includes(filter) && (
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
        )
      )}
      {canUpload && (
        <Modal
          visible={showUploadModal}
          transparent
          animationType="fade"
          onRequestClose={closeUploadModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(10, 24, 20, 0.45)",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Card
                style={{
                  maxHeight: "88%",
                  borderRadius: 24,
                  padding: 22,
                  gap: 12,
                }}
              >
                <View
                  style={[
                    styles.row,
                    { justifyContent: "space-between", marginBottom: 4 },
                  ]}
                >
                  <Title small>Upload medical record</Title>
                  <Touch
                    label="Close upload form"
                    onPress={closeUploadModal}
                    style={{ padding: 4 }}
                  >
                    <Icon name="close" size={20} color={theme.muted} />
                  </Touch>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={{ gap: 10 }}>
                    <View style={{ gap: 8 }}>
                      <Label>RECORD TYPE</Label>
                      {[
                        RECORD_TYPES.slice(0, 3),
                        RECORD_TYPES.slice(3),
                      ].map((row) => (
                        <View key={row[0]} style={{ flexDirection: "row", gap: 8 }}>
                          {row.map((item) => {
                            const active = category === item;
                            return (
                              <Touch
                                key={item}
                                label={item}
                                selected={active}
                                onPress={() => setCategory(item)}
                                style={{
                                  flex: 1,
                                  paddingVertical: 10,
                                  paddingHorizontal: 8,
                                  borderRadius: 14,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: active ? theme.green : "white",
                                  borderWidth: 1,
                                  borderColor: active ? theme.green : theme.border,
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "600",
                                    color: active ? "white" : theme.ink,
                                    textAlign: "center",
                                  }}
                                >
                                  {item}
                                </Text>
                              </Touch>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                    <Field
                      label="Document title"
                      value={docTitle}
                      onChange={setDocTitle}
                      placeholder="e.g. Complete Blood Count (CBC)"
                    />
                    <Field
                      label="Doctor or clinic name (optional)"
                      value={clinicianName}
                      onChange={setClinicianName}
                      placeholder="e.g. Dr. Aisha Khan · MedBloom Clinic"
                    />
                    <Button
                      title={
                        pickedAsset
                          ? `Selected: ${pickedAsset.name}`
                          : "Choose file (PDF or image)"
                      }
                      icon="document-attach-outline"
                      secondary
                      disabled={busy}
                      onPress={() => void pickFile()}
                    />
                    {!!uploadError && (
                      <View
                        style={{
                          backgroundColor: "#FEF2F2",
                          borderColor: "#FECACA",
                          borderWidth: 1,
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: "#DC2626",
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {uploadError}
                        </Text>
                      </View>
                    )}
                    <View style={{ marginTop: 6, gap: 8 }}>
                      <Button
                        title="Save medical record"
                        loading={busy}
                        disabled={busy}
                        onPress={() => void saveDocument()}
                      />
                      <Button
                        title="Cancel"
                        secondary
                        disabled={busy}
                        onPress={closeUploadModal}
                      />
                    </View>
                  </View>
                </ScrollView>
              </Card>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
          <Chip
            title={
              state.profile.consent
                ? "Family access enabled"
                : "Family access disabled"
            }
          />
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
      {state.session?.role === "Patient" && (
        <Card>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
              <Icon name="shield-checkmark-outline" color={theme.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Family access</Title>
              <Body muted>
                Clinician record access is controlled separately by sharing permissions in Records.
              </Body>
              <Body muted>
                {state.profile.consent
                  ? "Family access is enabled. Shared records also require separate record-sharing permission."
                  : "Family access is disabled. Clinician record-sharing permissions are unchanged."}
              </Body>
            </View>
            <Switch
              accessibilityLabel="Family access consent"
              value={state.profile.consent}
              trackColor={{ false: "#D9E2E5", true: theme.green }}
              onValueChange={(consent) => {
                const ok = dispatch({
                  type: "profile",
                  profile: { ...state.profile, consent },
                });
                if (!ok) return;
                notify(
                  consent
                    ? "Family access enabled."
                    : "Family access disabled.",
                );
              }}
            />
          </View>
        </Card>
      )}
      {(state.session?.role === "Patient" || (!cloud && state.session?.role === "Admin")) && (
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
  const [formError, setFormError] = useState("");
  const [archive, setArchive] = useState("");
  const meds = state.medicines.filter((m) => m.active),
    date = dayKey();
  const done = meds.filter((m) => !!m.logs[date]).length;
  const readonly = ["Doctor", "Nurse", "Admin"].includes(
    state.session?.role || "",
  );

  function closeForm() {
    setShowForm(false);
    setName("");
    setDosage("");
    setTime("08:00");
    setFrequency("Once daily");
    setDuration("As prescribed");
    setFormError("");
  }

  function handleSaveMedicine() {
    if (name.trim().length < 2) {
      setFormError("Enter the prescribed medicine name.");
      return;
    }
    if (!dosage.trim()) {
      setFormError("Enter the prescribed dosage (e.g. 500mg after meals).");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      setFormError("Enter a valid 24-hour time in HH:MM format (e.g. 08:00).");
      return;
    }
    if (!duration.trim()) {
      setFormError("Enter the duration (e.g. 7 days or As prescribed).");
      return;
    }
    setFormError("");
    if (
      dispatch({
        type: "medicine",
        medicine: {
          name: name.trim(),
          dosage: dosage.trim(),
          time: time.trim(),
          frequency,
          duration: duration.trim(),
        },
      })
    ) {
      closeForm();
    } else {
      setFormError("Could not save reminder. Please check your details.");
    }
  }

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
      <Card style={{ backgroundColor: theme.mint, gap: 10 }}>
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
        {!readonly && (
          <Button
            title="+ Add a prescribed medicine"
            icon="add-circle-outline"
            onPress={() => {
              setFormError("");
              setShowForm(true);
            }}
          />
        )}
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
        <Modal
          visible={showForm}
          transparent
          animationType="fade"
          onRequestClose={closeForm}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(10, 24, 20, 0.45)",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Card
                style={{
                  maxHeight: "88%",
                  borderRadius: 24,
                  padding: 22,
                  gap: 12,
                }}
              >
                <View
                  style={[
                    styles.row,
                    { justifyContent: "space-between", marginBottom: 4 },
                  ]}
                >
                  <Title small>Add a prescribed medicine</Title>
                  <Touch
                    label="Close form"
                    onPress={closeForm}
                    style={{ padding: 4 }}
                  >
                    <Icon name="close" size={20} color={theme.muted} />
                  </Touch>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={{ gap: 10 }}>
                    <Field
                      label="Medicine name"
                      value={name}
                      onChange={setName}
                      placeholder="e.g. Metformin"
                    />
                    <Field
                      label="Prescribed dosage"
                      value={dosage}
                      onChange={setDosage}
                      placeholder="e.g. 500mg after meals"
                    />
                    <View style={{ gap: 8 }}>
                      <Label>FREQUENCY</Label>
                      {[
                        ["Once daily", "Twice daily"],
                        ["Three times daily", "As needed"],
                      ].map((row) => (
                        <View key={row[0]} style={{ flexDirection: "row", gap: 8 }}>
                          {row.map((item) => {
                            const active = frequency === item;
                            return (
                              <Touch
                                key={item}
                                label={item}
                                selected={active}
                                onPress={() => setFrequency(item)}
                                style={{
                                  flex: 1,
                                  paddingVertical: 11,
                                  paddingHorizontal: 10,
                                  borderRadius: 14,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: active ? theme.green : "white",
                                  borderWidth: 1,
                                  borderColor: active ? theme.green : theme.border,
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    fontSize: 13,
                                    fontWeight: "600",
                                    color: active ? "white" : theme.ink,
                                    textAlign: "center",
                                  }}
                                >
                                  {item}
                                </Text>
                              </Touch>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                    <Field
                      label="Scheduled time (HH:MM)"
                      value={time}
                      onChange={setTime}
                      placeholder="08:00"
                    />
                    <Field
                      label="Duration"
                      value={duration}
                      onChange={setDuration}
                      placeholder="e.g. 14 days or As prescribed"
                    />
                    {!!formError && (
                      <View
                        style={{
                          backgroundColor: "#FEF2F2",
                          borderColor: "#FECACA",
                          borderWidth: 1,
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: "#DC2626",
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {formError}
                        </Text>
                      </View>
                    )}
                    <View style={{ marginTop: 6, gap: 8 }}>
                      <Button
                        title="Save medicine reminder"
                        onPress={handleSaveMedicine}
                      />
                      <Button
                        title="Cancel"
                        secondary
                        onPress={closeForm}
                      />
                    </View>
                  </View>
                </ScrollView>
              </Card>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
