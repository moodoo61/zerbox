import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for real-time stream status from MistServer via WebSocket,
 * with automatic REST fallback when WebSocket is unavailable.
 *
 * channelStats shape: { [streamName]: { status, connections, inputs, outputs } }
 *   status: "active" | "offline" | "init" | "boot" | "wait" | "ready" | "shutdown" | "invalid" | "inactive"
 */
export default function useMistStreamStatus({ restUrl = '/api/viewer-page/stats', restInterval = 30000 } = {}) {
    const [channelStats, setChannelStats] = useState({});
    const [wsConnected, setWsConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimer = useRef(null);
    const pollingTimer = useRef(null);
    const reconnectDelay = useRef(2000);
    const mountedRef = useRef(true);

    const fetchStats = useCallback(async () => {
        try {
            const r = await fetch(restUrl);
            if (!r.ok) return;
            const d = await r.json();
            if (d.status === 'success' && d.streams_stats) {
                if (mountedRef.current) setChannelStats(d.streams_stats);
            }
        } catch { /* silent */ }
    }, [restUrl]);

    useEffect(() => {
        mountedRef.current = true;
        fetchStats();

        function connect() {
            if (!mountedRef.current) return;
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${proto}//${window.location.host}/ws/stream-status`);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) return;
                setWsConnected(true);
                reconnectDelay.current = 2000;
                if (pollingTimer.current) { clearInterval(pollingTimer.current); pollingTimer.current = null; }
            };

            ws.onmessage = (e) => {
                if (!mountedRef.current) return;
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'init' && data.stats) {
                        setChannelStats(data.stats);
                    } else if (data.type === 'update' && data.stream) {
                        setChannelStats(prev => ({
                            ...prev,
                            [data.stream]: {
                                status: data.status,
                                connections: data.connections,
                                inputs: data.inputs,
                                outputs: data.outputs,
                            }
                        }));
                    }
                } catch { /* malformed */ }
            };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setWsConnected(false);
                wsRef.current = null;
                if (!pollingTimer.current) {
                    pollingTimer.current = setInterval(fetchStats, restInterval);
                }
                reconnectTimer.current = setTimeout(() => {
                    reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, 15000);
                    connect();
                }, reconnectDelay.current);
            };

            ws.onerror = () => { ws.close(); };
        }

        connect();

        return () => {
            mountedRef.current = false;
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (pollingTimer.current) clearInterval(pollingTimer.current);
        };
    }, [fetchStats, restInterval]);

    return { channelStats, wsConnected, refetch: fetchStats };
}
