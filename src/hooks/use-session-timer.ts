import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";

const PAUSE_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const PAUSE_DURATION_MS = 20 * 1000; // 20 secondes
const NATURAL_PAUSE_GRACE_MS = 30 * 1000; // absence de visage de plus de 30s = pause naturelle détectée

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useSessionTimer(faceDetected: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [secondsUntilPause, setSecondsUntilPause] = useState(
    PAUSE_INTERVAL_MS / 1000,
  );
  const [pausesSuggested, setPausesSuggested] = useState(0);
  const [pausesConfirmed, setPausesConfirmed] = useState(0);
  const [showPausePrompt, setShowPausePrompt] = useState(false);

  const lastFaceTime = useRef<number>(Date.now());
  const continuousStart = useRef<number>(Date.now());
  const naturalPauseCredited = useRef<boolean>(false);

  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Détection de pause naturelle : pas de visage depuis un moment
      if (!faceDetected) {
        const absenceDuration = now - lastFaceTime.current;
        if (
          absenceDuration > NATURAL_PAUSE_GRACE_MS &&
          !naturalPauseCredited.current
        ) {
          // L'utilisateur a fait une pause spontanée : on relance le compteur sans pénalité
          continuousStart.current = now;
          naturalPauseCredited.current = true;
          setPausesConfirmed((p) => p + 1);
        }
      } else {
        lastFaceTime.current = now;
        naturalPauseCredited.current = false;
      }

      const continuousElapsed = now - continuousStart.current;
      const remaining = Math.max(0, PAUSE_INTERVAL_MS - continuousElapsed);
      setSecondsUntilPause(Math.round(remaining / 1000));
      setElapsedSeconds((s) => s + 1);

      if (remaining === 0 && !showPausePrompt) {
        triggerPauseSuggestion();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [faceDetected, showPausePrompt]);

  async function triggerPauseSuggestion() {
    setShowPausePrompt(true);
    setPausesSuggested((p) => p + 1);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Pause visuelle recommandée",
        body: "Regarde au loin pendant 20 secondes pour reposer tes yeux.",
      },
      trigger: null,
    });
  }

  function confirmPause() {
    setPausesConfirmed((p) => p + 1);
    setShowPausePrompt(false);
    continuousStart.current = Date.now();
  }

  function dismissPause() {
    setShowPausePrompt(false);
    continuousStart.current = Date.now();
  }

  return {
    elapsedSeconds,
    secondsUntilPause,
    pausesSuggested,
    pausesConfirmed,
    showPausePrompt,
    confirmPause,
    dismissPause,
  };
}
