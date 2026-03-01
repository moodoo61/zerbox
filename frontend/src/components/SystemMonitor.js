import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, Paper, Alert, Skeleton, Button, Snackbar, Chip, IconButton, Collapse } from '@mui/material';
import Gauge from './Gauge';
import ComputerIcon from '@mui/icons-material/Computer';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ScheduleIcon from '@mui/icons-material/Schedule';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import TerminalIcon from '@mui/icons-material/Terminal';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

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

const SystemMonitor = ({ auth }) => {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [isClearing, setIsClearing] = useState(false);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const [logs, setLogs] = useState([]);
    const [logsExpanded, setLogsExpanded] = useState(true);

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
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, textAlign: 'center', minHeight: 300 }}>
                        <Skeleton variant="circular" width={200} height={200} />
                        <Skeleton variant="text" width="80%" />
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, textAlign: 'center', minHeight: 300 }}>
                        <Skeleton variant="circular" width={200} height={200} />
                        <Skeleton variant="text" width="80%" />
                    </Paper>
                </Grid>
            </Grid>
        );
    }

    return (
        <Box sx={{ width: '100%' }}>
            <Grid container spacing={1.5}>
                {/* البطاقات الثلاث: الهوية، الوقت، وقت التشغيل - تنسيق واحد مدمج */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FingerprintIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                ID
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2" color="text.secondary">SN:</Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                                    {stats.serial_number ?? '—'}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2" color="text.secondary">UUID:</Typography>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                                    {stats.machine_uuid ?? '—'}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ScheduleIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                الوقت
                            </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                            {currentTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccessTimeIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                وقت التشغيل
                            </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                            {formatUptime(stats.uptime_seconds)}
                        </Typography>
                    </Paper>
                </Grid>

                {/* الصف الأول - العدادات (الأولوية الأعلى) */}
                <Grid item xs={12} sm={6} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        textAlign: 'center',
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        minHeight: { xs: 180, sm: 200 }
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <ComputerIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                المعالج
                            </Typography>
                        </Box>
                        <Gauge 
                            value={stats.cpu_usage} 
                            unit="%" 
                        />
                        {stats.cpu_temp != null && (
                            <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: 0.5, 
                                mt: 0.5 
                            }}>
                                <ThermostatIcon sx={{ 
                                    fontSize: 18, 
                                    color: stats.cpu_temp > 80 ? 'error.main' : stats.cpu_temp > 60 ? 'warning.main' : 'success.main' 
                                }} />
                                <Typography 
                                    variant="body2" 
                                    sx={{ 
                                        fontFamily: 'monospace', 
                                        fontWeight: 'bold',
                                        color: stats.cpu_temp > 80 ? 'error.main' : stats.cpu_temp > 60 ? 'warning.main' : 'success.main'
                                    }}
                                >
                                    {stats.cpu_temp}°C
                                </Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        textAlign: 'center',
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        minHeight: { xs: 180, sm: 200 },
                        position: 'relative'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <MemoryIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                الذاكرة
                            </Typography>
                        </Box>
                        <Gauge 
                            value={stats.memory_usage} 
                            unit="%" 
                        />
                        
                        {/* زر تحرير الذاكرة */}
                        <Box sx={{ 
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            left: 8
                        }}>
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
                                            headers: { 'Authorization': 'Basic ' + auth }
                                        });
                                        
                                        if (response.ok) {
                                            const result = await response.json();
                                            let message = result.message || 'تم تحرير الذاكرة بنجاح';
                                            
                                            // إضافة تفاصيل إضافية إذا كانت متوفرة
                                            if (result.freed && result.freed > 0) {
                                                message = `${result.message} (من ${result.memory_before?.toFixed(1)}% إلى ${result.memory_after?.toFixed(1)}%)`;
                                            }
                                            
                                            setSnackbar({
                                                open: true,
                                                message: message,
                                                severity: 'success'
                                            });
                                        } else {
                                            throw new Error('فشل في تحرير الذاكرة');
                                        }
                                    } catch (error) {
                                        setSnackbar({
                                            open: true,
                                            message: 'فشل في تحرير الذاكرة: ' + error.message,
                                            severity: 'error'
                                        });
                                    } finally {
                                        setIsClearing(false);
                                    }
                                }}
                                sx={{ 
                                    py: 0.5,
                                    minWidth: 'auto',
                                    width: '100%'
                                }}
                            >
                                {isClearing ? 'جارٍ التحرير...' : 'تحرير الذاكرة'}
                            </Button>
                        </Box>
                    </Paper>
                </Grid>
                
                <Grid item xs={12} sm={6} md={4}>
                    <Paper sx={{ 
                        p: 1.5, 
                        textAlign: 'center',
                        borderRadius: 2,
                        boxShadow: `0 2px 10px rgba(0,0,0,0.1)`,
                        minHeight: { xs: 180, sm: 200 }
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                            <StorageIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                                التخزين
                            </Typography>
                        </Box>
                        <Gauge 
                            value={stats.disk_usage} 
                            unit="%" 
                        />
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
        </Box>
    );
};

export default SystemMonitor; 