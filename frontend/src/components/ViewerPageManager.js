import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Switch, FormControlLabel, TextField, Button,
    Grid, Card, CardContent, Alert, CircularProgress,
    Select, MenuItem, FormControl, InputLabel, Divider, Slider
} from '@mui/material';
import {
    Save as SaveIcon,
    LiveTv as LiveTvIcon,
    Launch as LaunchIcon,
    Refresh as RefreshIcon,
    CloudUpload as CloudUploadIcon
} from '@mui/icons-material';
import useMistStreamStatus from '../hooks/useMistStreamStatus';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundToStep = (value, step) => Math.round(value / step) * step;

const normalizeEssentialSettings = (source) => ({
    ...source,
    show_channel_list: true,
    show_controls: true,
    enable_fullscreen: true,
    enable_volume_control: true,
});

const mapBufferLevelToSettings = (level) => {
    const normalized = clamp(Number(level) || 50, 0, 100);
    const bufferSize = roundToStep(15 + (normalized / 100) * 45, 5);
    const maxBufferLength = roundToStep(bufferSize * 2.2, 10);
    const liveBackBufferLength = roundToStep(Math.max(10, bufferSize * 0.7), 5);
    return {
        buffer_size: bufferSize,
        max_buffer_length: maxBufferLength,
        live_back_buffer_length: liveBackBufferLength,
    };
};

const mapSettingsToBufferLevel = (settings) => {
    const bufferSize = Number(settings.buffer_size) || 30;
    return clamp(Math.round(((bufferSize - 15) / 45) * 100), 0, 100);
};

const ViewerPageManager = ({ auth }) => {
    useMistStreamStatus();

    const [settings, setSettings] = useState({
        is_enabled: false,
        page_title: 'البث المباشر',
        page_description: 'شاهد القنوات المباشرة',
        page_logo_url: '',
        show_channel_list: true,
        show_viewer_count: true,
        show_controls: true,
        streaming_format: 'hls',
        enable_fullscreen: true,
        enable_volume_control: true,
        custom_css: '',
        buffer_size: 30,
        max_buffer_length: 60,
        live_back_buffer_length: 30,
        show_matches_table: false,
        hidden_channels: '[]'
    });

    const [channels, setChannels] = useState([]);
    const [logoFile, setLogoFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const getChannelKey = useCallback((channel) => channel.stream_key || channel.name, []);
    const hiddenChannelKeys = useMemo(() => {
        try {
            const parsed = JSON.parse(settings.hidden_channels || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => String(item)).filter(Boolean);
        } catch {
            return [];
        }
    }, [settings.hidden_channels]);

    const fetchSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/viewer-page/settings', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(normalizeEssentialSettings(data));
            } else {
                throw new Error('فشل في جلب الإعدادات');
            }
        } catch (err) {
            console.error('خطأ في جلب الإعدادات:', err);
            setError('فشل في جلب الإعدادات');
        }
    }, [auth]);

    const fetchChannels = useCallback(async () => {
        try {
            const response = await fetch('/api/streaming/channels', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                const data = await response.json();
                setChannels(data);
            } else {
                throw new Error('فشل في جلب القنوات');
            }
        } catch (err) {
            console.error('خطأ في جلب القنوات:', err);
            setError('فشل في جلب القنوات');
        }
    }, [auth]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                await Promise.all([fetchSettings(), fetchChannels()]);
            } catch (err) {
                console.error('خطأ في تحميل البيانات:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [fetchSettings, fetchChannels]);

    const handleSettingChange = async (key, value) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        if (key === 'is_enabled') {
            try {
                const payload = normalizeEssentialSettings({ ...settings, [key]: value });
                await fetch('/api/viewer-page/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${auth}`
                    },
                    body: JSON.stringify(payload)
                });
                setMessage(value ? 'تم تفعيل صفحة المشاهدة' : 'تم تعطيل صفحة المشاهدة');
                setTimeout(() => setMessage(''), 3000);
            } catch (err) {
                console.error('خطأ في حفظ حالة التفعيل:', err);
            }
        }
    };

    const uploadLogoIfNeeded = async () => {
        if (!logoFile) return null;
        const formData = new FormData();
        formData.append('file', logoFile);
        const response = await fetch('/api/upload-image/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}` },
            body: formData,
        });
        if (!response.ok) {
            throw new Error('فشل في رفع الشعار');
        }
        const data = await response.json();
        return data.image_url;
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        setError('');
        try {
            const newLogoUrl = await uploadLogoIfNeeded();
            const payload = {
                ...normalizeEssentialSettings(settings),
                page_logo_url: newLogoUrl ?? settings.page_logo_url,
            };

            const response = await fetch('/api/viewer-page/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                setMessage('تم حفظ الإعدادات بنجاح');
                setTimeout(() => setMessage(''), 3000);
                setLogoFile(null);
                const data = await response.json().catch(() => null);
                if (data) setSettings(normalizeEssentialSettings(data));
            } else {
                throw new Error('فشل في حفظ الإعدادات');
            }
        } catch (err) {
            console.error('خطأ في حفظ الإعدادات:', err);
            setError(err.message || 'فشل في حفظ الإعدادات');
        } finally {
            setSaving(false);
        }
    };

    const handleRefresh = () => {
        setLoading(true);
        Promise.all([fetchSettings(), fetchChannels()]).finally(() => setLoading(false));
    };

    const handleToggleChannelVisibility = (channel, hidden) => {
        const key = getChannelKey(channel);
        const hiddenSet = new Set(hiddenChannelKeys);
        if (hidden) hiddenSet.add(key);
        else hiddenSet.delete(key);
        const nextHidden = Array.from(hiddenSet);
        setSettings((prev) => ({
            ...prev,
            hidden_channels: JSON.stringify(nextHidden),
        }));
    };

    const getViewerPageUrl = () => `${window.location.origin}/mubasher`;
    const openViewerPage = () => window.open(getViewerPageUrl(), '_blank');
    const bufferLevel = useMemo(() => mapSettingsToBufferLevel(settings), [settings.buffer_size]);
    const bufferProfileLabel = useMemo(() => {
        if (bufferLevel < 34) return 'تأخير أقل';
        if (bufferLevel < 67) return 'متوازن';
        return 'ثبات أعلى';
    }, [bufferLevel]);
    const handleBufferLevelChange = useCallback((_, value) => {
        const next = mapBufferLevelToSettings(value);
        setSettings((prev) => ({ ...prev, ...next }));
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: '15px', md: 3 } }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 10 }}>
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* الإعدادات الأساسية */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1.5,
                            mb: 2,
                        }}
                    >
                        <Typography variant="h6">الإعدادات الأساسية</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={handleRefresh}
                                disabled={loading}
                            >
                                تحديث
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<LaunchIcon />}
                                onClick={openViewerPage}
                                disabled={!settings.is_enabled}
                            >
                                معاينة الصفحة
                            </Button>
                        </Box>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.is_enabled}
                                            onChange={(e) => handleSettingChange('is_enabled', e.target.checked)}
                                        />
                                    }
                                    label={settings.is_enabled ? 'تفعيل صفحة المشاهدة للزوار — مفعلة' : 'تفعيل صفحة المشاهدة للزوار — معطلة'}
                                />
                                {settings.is_enabled && (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                        {getViewerPageUrl()}
                                    </Typography>
                                )}
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="عنوان الصفحة"
                                value={settings.page_title}
                                onChange={(e) => handleSettingChange('page_title', e.target.value)}
                                variant="outlined"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    component="label"
                                    startIcon={<CloudUploadIcon />}
                                    size="small"
                                >
                                    رفع شعار الصفحة
                                    <input
                                        type="file"
                                        hidden
                                        accept="image/*"
                                        onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                                    />
                                </Button>
                                {logoFile && (
                                    <Typography variant="caption" color="text.secondary">
                                        {logoFile.name}
                                    </Typography>
                                )}
                                {settings.page_logo_url && !logoFile && (
                                    <Typography variant="caption" color="text.secondary">
                                        شعار حالي مضبوط بالفعل
                                    </Typography>
                                )}
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="وصف الصفحة"
                                value={settings.page_description}
                                onChange={(e) => handleSettingChange('page_description', e.target.value)}
                                multiline
                                rows={2}
                                variant="outlined"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControlLabel
                                control={<Switch checked={settings.show_viewer_count} onChange={(e) => handleSettingChange('show_viewer_count', e.target.checked)} />}
                                label="عرض عدد المشاهدين"
                            />
                            <FormControlLabel
                                control={<Switch checked={!!settings.show_matches_table} onChange={(e) => handleSettingChange('show_matches_table', e.target.checked)} />}
                                label="إظهار زر جدول المباريات"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* إعدادات التشغيل والمشغل */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>إعدادات التشغيل والمشغل</Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>صيغة البث</InputLabel>
                                <Select
                                    value={settings.streaming_format}
                                    onChange={(e) => handleSettingChange('streaming_format', e.target.value)}
                                    label="صيغة البث"
                                >
                                    <MenuItem value="hls">HLS — البث المباشر</MenuItem>
                                    <MenuItem value="flv">FLV — بث سريع</MenuItem>
                                    <MenuItem value="mp4">MP4 — تشغيل مباشر</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* التحكم في البافر */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>استقرار البث</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        مؤشر واحد فقط: كلما رفعت القيمة زاد الثبات (بافر أكبر) وكلما خفضتها قل التأخير.
                    </Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="body2" gutterBottom>
                        مستوى الاستقرار: {bufferLevel}% ({bufferProfileLabel})
                    </Typography>
                    <Slider
                        value={bufferLevel}
                        onChange={handleBufferLevelChange}
                        min={0}
                        max={100}
                        step={5}
                        valueLabelDisplay="auto"
                        size="small"
                    />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            البافر: {settings.buffer_size || 30}ث
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            الحد الأقصى: {settings.max_buffer_length || 60}ث
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            الخلفي: {settings.live_back_buffer_length || 30}ث
                        </Typography>
                    </Box>
                </CardContent>
            </Card>

            {/* القنوات المتاحة + رابط الصفحة — بنفس أسلوب قسم القنوات في التاب الأول */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">القنوات المتاحة ({channels.length})</Typography>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    {channels.length > 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {channels.map((ch) => {
                                const sk = ch.stream_key || ch.name;
                                const hidden = hiddenChannelKeys.includes(sk);
                                return (
                                    <Box
                                        key={ch.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 2,
                                            px: 1.5,
                                            py: 1,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1.5,
                                            bgcolor: hidden ? 'action.hover' : 'background.paper',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                                            <LiveTvIcon fontSize="small" color={hidden ? 'disabled' : 'primary'} />
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                                    {ch.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {ch.category || 'بدون تصنيف'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    size="small"
                                                    checked={!hidden}
                                                    onChange={(e) => handleToggleChannelVisibility(ch, !e.target.checked)}
                                                />
                                            }
                                            label={!hidden ? 'ظاهر' : 'مخفي'}
                                            sx={{ m: 0 }}
                                        />
                                    </Box>
                                );
                            })}
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary">لا توجد قنوات. أضفها من تاب التفعيل والقنوات.</Typography>
                    )}
                </CardContent>
            </Card>

            {/* زر الحفظ ثابت في المنتصف أسفل الشاشة — بدون مستطيل */}
            <Box
                sx={{
                    position: 'sticky',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    py: 2,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10,
                    mt: 3
                }}
            >
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                >
                    {saving ? 'جاري الحفظ...' : 'حفظ جميع الإعدادات'}
                </Button>
            </Box>
        </Box>
    );
};

export default ViewerPageManager;
