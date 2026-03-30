import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Paper, Alert, Skeleton, Button, Snackbar, Chip,
    IconButton, Collapse, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, CircularProgress, Tooltip
} from '@mui/material';
import Gauge from './Gauge';
import ComputerIcon from '@mui/icons-material/Computer';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import TerminalIcon from '@mui/icons-material/Terminal';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PowerOffIcon from '@mui/icons-material/PowerOff';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';

/** تنسيق موحّد لبطاقات الصف الأول (نظرة عامة) */
const overviewTopPaperSx = {
    p: 1,
    borderRadius: 2,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: 'auto',
};

/** تنسيق موحّد لبطاقات المعالج / الذاكرة / التخزين */
const gaugeCardPaperSx = {
    p: 1.5,
    textAlign: 'center',
    borderRadius: 2,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    flex: 1,
    minHeight: { xs: 248, sm: 264 },
};

const gaugeCardFooterSlotSx = {
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    mt: 'auto',
    pt: 1,
};

function formatUptime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return 'N/A';
    }
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    
    return `${d}d ${h}h ${m}m`;
}

function formatBytesPerSec(bps) {
    if (bps == null || bps < 0) return '0 B/s';
    if (bps < 1024) return `${Math.round(bps)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

const LOG_LEVEL_CONFIG = {
    success: { color: '#2e7d32', bg: '#e8f5e9', label: 'نجاح' },
    info:    { color: '#1565c0', bg: '#e3f2fd', label: 'معلومة' },
    warning: { color: '#e65100', bg: '#fff3e0', label: 'تحذير' },
    error:   { color: '#c62828', bg: '#ffebee', label: 'خطأ' },
};

const SystemMonitor = ({ auth, userInfo }) => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [isClearing, setIsClearing] = useState(false);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [logs, setLogs] = useState([]);
    const [logsExpanded, setLogsExpanded] = useState(true);

    const [showIdDialog, setShowIdDialog] = useState(false);
    const [idLoading, setIdLoading] = useState(false);
    const [idSaving, setIdSaving] = useState(false);
    const [idError, setIdError] = useState(null);
    const [customSerial, setCustomSerial] = useState('');
    const [customUuid, setCustomUuid] = useState('');
    const [systemSerial, setSystemSerial] = useState('');
    const [systemUuid, setSystemUuid] = useState('');
    const [powerAction, setPowerAction] = useState(null);

    const isOwner = userInfo?.role === 'owner';
    const canUsePowerControls = userInfo?.role === 'owner' || userInfo?.role === 'manager';

    const callPowerEndpoint = async (path, confirmMessage) => {
        if (!window.confirm(confirmMessage)) return;
        setPowerAction(path);
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { Authorization: `Basic ${auth}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || data.message || 'فشل الطلب');
            setSnackbar({ open: true, message: data.message || 'تم', severity: 'success' });
        } catch (e) {
            setSnackbar({ open: true, message: e.message || 'فشل', severity: 'error' });
        } finally {
            setPowerAction(null);
        }
    };

    const copyText = async (label, value) => {
        const textValue = `${value ?? ''}`.trim();
        if (!textValue || textValue === '—') {
            setSnackbar({ open: true, message: `لا توجد قيمة لنسخ ${label}`, severity: 'warning' });
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(textValue);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = textValue;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setSnackbar({ open: true, message: `تم نسخ ${label}`, severity: 'success' });
        } catch (_) {
            setSnackbar({ open: true, message: `فشل نسخ ${label}`, severity: 'error' });
        }
    };

    function openIdDialog() {
        setShowIdDialog(true);
        setIdLoading(true);
        setIdError(null);
        fetch('/api/device-identity/', { headers: { 'Authorization': `Basic ${auth}` } })
            .then(res => res.ok ? res.json() : Promise.reject(new Error('فشل تحميل البيانات')))
            .then(data => {
                setCustomSerial(data.custom_serial || '');
                setCustomUuid(data.custom_uuid || '');
                setSystemSerial(data.system_serial || '—');
                setSystemUuid(data.system_uuid || '—');
                setIdLoading(false);
            })
            .catch(err => { setIdError(err.message); setIdLoading(false); });
    }

    async function saveDeviceIdentity() {
        setIdSaving(true);
        setIdError(null);
        try {
            const res = await fetch('/api/device-identity/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify({
                    custom_serial: customSerial.trim(),
                    custom_uuid: customUuid.trim(),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل الحفظ');
            setShowIdDialog(false);
            setSnackbar({ open: true, message: 'تم حفظ معرّف الجهاز بنجاح', severity: 'success' });
        } catch (err) {
            setIdError(err.message);
        } finally {
            setIdSaving(false);
        }
    }

    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (!auth) return;

        const fetchStats = async () => {
            try {
                const response = await fetch('/api/stats', { 
                    headers: { 'Authorization': 'Basic ' + auth } 
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch system stats.');
                }
                const data = await response.json();
                setStats(data);
                setError('');
            } catch (err) {
                setError(err.message);
                setStats(null);
            }
        };

        fetchStats();
        const intervalId = setInterval(fetchStats, 3000);

        return () => clearInterval(intervalId);
    }, [auth]);

    useEffect(() => {
        if (!auth) return;
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/system-logs?limit=50', {
                    headers: { 'Authorization': 'Basic ' + auth }
                });
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.logs || []);
                }
            } catch (_) { /* ignore */ }
        };
        fetchLogs();
        const id = setInterval(fetchLogs, 10000);
        return () => clearInterval(id);
    }, [auth]);

    const handleClearLogs = async () => {
        try {
            const res = await fetch('/api/system-logs', {
                method: 'DELETE',
                headers: { 'Authorization': 'Basic ' + auth }
            });
            if (res.ok) {
                setLogs([]);
                setSnackbar({ open: true, message: 'تم مسح السجل', severity: 'success' });
            }
        } catch (_) { /* ignore */ }
    };

    if (error) {
        return (
            <Alert severity="warning" sx={{ mt: 2 }}>
                {error}
            </Alert>
        );
    }

    if (!stats) {
        return (
            <Grid container spacing={1.5}>
                {[1, 2, 3].map((k) => (
                    <Grid key={k} item xs={12} md={4} sx={{ display: 'flex' }}>
                        <Paper sx={{ ...overviewTopPaperSx, p: 1, width: '100%' }}>
                            <Skeleton variant="text" width="50%" />
                            <Skeleton variant="text" width="80%" sx={{ mt: 1 }} />
                            <Skeleton variant="text" width="60%" sx={{ mt: 1 }} />
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        );
    }

    return (
        <Box sx={{ width: '100%' }}>
            <Grid container spacing={1.5}>
                {/* الصف الأول: ID | الوقت + وقت التشغيل | أوامر الجهاز */}
                <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={{ ...overviewTopPaperSx, gap: 1.5 }}>
                        {/* هيدر واحد مثل بطاقة الوقت: أيقونة + SN | UUID + تعديل */}
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                width: '100%',
                            }}
                        >
                            <Tooltip title="معرّف الجهاز">
                                <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                    <FingerprintIcon color="primary" fontSize="small" />
                                </Box>
                            </Tooltip>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                                <Typography
                                    variant="body2"
                                    color="primary"
                                    sx={{ fontWeight: 'bold', fontSize: '0.8rem', flex: 1, textAlign: 'center' }}
                                >
                                    SN
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="primary"
                                    sx={{ fontWeight: 'bold', fontSize: '0.8rem', flex: 1, textAlign: 'center' }}
                                >
                                    UUID
                                </Typography>
                            </Box>
                            {isOwner ? (
                                <Tooltip title="تعديل المعرّف">
                                    <IconButton
                                        size="small"
                                        onClick={openIdDialog}
                                        sx={{ p: 0.3, flexShrink: 0 }}
                                    >
                                        <EditIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            ) : (
                                <Box sx={{ width: 28, flexShrink: 0 }} />
                            )}
                        </Box>
                        <Box sx={{ width: '100%', borderBottom: '1px solid', borderColor: 'divider', opacity: 0.7 }} />
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                width: '100%',
                                pt: 0.15,
                            }}
                        >
                            <Box sx={{ width: 20, flexShrink: 0 }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                            <Tooltip title="نسخ الرقم التسلسلي">
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={() => copyText('SN', stats.serial_number ?? '—')}
                                    sx={{
                                        border: 'none',
                                        background: 'transparent',
                                        p: 0,
                                        m: 0,
                                        cursor: 'pointer',
                                        flex: 1,
                                        minWidth: 0,
                                        textAlign: 'center',
                                    }}
                                >
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            color: 'text.secondary',
                                            fontFamily: 'monospace',
                                            fontWeight: 600,
                                            fontSize: '0.95rem',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {stats.serial_number ?? '—'}
                                    </Typography>
                                </Box>
                            </Tooltip>
                            <Tooltip title="نسخ UUID">
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={() => copyText('UUID', stats.machine_uuid ?? '—')}
                                    sx={{
                                        border: 'none',
                                        background: 'transparent',
                                        p: 0,
                                        m: 0,
                                        cursor: 'pointer',
                                        flex: 1,
                                        minWidth: 0,
                                        textAlign: 'center',
                                    }}
                                >
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            color: 'text.secondary',
                                            fontFamily: 'monospace',
                                            fontWeight: 600,
                                            fontSize: '0.95rem',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {stats.machine_uuid ?? '—'}
                                    </Typography>
                                </Box>
                            </Tooltip>
                            </Box>
                            <Box sx={{ width: 28, flexShrink: 0 }} />
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={{ ...overviewTopPaperSx, gap: 1.5 }}>
                        {/* سطر العناوين */}
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                width: '100%',
                            }}
                        >
                            <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                <ScheduleIcon color="primary" fontSize="small" />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                <Typography
                                    variant="body2"
                                    color="primary"
                                    sx={{
                                        fontWeight: 'bold',
                                        fontSize: '0.8rem',
                                        flex: 1,
                                        textAlign: 'center',
                                    }}
                                >
                                    الوقت
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="primary"
                                    sx={{
                                        fontWeight: 'bold',
                                        fontSize: '0.8rem',
                                        flex: 1,
                                        textAlign: 'center',
                                    }}
                                >
                                    التشغيل
                                </Typography>
                            </Box>
                        </Box>
                        <Box sx={{ width: '100%', borderBottom: '1px solid', borderColor: 'divider', opacity: 0.7 }} />

                        {/* سطر النتائج */}
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 1,
                                width: '100%',
                                pt: 0.25,
                            }}
                        >
                            <Box sx={{ width: 20, flexShrink: 0 }} />
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flex: 1 }}>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontWeight: 600,
                                        flex: 1,
                                        textAlign: 'center',
                                        fontSize: '1rem',
                                        lineHeight: 1.3,
                                        letterSpacing: 0.2,
                                    }}
                                >
                                    {currentTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </Typography>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontWeight: 600,
                                        flex: 1,
                                        textAlign: 'center',
                                        fontSize: '1rem',
                                        lineHeight: 1.3,
                                        letterSpacing: 0.2,
                                    }}
                                >
                                    {formatUptime(stats.uptime_seconds)}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={{ ...overviewTopPaperSx, gap: 1 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 1,
                                width: '100%',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                <PowerSettingsNewIcon color="primary" fontSize="small" />
                            </Box>
                        </Box>
                        <Box sx={{ width: '100%', borderBottom: '1px solid', borderColor: 'divider', opacity: 0.7 }} />
                        {canUsePowerControls ? (
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 1,
                                    width: '100%',
                                }}
                            >
                                <Tooltip title="إعادة تشغيل الجهاز">
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        color="warning"
                                        disabled={!!powerAction}
                                        sx={{ minWidth: 0, px: 1, py: 0.5 }}
                                        onClick={() =>
                                            callPowerEndpoint(
                                                '/api/system/power/reboot',
                                                'هل تريد إعادة تشغيل الجهاز؟'
                                            )
                                        }
                                    >
                                        {powerAction === '/api/system/power/reboot' ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <RestartAltIcon fontSize="small" />
                                        )}
                                    </Button>
                                </Tooltip>

                                <Tooltip title="إيقاف تشغيل الجهاز">
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        color="error"
                                        disabled={!!powerAction}
                                        sx={{ minWidth: 0, px: 1, py: 0.5 }}
                                        onClick={() =>
                                            callPowerEndpoint(
                                                '/api/system/power/shutdown',
                                                'هل تريد إيقاف تشغيل الجهاز؟'
                                            )
                                        }
                                    >
                                        {powerAction === '/api/system/power/shutdown' ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <PowerOffIcon fontSize="small" />
                                        )}
                                    </Button>
                                </Tooltip>

                                <Tooltip title="إعادة تشغيل خدمة Zero">
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        color="primary"
                                        disabled={!!powerAction}
                                        sx={{ minWidth: 0, px: 1, py: 0.5 }}
                                        onClick={() =>
                                            callPowerEndpoint(
                                                '/api/system/power/restart-zero-service',
                                                'هل تريد إعادة تشغيل خدمة Zero فقط؟ (دون إعادة تشغيل النظام)'
                                            )
                                        }
                                    >
                                        {powerAction === '/api/system/power/restart-zero-service' ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <SettingsBackupRestoreIcon fontSize="small" />
                                        )}
                                    </Button>
                                </Tooltip>
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                                يتطلب صلاحية المالك أو المدير لإدارة الطاقة.
                            </Typography>
                        )}
                    </Paper>
                </Grid>

                {/* الصف الأول - العدادات (الأولوية الأعلى) */}
                <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={gaugeCardPaperSx}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <ComputerIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                المعالج
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: 0,
                            }}
                        >
                            <Gauge value={stats.cpu_usage} unit="%" />
                        </Box>
                        <Box sx={gaugeCardFooterSlotSx}>
                            {stats.cpu_temp != null ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                    <ThermostatIcon
                                        sx={{
                                            fontSize: 18,
                                            color:
                                                stats.cpu_temp > 80
                                                    ? 'error.main'
                                                    : stats.cpu_temp > 60
                                                      ? 'warning.main'
                                                      : 'success.main',
                                        }}
                                    />
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontWeight: 'bold',
                                            color:
                                                stats.cpu_temp > 80
                                                    ? 'error.main'
                                                    : stats.cpu_temp > 60
                                                      ? 'warning.main'
                                                      : 'success.main',
                                        }}
                                    >
                                        {stats.cpu_temp}°C
                                    </Typography>
                                </Box>
                            ) : null}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={gaugeCardPaperSx}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <MemoryIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                الذاكرة
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: 0,
                            }}
                        >
                            <Gauge value={stats.memory_usage} unit="%" />
                        </Box>
                        <Box sx={gaugeCardFooterSlotSx}>
                            <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                disabled={isClearing}
                                onClick={async () => {
                                    setIsClearing(true);
                                    try {
                                        const response = await fetch('/api/clear-memory', {
                                            method: 'POST',
                                            headers: { Authorization: 'Basic ' + auth },
                                        });

                                        if (response.ok) {
                                            const result = await response.json();
                                            let message = result.message || 'تم تحرير الذاكرة بنجاح';

                                            if (result.freed && result.freed > 0) {
                                                message = `${result.message} (من ${result.memory_before?.toFixed(1)}% إلى ${result.memory_after?.toFixed(1)}%)`;
                                            }

                                            setSnackbar({
                                                open: true,
                                                message,
                                                severity: 'success',
                                            });
                                        } else {
                                            throw new Error('فشل في تحرير الذاكرة');
                                        }
                                    } catch (error) {
                                        setSnackbar({
                                            open: true,
                                            message: 'فشل في تحرير الذاكرة: ' + error.message,
                                            severity: 'error',
                                        });
                                    } finally {
                                        setIsClearing(false);
                                    }
                                }}
                                sx={{
                                    py: 0.5,
                                    minWidth: 'auto',
                                    width: '100%',
                                }}
                            >
                                {isClearing ? 'جارٍ التحرير...' : 'تحرير الذاكرة'}
                            </Button>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex' }}>
                    <Paper sx={gaugeCardPaperSx}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <StorageIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                التخزين
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: 0,
                            }}
                        >
                            <Gauge value={stats.disk_usage} unit="%" />
                        </Box>
                        <Box sx={gaugeCardFooterSlotSx} />
                    </Paper>
                </Grid>

                {/* مؤشر الشبكة - ترافيك حسب المنفذ */}
                <Grid item xs={12}>
                    <Paper sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <NetworkCheckIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                مؤشر الشبكة
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {stats.network_interfaces && Object.keys(stats.network_interfaces).length > 0
                                ? Object.entries(stats.network_interfaces).map(([iface, data]) => (
                                    <Box
                                        key={iface}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 2,
                                            py: 0.5,
                                            px: 1,
                                            borderRadius: 1,
                                            bgcolor: 'action.hover'
                                        }}
                                    >
                                        <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 64 }}>
                                            {iface}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <CloudDownloadIcon sx={{ color: 'success.main', fontSize: 18 }} />
                                            <Typography variant="body2" color="text.secondary">استقبال:</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                                {formatBytesPerSec(data.recv_bps)}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <CloudUploadIcon sx={{ color: 'info.main', fontSize: 18 }} />
                                            <Typography variant="body2" color="text.secondary">إرسال:</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                                {formatBytesPerSec(data.sent_bps)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                  ))
                                : (
                                    <Typography variant="body2" color="text.secondary">
                                        لا توجد واجهات شبكة
                                    </Typography>
                                )}
                        </Box>
                    </Paper>
                </Grid>

                {/* سجل أحداث النظام */}
                <Grid item xs={12}>
                    <Paper sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: logsExpanded ? 1 : 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setLogsExpanded(p => !p)}>
                                <TerminalIcon color="primary" fontSize="small" />
                                <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                    سجل الأحداث
                                </Typography>
                                <Chip label={logs.length} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                                <IconButton size="small">
                                    {logsExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                            </Box>
                            {logsExpanded && logs.length > 0 && (
                                <IconButton size="small" onClick={handleClearLogs} title="مسح السجل">
                                    <DeleteSweepIcon fontSize="small" color="action" />
                                </IconButton>
                            )}
                        </Box>
                        <Collapse in={logsExpanded}>
                            <Box sx={{ 
                                maxHeight: 260, 
                                overflowY: 'auto', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: 0.5,
                                '&::-webkit-scrollbar': { width: 6 },
                                '&::-webkit-scrollbar-thumb': { background: '#ccc', borderRadius: 3 }
                            }}>
                                {logs.length > 0 ? logs.map((entry, i) => {
                                    const cfg = LOG_LEVEL_CONFIG[entry.level] || LOG_LEVEL_CONFIG.info;
                                    return (
                                        <Box
                                            key={i}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 1,
                                                py: 0.5,
                                                px: 1,
                                                borderRadius: 1,
                                                bgcolor: cfg.bg,
                                                borderRight: `3px solid ${cfg.color}`,
                                            }}
                                        >
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 55, pt: 0.2 }}>
                                                {entry.timestamp ? entry.timestamp.split(' ')[1] : ''}
                                            </Typography>
                                            <Chip 
                                                label={cfg.label} 
                                                size="small" 
                                                sx={{ 
                                                    height: 18, fontSize: 10, fontWeight: 'bold',
                                                    bgcolor: cfg.color, color: '#fff', minWidth: 42
                                                }} 
                                            />
                                            <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.4 }}>
                                                {entry.message}
                                            </Typography>
                                            <Chip 
                                                label={entry.source} 
                                                size="small" 
                                                variant="outlined"
                                                sx={{ height: 18, fontSize: 10, opacity: 0.7 }} 
                                            />
                                        </Box>
                                    );
                                }) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                                        لا توجد أحداث مسجلة
                                    </Typography>
                                )}
                            </Box>
                        </Collapse>
                    </Paper>
                </Grid>
            </Grid>
            
            {/* رسائل التأكيد */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* حوار تعديل معرّف الجهاز */}
            <Dialog open={showIdDialog} onClose={() => setShowIdDialog(false)} maxWidth="xs" fullWidth
                PaperProps={{ sx: { direction: 'rtl', borderRadius: 3 } }}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FingerprintIcon color="primary" />
                    تعديل معرّف الجهاز
                </DialogTitle>
                <DialogContent>
                    {idLoading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 3 }} />}
                    {idError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{idError}</Alert>}
                    {!idLoading && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                أدخل قيم مخصصة للرقم التسلسلي و UUID. اتركها فارغة لاستخدام قيم النظام.
                            </Typography>
                            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    قيم النظام الأصلية:
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    SN: {systemSerial}
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    UUID: {systemUuid}
                                </Typography>
                            </Box>
                            <TextField
                                label="الرقم التسلسلي (SN) المخصص"
                                fullWidth
                                margin="dense"
                                value={customSerial}
                                onChange={(e) => setCustomSerial(e.target.value)}
                                placeholder="اتركه فارغاً لاستخدام قيمة النظام"
                                sx={{ mb: 1 }}
                                InputProps={{ sx: { fontFamily: 'monospace' } }}
                            />
                            <TextField
                                label="UUID المخصص"
                                fullWidth
                                margin="dense"
                                value={customUuid}
                                onChange={(e) => setCustomUuid(e.target.value)}
                                placeholder="اتركه فارغاً لاستخدام قيمة النظام"
                                InputProps={{ sx: { fontFamily: 'monospace' } }}
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowIdDialog(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={saveDeviceIdentity} disabled={idSaving || idLoading}>
                        {idSaving ? <CircularProgress size={20} /> : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SystemMonitor;