import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => SpeechRecognitionLike) | null;
}

const ENABLE_MIC_STEPS =
  "Tap the lock/tune icon next to the address bar → Permissions → Microphone → Allow. " +
  "Or: phone Settings → Apps → your browser → Permissions → Microphone → Allow. Then tap Try again.";

function showDictationError(code: string | undefined, retry: () => void) {
  if (code === "no-speech") {
    toast.info("Didn't catch anything — tap the mic and speak.");
    return;
  }
  if (code === "audio-capture") {
    toast.error("No microphone found on this device.");
    return;
  }
  if (code === "network") {
    toast.error("Voice needs an internet connection. Type the memo instead.");
    return;
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    toast.error("Microphone is blocked on non-HTTPS pages.", {
      description: "Open the app over https:// (the live site) to use voice, or type the memo.",
      duration: 10000,
    });
    return;
  }
  toast.error("Microphone access is off.", {
    description: ENABLE_MIC_STEPS,
    duration: 15000,
    action: { label: "Try again", onClick: retry },
  });
}

/**
 * Browser voice dictation. `onText` receives the full transcript so far each time the
 * recogniser produces a result. Falls back to a toast where speech recognition is missing.
 */
export function useDictation(onText: (transcript: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startRef = useRef<() => void>(() => {});

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast.info("Voice isn't supported in this browser. Type the memo instead.");
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ");
        onTextRef.current(text.trim());
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = (event) => {
        setListening(false);
        showDictationError(event.error, () => startRef.current());
      };
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      toast.error("Voice couldn't start.");
    }
  }, []);
  startRef.current = start;

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { listening, start, stop, supported: getSpeechRecognition() !== null };
}
