import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Button,
    CircularProgress, Alert, Chip, IconButton, Tooltip, Grid
} from '@mui/material';
import {
    Apps as AppsIcon,
    Web as WebIcon,
    Gamepad as GamepadIcon,
    MusicNote as MusicNoteIcon,
    Photo as PhotoIcon,
    VideoLibrary as VideoLibraryIcon,
    School as SchoolIcon,
    Work as WorkIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    Refresh as RefreshIcon,
    PhoneAndroid as PhoneIcon
} from '@mui/icons-material';

const APP_BUTTONS = [
    { key: '\u0627\u0644\u062a\u0637\u0628\u064a\u0642\u0627\u062a', icon: AppsIcon, color: '#2196f3' },
    { key: '\u0627\u0644\u0645\u0648\u0627\u0642\u0639', icon: WebIcon, color: '#4caf50' },
    { key: '\u0627\u0644\u0623\u0644\u0639\u0627\u0628', icon: GamepadIcon, color: '#ff9800' },
    { key: '\u0627\u0644\u0645\u0648\u0633\u064a\u0642\u0649', icon: MusicNoteIcon, color: '#e91e63' },
    { key: '\u0627\u0644\u0635\u0648\u0631', icon: PhotoIcon, color: '#9c27b0' },
    { key: '\u0627\u0644\u0641\u064a\u062f\u064a\u0648', icon: VideoLibraryIcon, color: '#f44336' },
    { key: '\u0627\u0644\u062a\u0639\u0644\u064a\u0645', icon: SchoolIcon, color: '#3f51b5' },
    { key: '\u0627\u0644\u0639\u0645\u0644', icon: WorkIcon, color: '#795548' }
];

const AppsManager = ({ auth }) => {
    const [allHidden, setAllHidden] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/settings/', { headers: { 'Authorization': `Basic ${auth}` } });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            try {
                const parsed = JSON.parse(data.hidden_app_buttons || '[]');
                setAllHidden(Array.isArray(parsed) && parsed.length >= APP_BUTTONS.length);
            } catch {
                setAllHidden(false);
            }
            setError('');
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u062c\u0644\u0628 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a');
        } finally {
            setLoading(false);
        }
    }, [auth]);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const toggleAll = async () => {
        setSaving(true);
        const newHidden = allHidden ? [] : APP_BUTTONS.map(b => b.key);
        try {
            const res = await fetch('/api/settings/', {
                method: 'PUT', headers,
                body: JSON.stringify({ hidden_app_buttons: JSON.stringify(newHidden) })
            });
            if (!res.ok) throw new Error('Failed');
            setAllHidden(!allHidden);
            setSuccess(allHidden ? '\u062a\u0645 \u0625\u0638\u0647\u0627\u0631 \u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0632\u0631\u0627\u0631' : '\u062a\u0645 \u0625\u062e\u0641\u0627\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0632\u0631\u0627\u0631');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u062d\u0641\u0638 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ direction: 'rtl' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                        <AppsIcon sx={{ color: '#fff', fontSize: 26 }} />
                    </Box>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography variant="h5" sx={{ fontWeight: 700 }}>التطبيقات</Typography>
                            <Chip label="Soon" size="small" sx={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff', fontWeight: 700, fontSize: '0.7rem', height: 24 }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary">التحكم بأزرار التطبيقات في الواجهة الأمامية</Typography>
                    </Box>
                </Box>
                <Tooltip title="تحديث"><IconButton onClick={fetchSettings} disabled={loading}><RefreshIcon /></IconButton></Tooltip>
            </Box>

            {/* Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={4}>
                    <Card sx={{ bgcolor: allHidden ? '#fef2f2' : '#f0fdf4', border: allHidden ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
                            {allHidden
                                ? <VisibilityOffIcon sx={{ fontSize: 36, color: '#dc2626', mb: 0.5 }} />
                                : <VisibilityIcon sx={{ fontSize: 36, color: '#16a34a', mb: 0.5 }} />}
                            <Typography variant="body2" sx={{ fontWeight: 700, color: allHidden ? '#dc2626' : '#16a34a' }}>
                                {allHidden ? 'الأزرار مخفية' : 'الأزرار ظاهرة'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={4}>
                    <Card sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 800, color: '#2563eb' }}>{APP_BUTTONS.length}</Typography>
                            <Typography variant="caption" sx={{ color: '#1d4ed8' }}>عدد الأزرار</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ bgcolor: '#faf5ff', border: '1px solid #e9d5ff' }}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
                            <PhoneIcon sx={{ fontSize: 32, color: '#7c3aed', mb: 0.5 }} />
                            <Typography variant="caption" sx={{ color: '#6d28d9', display: 'block' }}>تطبيق الهاتف قريبا</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

            {/* Preview + Toggle */}
            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>معاينة أزرار التطبيقات</Typography>
                        {loading ? <CircularProgress size={24} /> : (
                            <Button
                                variant="contained"
                                onClick={toggleAll}
                                disabled={saving}
                                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : allHidden ? <VisibilityIcon /> : <VisibilityOffIcon />}
                                sx={{
                                    borderRadius: '12px', fontWeight: 700, px: 3, py: 1,
                                    background: allHidden
                                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    '&:hover': {
                                        background: allHidden
                                            ? 'linear-gradient(135deg, #16a34a, #15803d)'
                                            : 'linear-gradient(135deg, #dc2626, #b91c1c)'
                                    }
                                }}
                            >
                                {allHidden ? 'إظهار الجميع' : 'إخفاء الجميع'}
                            </Button>
                        )}
                    </Box>

                    {/* Preview Grid */}
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(4, 1fr)', sm: 'repeat(8, 1fr)' },
                        gap: 2, p: 3,
                        bgcolor: '#0f172a', borderRadius: '16px',
                        opacity: allHidden ? 0.35 : 1,
                        transition: 'opacity 0.4s',
                        position: 'relative'
                    }}>
                        {allHidden && (
                            <Box sx={{
                                position: 'absolute', inset: 0, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', zIndex: 2,
                                borderRadius: '16px'
                            }}>
                                <Chip label="مخفي من الواجهة" sx={{
                                    bgcolor: 'rgba(239,68,68,0.9)', color: '#fff',
                                    fontWeight: 700, fontSize: '0.85rem', py: 2.5, px: 1
                                }} />
                            </Box>
                        )}
                        {APP_BUTTONS.map((app) => {
                            const IconComp = app.icon;
                            return (
                                <Box key={app.key} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.8 }}>
                                    <Box sx={{
                                        width: { xs: 48, sm: 56 }, height: { xs: 48, sm: 56 },
                                        borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        bgcolor: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.15)',
                                        transition: 'all 0.3s'
                                    }}>
                                        <IconComp sx={{ fontSize: { xs: 24, sm: 28 }, color: app.color }} />
                                    </Box>
                                    <Typography variant="caption" sx={{ color: '#cbd5e1', fontSize: '0.65rem', textAlign: 'center' }}>
                                        {app.key}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
};

export default AppsManager;
