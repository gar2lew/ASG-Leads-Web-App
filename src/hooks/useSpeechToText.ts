/**
 * useSpeechToText.ts — Browser-native speech recognition hook
 *
 * Uses Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Chrome-first; degrades gracefully on unsupported browsers.
 *
 * Guarantees:
 *  - Only ONE SpeechRecognition instance alive at any time
 *  - No auto-restart loops — onend cleans up silently
 *  - Only FINAL transcripts are forwarded to the callback
 *  - Debounce prevents rapid re-triggers
 *  - Full cleanup on unmount
 */

import { useState, useRef, useCallback, useEffect } from "react";

export type STTStatus = "idle" | "listening" | "processing" | "error";

export interface UseSpeechToTextReturn {
  status: STTStatus;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

// Evaluated once at module load
const STT_SUPPORTED =
  typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

/** Silence timeout: auto-stop if no new speech detected within this window */
const SILENCE_TIMEOUT_MS = 5000;

/** Debounce: minimum ms between stop and next start to prevent rapid cycles */
const START_DEBOUNCE_MS = 300;

export function useSpeechToText(onResult: (text: string) => void): UseSpeechToTextReturn {
  const [status, setStatus] = useState<STTStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Single instance — never create more than one
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref-based callback — always calls the latest `onResult`
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // ── helpers ───────────────────────────────────────────────────────────────

  function clearTimers() {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function resetSilenceTimer(recognition: unknown) {
    if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);

    silenceTimerRef.current = setTimeout(() => {
      try {
        (recognition as any).stop();
      } catch {
        /* already stopped */
      }
    }, SILENCE_TIMEOUT_MS);
  }

  function destroyInstance() {
    clearTimers();
    if (recognitionRef.current) {
      // Remove all handlers to prevent stale callbacks
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onstart = null;
      try {
        recognitionRef.current.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    }
  }

  // ── stopListening ─────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    destroyInstance();
    setStatus("idle");
    setTranscript("");
  }, []);

  // ── startListening ────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!STT_SUPPORTED) {
      setError("Voice input is not supported in this browser. Please use Chrome or Edge.");
      setStatus("error");
      return;
    }

    // Debounce: prevent rapid start/stop cycles
    if (debounceTimerRef.current !== null) return;

    // If already listening, stop first (toggle behaviour)
    if (recognitionRef.current) {
      destroyInstance();
      // Set debounce to prevent immediate restart
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
      }, START_DEBOUNCE_MS);
      setStatus("idle");
      setTranscript("");
      return;
    }

    setError(null);
    setTranscript("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionAPI();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-AU";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus("listening");
      resetSilenceTimer(recognition);
    };

    // Only process FINAL transcripts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }

      // Update display transcript (interim only, for UI feedback)
      if (!final) {
        setTranscript(interim);
        // Interim speech — reset the silence countdown
        resetSilenceTimer(recognition);
      }

      // Only fire callback for FINAL results
      if (final.trim()) {
        const finalText = final.trim();
        clearTimers();
        setStatus("processing");
        try {
          recognition.stop();
        } catch {
          /* already stopped */
        }
        recognitionRef.current = null;
        setTranscript(finalText);
        onResultRef.current(finalText);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      clearTimers();
      const errorMap: Record<string, string> = {
        "not-allowed": "Microphone access denied. Please allow microphone access in your browser settings.",
        "no-speech": "No speech detected. Please try speaking more clearly.",
        "audio-capture": "No microphone found. Please check your microphone connection.",
        network: "Network error during speech recognition.",
        aborted: "", // user-initiated — silent
      };

      const msg = errorMap[event.error as string] ?? "";
      recognitionRef.current = null;

      if (msg) {
        setError(msg);
        setStatus("error");
      } else {
        setStatus("idle");
        setTranscript("");
      }
    };

    recognition.onend = () => {
      clearTimers();
      // Clean up instance — NO auto-restart
      recognitionRef.current = null;
      setStatus((prev) => {
        if (prev === "listening" || prev === "processing") return "idle";
        return prev;
      });
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      clearTimers();
      setError("Failed to start microphone. Please try again.");
      setStatus("error");
      recognitionRef.current = null;
    }
  }, []); // stable — uses refs internally

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      destroyInstance();
    };
  }, []);

  return {
    status,
    isSupported: STT_SUPPORTED,
    transcript,
    error,
    startListening,
    stopListening,
  };
}

export default useSpeechToText;
