import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const UpdateStatusContext = createContext(null);

const DEFAULT_STATUS = {
    status: 'idle',
    progress: 0,
    message: '',
    steps: [],
    new_version: null,
    error: null,
};

export const UpdateStatusProvider = ({ auth, children }) => {
    const [currentVersion, setCurrentVersion] = useState('');
    const [updateInfo, setUpdateInfo] = useState(null);
    const [updateStatus, setUpdateStatus] = useState(DEFAULT_STATUS);
    const [checking, setChecking] = useState(false);
    const [startingUpdate, setStartingUpdate] = useState(false);
    const [error, setError] = useState(null);
    const [dismissedSuccess, setDismissedSuccess] = useState(false);
    const pollRef = useRef(null);

    const headers = useMemo(
        () => (auth ? { Authorization: `Basic ${auth}` } : {}),
        [auth]
    );

    const clearPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const refreshVersion = useCallback(async () => {
        if (!auth) return;
        try {
            const res = await fetch('/api/system/version', { headers });
            if (!res.ok) return;
            const data = await res.json();
            setCurrentVersion(data.version || '');
        } catch (_) {}
    }, [auth, headers]);

    const checkForUpdate = useCallback(async () => {
        if (!auth) return null;
        setChecking(true);
        setError(null);
        try {
            const res = await fetch('/api/system/check-update', { headers });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            }
            setUpdateInfo(data);
            return data;
        } catch (_) {
            setError('فشل الاتصال بالخادم');
            return null;
        } finally {
            setChecking(false);
        }
    }, [auth, headers]);

    const refreshUpdateStatus = useCallback(async () => {
        if (!auth) return null;
        try {
            const res = await fetch('/api/system/update-status', { headers });
            if (!res.ok) return null;
            const data = await res.json();
            setUpdateStatus(data);
            if (data.status === 'success' || data.status === 'error') {
                clearPolling();
                setStartingUpdate(false);
                await refreshVersion();
                await checkForUpdate();
            }
            if (data.status === 'idle') {
                clearPolling();
                setStartingUpdate(false);
            }
            return data;
        } catch (_) {
            return null;
        }
    }, [auth, headers, clearPolling, refreshVersion, checkForUpdate]);

    const ensureFastPolling = useCallback(() => {
        if (pollRef.current) return;
        pollRef.current = setInterval(() => {
            refreshUpdateStatus();
        }, 1500);
    }, [refreshUpdateStatus]);

    const startUpdate = useCallback(async () => {
        if (!auth) {
            return { status: 'error', message: 'المستخدم غير مسجل الدخول' };
        }

        setStartingUpdate(true);
        setDismissedSuccess(false);
        setError(null);

        try {
            const res = await fetch('/api/system/update', {
                method: 'POST',
                headers,
            });
            const data = await res.json();

            if (data.status === 'error') {
                setError(data.message || 'فشل بدء التحديث');
                setStartingUpdate(false);
                return data;
            }

            if (data.current_status) {
                setUpdateStatus(data.current_status);
            }

            ensureFastPolling();
            await refreshUpdateStatus();
            return data;
        } catch (_) {
            const failure = { status: 'error', message: 'فشل بدء التحديث' };
            setError(failure.message);
            setStartingUpdate(false);
            return failure;
        }
    }, [auth, headers, ensureFastPolling, refreshUpdateStatus]);

    useEffect(() => {
        if (!auth) {
            clearPolling();
            setCurrentVersion('');
            setUpdateInfo(null);
            setUpdateStatus(DEFAULT_STATUS);
            setChecking(false);
            setStartingUpdate(false);
            setError(null);
            return undefined;
        }

        refreshVersion();
        checkForUpdate();
        refreshUpdateStatus();

        const interval = setInterval(() => {
            refreshUpdateStatus();
        }, 10000);

        return () => {
            clearInterval(interval);
            clearPolling();
        };
    }, [auth, clearPolling, refreshVersion, checkForUpdate, refreshUpdateStatus]);

    useEffect(() => {
        if (updateStatus.status === 'updating') {
            ensureFastPolling();
            return;
        }
        if (updateStatus.status === 'success') {
            if (!dismissedSuccess) return;
            setUpdateStatus(DEFAULT_STATUS);
            return;
        }
        if (updateStatus.status === 'error') return;
        clearPolling();
    }, [updateStatus.status, dismissedSuccess, ensureFastPolling, clearPolling]);

    const dismissSuccess = useCallback(() => {
        setDismissedSuccess(true);
    }, []);

    const dismissError = useCallback(() => {
        setError(null);
        if (updateStatus.status === 'error') {
            setUpdateStatus(DEFAULT_STATUS);
        }
    }, [updateStatus.status]);

    const isUpdateInProgress = updateStatus.status === 'updating' || startingUpdate;

    const value = useMemo(() => ({
        currentVersion,
        updateInfo,
        updateStatus,
        checking,
        startingUpdate,
        error,
        isUpdateInProgress,
        checkForUpdate,
        startUpdate,
        refreshUpdateStatus,
        refreshVersion,
        dismissSuccess,
        dismissError,
    }), [
        currentVersion,
        updateInfo,
        updateStatus,
        checking,
        startingUpdate,
        error,
        isUpdateInProgress,
        checkForUpdate,
        startUpdate,
        refreshUpdateStatus,
        refreshVersion,
        dismissSuccess,
        dismissError,
    ]);

    return (
        <UpdateStatusContext.Provider value={value}>
            {children}
        </UpdateStatusContext.Provider>
    );
};

export const useUpdateStatus = () => {
    const context = useContext(UpdateStatusContext);
    if (!context) {
        throw new Error('useUpdateStatus must be used within UpdateStatusProvider');
    }
    return context;
};
