"use client";

import React, { useState } from "react";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

export default function VoicePoweredOrbPage() {
  const [requestedRecording, setRequestedRecording] = useState(false);
  const [micStatus, setMicStatus] = useState<"idle" | "pending" | "active" | "error">("idle");
  const [, setVoiceDetected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const toggleRecording = () => {
    if (requestedRecording) {
      setRequestedRecording(false);
      setMicStatus("idle");
      setErrorMessage("");
    } else {
      setRequestedRecording(true);
      setMicStatus("pending");
      setErrorMessage("");
    }
  };

  const handleMicStatus = (status: "idle" | "pending" | "active" | "error") => {
    setMicStatus(status);
    if (status === "error") {
      setRequestedRecording(false);
      setErrorMessage("Microphone access was denied or is unavailable.");
    } else if (status === "active") {
      setErrorMessage("");
    }
  };

  const isRecording = requestedRecording && micStatus === "active";
  const isPending = requestedRecording && micStatus === "pending";

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950 text-white">
      <div className="flex flex-col items-center space-y-8">
        {/* Orb */}
        <div className="w-96 h-96 relative">
          <VoicePoweredOrb
            enableVoiceControl={requestedRecording}
            className="rounded-xl overflow-hidden shadow-2xl"
            onVoiceDetected={setVoiceDetected}
            onMicStatus={handleMicStatus}
          />
        </div>

        {/* Control Button */}
        <Button
          onClick={toggleRecording}
          disabled={isPending}
          variant={isRecording ? "destructive" : "default"}
          size="lg"
          className="px-8 py-3"
        >
          {isPending ? (
            "Initializing microphone…"
          ) : isRecording ? (
            <>
              <MicOff className="w-5 h-5 mr-3" />
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="w-5 h-5 mr-3" />
              Start Recording
            </>
          )}
        </Button>

        {errorMessage && (
          <p className="text-red-400 text-center max-w-md text-sm">
            {errorMessage}
          </p>
        )}

        {/* Simple Instructions */}
        <p className="text-muted-foreground text-center max-w-md text-sm">
          Click the button to enable voice control. Speak to see the orb respond to your voice with subtle movements.
        </p>
      </div>
    </div>
  );
}
