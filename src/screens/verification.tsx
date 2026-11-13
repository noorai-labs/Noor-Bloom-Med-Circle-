import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { useClinic } from "../store";
import {
  Body,
  Button,
  Card,
  Chips,
  Confirm,
  Field,
  Screen,
  Title,
} from "../components";
import type {
  VerificationApplication,
  VerificationDetails,
  VerificationKind,
  VerificationSnapshot,
  VerificationStatus,
} from "../verification-types";
import { verificationDay } from "../verification-types";
const empty: VerificationDetails = {
  fullName: "",
  country: "India",
  authority: "",
  registrationNumber: "",
  qualification: "",
  consent: false,
};
function failure(e: unknown) {
  return e instanceof Error ? e.message : "Unable to complete this request.";
}
function useEvidence() {
  const { cloud } = useClinic();
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmation = (
    <Confirm
      visible={!!opening}
      title="Open verification evidence?"
      body="This uses your phone's document sharing menu. Only open evidence needed for this review; copies outside the app cannot be recalled."
      confirm="Open document"
      onClose={() => setOpening(null)}
      onConfirm={() => {
        const doc = opening;
        setOpening(null);
        if (!doc || !cloud) return;
        setBusy(true);
        setError("");
        void (async () => {
          const uri = await cloud.verification.download(doc.id);
          if (!(await Sharing.isAvailableAsync()))
            throw new Error("Document viewing is unavailable on this device.");
          await Sharing.shareAsync(uri, { dialogTitle: doc.name });
        })()
          .catch((e) => setError(failure(e)))
          .finally(() => setBusy(false));
      }}
    />
  );
  return { setOpening, error, busy, confirmation };
}
export function VerificationScreen() {
  const { cloud, state } = useClinic();
  const client = useRef(cloud?.verification);
  useEffect(() => {
    client.current = cloud?.verification;
  }, [cloud]);
  const [snapshot, setSnapshot] = useState<VerificationSnapshot | null>(null);
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<VerificationKind>(
    params.kind === "Doctor"
      ? "Doctor"
      : params.kind === "Nurse"
        ? "Nurse"
        : "Patient",
  );
  const [details, setDetails] = useState<VerificationDetails>(empty);
  const [documents, setDocuments] = useState<
    { id: string; name: string; mime: string }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState<
    { revision: number; action: string; reason: string; created_at: string }[]
  >([]);
  const evidence = useEvidence();
  const load = useCallback(async () => {
    if (!client.current) return;
    setError("");
    try {
      setSnapshot(await client.current.request<VerificationSnapshot>(""));
    } catch (e) {
      setError(failure(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const application = snapshot?.applications.find((a) => a.kind === kind);
  const editable =
    !!snapshot &&
    (!application ||
      ["Rejected", "Needs information"].includes(application.status));
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  function choose(value: string) {
    setKind(value as VerificationKind);
    setDetails({ ...empty, fullName: state.profile.name || "" });
    setDocuments([]);
    setHistory([]);
    setMessage("");
    setError("");
  }
  async function attach() {
    if (!cloud) return;
    if (!details.consent)
      throw new Error(
        "Give consent to upload and manual review before attaching evidence.",
      );
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 5 * 1024 * 1024)
      throw new Error("Choose a document no larger than 5 MB.");
    const doc = await cloud.verification.upload(asset);
    setDocuments((old) => [...old, doc]);
  }
  return (
    <Screen
      title="Verification"
      subtitle="Reviewed by people. Recorded securely."
      back
      noGuard
    >
      {!cloud ? (
        <Card>
          <Body>
            Sign in to your cloud account to submit verification. Local demo
            accounts cannot be verified.
          </Body>
        </Card>
      ) : (
        <>
          <Card>
            <Title small>Your verification applications</Title>
            <Body muted>
              Identity review is separate from Google or email sign-in.
              Professional approval also requires checking registration and
              qualifications.
            </Body>
            <Chips
              values={["Patient", "Doctor", "Nurse"]}
              value={kind}
              onChange={choose}
            />
            <Button
              title="Refresh verification status"
              secondary
              disabled={busy}
              onPress={() => void act(load)}
            />
            {snapshot?.reviewer && (
              <Button
                title="Open staff review queue"
                onPress={() => router.push("/verification-review")}
              />
            )}
          </Card>
          {application && (
            <Card>
              <Title small>
                {application.kind} · {application.status}
              </Title>
              <Body>{application.details.fullName}</Body>
              {!!application.reason && <Body>{application.reason}</Body>}
              {!!application.validUntil && (
                <Body muted>
                  {application.validUntil <= verificationDay()
                    ? "Review expired on "
                    : "Review valid until "}
                  {application.validUntil}
                </Body>
              )}
              <Body muted>Application revision {application.revision}</Body>
              {application.documents.map((doc) => (
                <Button
                  key={doc.id}
                  title={"Open: " + doc.name}
                  secondary
                  disabled={evidence.busy}
                  onPress={() => evidence.setOpening(doc)}
                />
              ))}
              <Button
                title="View application history"
                secondary
                disabled={busy}
                onPress={() =>
                  void act(async () =>
                    setHistory(
                      await cloud.verification.request(
                        "/" + application.id + "/history",
                      ),
                    ),
                  )
                }
              />
              {history.map((event) => (
                <Body key={event.revision}>
                  {event.action} · {event.created_at}
                  {"\n"}
                  {event.reason}
                </Body>
              ))}
            </Card>
          )}
          {editable && (
            <Card>
              <Title small>
                {application
                  ? "Submit corrected evidence"
                  : "Apply for " + kind.toLowerCase() + " verification"}
              </Title>
              <Body muted>
                Country: India. Supply only the evidence needed for review. Do
                not enter Aadhaar numbers in these fields. Use masked identity
                documents where appropriate.
              </Body>
              <Field
                label="Full legal name"
                value={details.fullName}
                onChange={(fullName) => setDetails((d) => ({ ...d, fullName }))}
              />
              {kind !== "Patient" && (
                <>
                  <Field
                    label="Registering council / authority"
                    value={details.authority}
                    onChange={(authority) =>
                      setDetails((d) => ({ ...d, authority }))
                    }
                    placeholder={
                      kind === "Doctor"
                        ? "Your State Medical Council"
                        : "Your State Nursing Council"
                    }
                  />
                  <Field
                    label="Professional registration number"
                    value={details.registrationNumber}
                    onChange={(registrationNumber) =>
                      setDetails((d) => ({ ...d, registrationNumber }))
                    }
                  />
                  <Field
                    label="Qualification"
                    value={details.qualification}
                    onChange={(qualification) =>
                      setDetails((d) => ({ ...d, qualification }))
                    }
                  />
                </>
              )}
              <Body muted>
                {kind === "Patient"
                  ? "Attach identity evidence for a staff identity review."
                  : "Attach identity evidence and your professional registration / qualification evidence. NUID alone does not establish nursing licence status."}{" "}
                PDF, JPEG or PNG; up to 4 files, 5 MB each.
              </Body>
              {documents.map((doc) => (
                <View key={doc.id}>
                  <Body>{doc.name}</Body>
                  <Button
                    title="Remove attachment from submission"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await cloud.verification.request("/documents/remove", {
                          id: doc.id,
                        });
                        setDocuments((old) =>
                          old.filter((d) => d.id !== doc.id),
                        );
                      })
                    }
                  />
                </View>
              ))}
              <Button
                title="Attach verification evidence"
                secondary
                disabled={busy || documents.length >= 4}
                onPress={() => void act(attach)}
              />
              <Button
                title={
                  details.consent
                    ? "Consent given · tap to withdraw"
                    : "I consent to upload and manual review of this evidence"
                }
                secondary
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    if (details.consent) {
                      for (const doc of documents)
                        await cloud.verification.request("/documents/remove", {
                          id: doc.id,
                        });
                      setDocuments([]);
                    }
                    setDetails((d) => ({ ...d, consent: !d.consent }));
                  })
                }
              />
              <Button
                title={
                  application
                    ? "Submit corrected application"
                    : "Submit for manual review"
                }
                loading={busy}
                disabled={
                  busy ||
                  !documents.length ||
                  !details.consent ||
                  details.fullName.trim().length < 2
                }
                onPress={() =>
                  void act(async () => {
                    await cloud.verification.request("/submit", {
                      kind,
                      revision: application?.revision || 0,
                      details,
                      documents: documents.map((d) => d.id),
                    });
                    setDocuments([]);
                    setMessage(
                      "Application submitted. An authorised reviewer will check your evidence.",
                    );
                    await load();
                  })
                }
              />
            </Card>
          )}
          {!snapshot && !error && (
            <Body muted>Loading verification settings…</Body>
          )}
        </>
      )}
      {!!message && <Body>{message}</Body>}
      {!!error && <Body>{error}</Body>}
      {!!evidence.error && <Body>{evidence.error}</Body>}
      {evidence.confirmation}
    </Screen>
  );
}
function ReviewCard({
  application,
  onDone,
}: {
  application: VerificationApplication;
  onDone: () => Promise<void>;
}) {
  const { cloud } = useClinic();
  const evidence = useEvidence();
  const [reason, setReason] = useState(""),
    [identityReference, setIdentity] = useState(""),
    [registrationReference, setRegistration] = useState(""),
    [validUntil, setExpiry] = useState("");
  const [decision, setDecision] = useState<VerificationStatus>(
    application.status === "Approved" ? "Suspended" : "Needs information",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const decisions =
    application.status === "Submitted"
      ? ["Approved", "Needs information", "Rejected"]
      : application.status === "Approved"
        ? ["Suspended", "Needs information"]
        : application.status === "Suspended"
          ? ["Needs information"]
          : [];
  const own = application.userId === useClinic().state.session?.identifier;
  return (
    <Card>
      <Title small>
        {application.details.fullName} · {application.kind}
      </Title>
      <Body muted>
        {application.status} · Revision {application.revision}
      </Body>
      <Body>
        {application.details.authority}
        {"\n"}
        {application.details.registrationNumber}
        {"\n"}
        {application.details.qualification}
      </Body>
      {!!application.reason && <Body>Last decision: {application.reason}</Body>}
      {application.documents.map((doc) => (
        <Button
          key={doc.id}
          title={"Review evidence: " + doc.name}
          secondary
          disabled={busy || evidence.busy}
          onPress={() => evidence.setOpening(doc)}
        />
      ))}
      {!!decisions.length && !own && (
        <>
          <Chips
            values={decisions}
            value={decision}
            onChange={(value) => setDecision(value as VerificationStatus)}
          />
          <Field
            label="Reason visible to applicant"
            value={reason}
            onChange={setReason}
            multiline
          />
          {decision === "Approved" && (
            <>
              <Body muted>
                Record checks you actually completed. An uploaded document alone
                is not sufficient. Do not include identity numbers or document
                contents in references.
              </Body>
              <Field
                label="Completed identity check reference"
                value={identityReference}
                onChange={setIdentity}
              />
              {application.kind !== "Patient" && (
                <Field
                  label="Completed professional register check reference"
                  value={registrationReference}
                  onChange={setRegistration}
                />
              )}
              <Field
                label="Review expiry (YYYY-MM-DD)"
                value={validUntil}
                onChange={setExpiry}
              />
            </>
          )}
          <Button
            title="Record review decision"
            loading={busy}
            disabled={busy || reason.trim().length < 10}
            onPress={() => setConfirm(true)}
          />
        </>
      )}
      {own && (
        <Body muted>
          A different authorised reviewer must review your application.
        </Body>
      )}
      {!!error && <Body>{error}</Body>}
      {!!evidence.error && <Body>{evidence.error}</Body>}
      {evidence.confirmation}
      <Confirm
        visible={confirm}
        title={"Confirm: " + decision + "?"}
        body="This decision will be saved with your reviewer identity and reason in the audit history. Professional approval does not assign patient access."
        confirm="Save decision"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          setBusy(true);
          setError("");
          void cloud?.verification
            .request("/review", {
              id: application.id,
              revision: application.revision,
              status: decision,
              reason,
              identityReference,
              registrationReference,
              validUntil,
            })
            .then(onDone)
            .catch((e) => setError(failure(e)))
            .finally(() => setBusy(false));
        }}
      />
    </Card>
  );
}
export function VerificationReviewScreen() {
  const { cloud } = useClinic(),
    client = useRef(cloud?.verification);
  useEffect(() => {
    client.current = cloud?.verification;
  }, [cloud]);
  const [status, setStatus] = useState("Submitted"),
    [applications, setApplications] = useState<VerificationApplication[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!client.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.current.request<{
        applications: VerificationApplication[];
      }>("/review?status=" + encodeURIComponent(status));
      setApplications(result.applications);
    } catch (e) {
      setApplications([]);
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Screen
      title="Verification reviews"
      subtitle="Staff access · every decision is recorded"
      back
      noGuard
    >
      <Card>
        <Body muted>
          Only explicitly authorised verification reviewers can access evidence.
          This role does not grant access to patient care records.
        </Body>
        <Chips
          values={[
            "Submitted",
            "Needs information",
            "Approved",
            "Rejected",
            "Suspended",
          ]}
          value={status}
          onChange={setStatus}
        />
        <Button
          title="Refresh review queue"
          secondary
          loading={busy}
          disabled={busy}
          onPress={() => void load()}
        />
        <Body muted>
          Shows the first 50 matching applications. Review oldest items first.
        </Body>
      </Card>
      {!!error && (
        <Card>
          <Body>{error}</Body>
        </Card>
      )}
      {!busy && !error && !applications.length && (
        <Card>
          <Body>No applications in this queue.</Body>
        </Card>
      )}
      {applications.map((application) => (
        <ReviewCard
          key={application.id + ":" + application.revision}
          application={application}
          onDone={load}
        />
      ))}
    </Screen>
  );
}
