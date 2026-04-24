import { useEffect, useRef } from "react";

/**
 * Connects to the monitoring SSE stream and calls onMessage for each event.
 * Automatically reconnects on error with exponential back-off (max 30s).
 * Returns a cleanup function — the caller's useEffect should return it.
 */
export function useMonitoringSSE(onMessage) {
  const esRef   = useRef(null);
  const retryMs = useRef(1000);
  const timer   = useRef(null);

  useEffect(() => {
    function connect() {
      const token = localStorage.getItem("nms_token");
      if (!token) return;

      const es = new EventSource(`/api/monitoring/stream?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.onmessage = (e) => {
        retryMs.current = 1000;   // reset back-off on success
        try {
          const payload = JSON.parse(e.data);
          onMessage(payload);
        } catch {}
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential back-off: 1s → 2s → 4s → … → 30s
        timer.current = setTimeout(() => {
          retryMs.current = Math.min(retryMs.current * 2, 30_000);
          connect();
        }, retryMs.current);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (timer.current) clearTimeout(timer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
