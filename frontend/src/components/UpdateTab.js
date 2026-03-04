import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, Button, Paper, CircularProgress, Alert,
    LinearProgress, Chip, Divider, List, ListItem, ListItemIcon,
    ListItemText, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
    SystemUpdateAlt as UpdateIcon,
    CheckCircle as CheckIcon,
    Error as ErrorIcon,
    NewReleases as NewReleasesIcon,
    Refresh as RefreshIcon,
    Download as DownloadIcon,
    Info as InfoIcon,
    Schedule as ScheduleIcon
} from '@mui/icons-material';

const STEP_LABELS = {
    git_fetch: 'جلب التحديثات من المستودع',
    git_pull: 'تنزيل الملفات الجديدة',
    pip_install: 'تثبيت مكتبات Python',
    pip_warning: 'تحذير مكتبات Python',
    npm_install: 'تثبيت حزم الواجهة الأمامية',
    npm_build: 'بناء الواجهة الأمامية',
    quran_build: 'بناء تطبيق القرآن الكريم',
    restart: 'إعادة تشغيل النظام',
    done: 'اكتمال التحديث',
    complete: 'تم التحديث بنجاح',
};

const UpdateTab = ({ auth }) => {
    const [currentVersion, setCurrentVersion] = useState('');
    const [checking, setChecking] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [updateStatus, setUpdateStatus] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);

    const headers = { 'Authorization': `Basic ${auth}` };

    useEffect(() => {
        fetch('/api/system/version')
            .then(r => r.json())
            .then(d => setCurrentVersion(d.version || ''))
            .catch(() => {});
    }, []);

    const checkForUpdate = useCallback(async () => {
        setChecking(true);
        setError(null);
        try {
            const res = await fetch('/api/system/check-update', { headers });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            }
            setUpdateInfo(data);
        } catch (e) {
            setError('فشل الاتصال بالخادم');
        } finally {
            setChecking(false);
        }
    }, [auth]);

    const pollUpdateStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/system/update-status', { headers });
            const data = await res.json();
            setUpdateStatus(data);

            if (data.status === 'success' || data.status === 'error' || data.status === 'idle') {
                if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                }
                if (data.status === 'success') {
                    setUpdating(false);
                }
                if (data.status === 'error') {
                    setUpdating(false);
                    setError(data.error || data.message);
                }
            }
        } catch {
            // الخادم قد يكون يعيد التشغيل
        }
    }, [auth]);

    const startUpdate = async () => {
        setShowConfirm(false);
        setUpdating(true);
        setError(null);
        setUpdateStatus(null);
        try {
            const res = await fetch('/api/system/update', {
                method: 'POST',
                headers,
            });
            const data = await res.json();
            if (data.status === 'error') {
                setError(data.message);
                setUpdating(false);
                return;
            }
            pollRef.current = setInterval(pollUpdateStatus, 1500);
        } catch (e) {
            setError('فشل بدء التحديث');
            setUpdating(false);
        }
    };

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const isUpdateInProgress = updating || (updateStatus && updateStatus.status === 'updating');

    return (
        <Box sx={{ p: 3, maxWidth: 700 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UpdateIcon color="primary" /> تحديث النظام
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                فحص وتنزيل تحديثات النظام من مستودع GitHub.
            </Typography>

            {/* الإصدار الحالي */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InfoIcon color="action" fontSize="small" />
                        <Typography variant="body1" fontWeight={600}>الإصدار الحالي</Typography>
                    </Box>
                    <Chip
                        label={`v${currentVersion}`}
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 700, fontSize: '0.9rem' }}
                    />
                </Box>
            </Paper>

            {/* زر فحص التحديثات */}
            {!isUpdateInProgress && (
                <Button
                    variant="contained"
                    startIcon={checking ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
                    onClick={checkForUpdate}
                    disabled={checking}
                    sx={{ mb: 3 }}
                    fullWidth
                >
                    {checking ? 'جاري البحث عن تحديثات...' : 'البحث عن تحديث'}
                </Button>
            )}

            {error && !isUpdateInProgress && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* نتيجة الفحص */}
            {updateInfo && !isUpdateInProgress && (
                <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
                    {updateInfo.has_update ? (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <NewReleasesIcon color="warning" />
                                <Typography variant="subtitle1" fontWeight={700} color="warning.main">
                                    يتوفر تحديث جديد!
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                                <Chip
                                    label={`الحالي: v${updateInfo.current_version}`}
                                    size="small"
                                    variant="outlined"
                                />
                                <Typography variant="body2" sx={{ alignSelf: 'center' }}>←</Typography>
                                <Chip
                                    label={`الجديد: ${updateInfo.latest_version}`}
                                    size="small"
                                    color="success"
                                />
                            </Box>
                            {updateInfo.release_name && (
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {updateInfo.release_name}
                                </Typography>
                            )}
                            {updateInfo.published_at && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                                    <ScheduleIcon fontSize="inherit" />
                                    {new Date(updateInfo.published_at).toLocaleDateString('ar-SA', {
                                        year: 'numeric', month: 'long', day: 'numeric'
                                    })}
                                </Typography>
                            )}
                            {updateInfo.release_notes && (
                                <>
                                    <Divider sx={{ my: 1.5 }} />
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
                                        {updateInfo.release_notes}
                                    </Typography>
                                </>
                            )}
                            <Divider sx={{ my: 2 }} />
                            <Button
                                variant="contained"
                                color="success"
                                startIcon={<DownloadIcon />}
                                onClick={() => setShowConfirm(true)}
                                fullWidth
                                size="large"
                            >
                                تنزيل وتثبيت التحديث
                            </Button>
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckIcon color="success" />
                            <Typography variant="body1" color="success.main" fontWeight={600}>
                                النظام محدّث — أنت تستخدم أحدث إصدار ({updateInfo.current_version})
                            </Typography>
                        </Box>
                    )}
                </Paper>
            )}

            {/* شريط تقدم التحديث */}
            {isUpdateInProgress && updateStatus && (
                <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <CircularProgress size={20} />
                        <Typography variant="subtitle1" fontWeight={700}>
                            جاري التحديث...
                        </Typography>
                    </Box>

                    <LinearProgress
                        variant="determinate"
                        value={updateStatus.progress || 0}
                        sx={{ height: 10, borderRadius: 5, mb: 2 }}
                    />

                    <Typography variant="body2" fontWeight={500} sx={{ mb: 2 }}>
                        {updateStatus.message || 'جاري التحضير...'}
                    </Typography>

                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        التقدم: {updateStatus.progress || 0}%
                    </Typography>

                    {updateStatus.steps && updateStatus.steps.length > 0 && (
                        <List dense sx={{ bgcolor: 'grey.50', borderRadius: 1, mt: 1 }}>
                            {updateStatus.steps.map((step, idx) => (
                                <ListItem key={idx} sx={{ py: 0.25 }}>
                                    <ListItemIcon sx={{ minWidth: 28 }}>
                                        {idx === updateStatus.steps.length - 1
                                            ? <CircularProgress size={14} />
                                            : <CheckIcon color="success" sx={{ fontSize: 16 }} />
                                        }
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={STEP_LABELS[step.step] || step.step}
                                        primaryTypographyProps={{ variant: 'caption' }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Paper>
            )}

            {/* نتيجة التحديث */}
            {updateStatus && updateStatus.status === 'success' && (
                <Alert severity="success" sx={{ mb: 2 }} icon={<CheckIcon />}>
                    <Typography variant="body2" fontWeight={600}>{updateStatus.message}</Typography>
                    {updateStatus.new_version && (
                        <Typography variant="caption">الإصدار الجديد: {updateStatus.new_version}</Typography>
                    )}
                </Alert>
            )}

            {updateStatus && updateStatus.status === 'error' && (
                <Alert severity="error" sx={{ mb: 2 }} icon={<ErrorIcon />}>
                    <Typography variant="body2" fontWeight={600}>{updateStatus.message}</Typography>
                </Alert>
            )}

            {/* حوار التأكيد */}
            <Dialog open={showConfirm} onClose={() => setShowConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <UpdateIcon color="primary" /> تأكيد التحديث
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                        هل تريد تحديث النظام إلى الإصدار <strong>{updateInfo?.latest_version}</strong>؟
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        سيتم تنزيل الملفات الجديدة وإعادة بناء الواجهة وإعادة تشغيل النظام. قد تستغرق العملية عدة دقائق.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setShowConfirm(false)}>إلغاء</Button>
                    <Button variant="contained" color="success" onClick={startUpdate} startIcon={<DownloadIcon />}>
                        بدء التحديث
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default UpdateTab;
