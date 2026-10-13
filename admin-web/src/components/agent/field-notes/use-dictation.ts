import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as
    (new () => SpeechRecognitionLike) | null;
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
      recognition.onerror = () => {
        setListening(false);
        toast.error("Couldn't hear you — check microphone permission.");
      };
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      toast.error("Voice couldn't start.");
    }
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { listening, start, stop, supported: getSpeechRecognition() !== null };
}
