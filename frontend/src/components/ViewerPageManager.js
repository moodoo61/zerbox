import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Switch, FormControlLabel, TextField, Button,
    Grid, Card, CardContent, Alert, CircularProgress, Chip,
    Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText,
    ListItemIcon, Divider, Slider
} from '@mui/material';
import {
    Save as SaveIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    LiveTv as LiveTvIcon,
    Launch as LaunchIcon,
    Refresh as RefreshIcon,
    CloudUpload as CloudUploadIcon
} from '@mui/icons-material';

const ViewerPageManager = ({ auth }) => {
    const [settings, setSettings] = useState({
        is_enabled: false,
        page_title: 'البث المباشر',
        page_description: 'شاهد القنوات المباشرة',
        page_logo_url: '',
        show_channel_list: true,
        show_viewer_count: true,
        default_channel: '',
        auto_play: false,
        show_controls: true,
        streaming_format: 'hls',
        enable_fullscreen: true,
        enable_volume_control: true,
        custom_css: '',
        buffer_size: 30,
        max_buffer_length: 60,
        live_back_buffer_length: 30,
        show_matches_table: false
    });

    const [channels, setChannels] = useState([]);
    const [logoFile, setLogoFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const fetchSettings = useCallback(async () => {
        try {
            const response = await fetch('/api/viewer-page/settings', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(data);
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
        setSettings(prev => ({ ...prev, [key]: value }));
        if (key === 'is_enabled') {
            try {
                await fetch('/api/viewer-page/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${auth}`
                    },
                    body: JSON.stringify({ ...settings, [key]: value })
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
                ...settings,
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
                if (data) setSettings(data);
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

    const getViewerPageUrl = () => `${window.location.origin}/mubasher`;
    const openViewerPage = () => window.open(getViewerPageUrl(), '_blank');

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ pb: 10 }}>
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* بطاقة التفعيل */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">تفعيل صفحة المشاهدة للزوار</Typography>
                        <Chip
                            icon={settings.is_enabled ? <VisibilityIcon /> : <VisibilityOffIcon />}
                            label={settings.is_enabled ? 'مفعل' : 'معطل'}
                            color={settings.is_enabled ? 'success' : 'default'}
                            size="small"
                        />
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={settings.is_enabled}
                                        onChange={(e) => handleSettingChange('is_enabled', e.target.checked)}
                                    />
                                }
                                label={settings.is_enabled ? 'الصفحة مفعلة' : 'الصفحة معطلة'}
                            />
                            {settings.is_enabled && (
                                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    {getViewerPageUrl()}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={handleRefresh}
                                disabled={loading}
                            >
                                تحديث
                            </Button>
                            {settings.is_enabled && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<LaunchIcon />}
                                    onClick={openViewerPage}
                                >
                                    معاينة الصفحة
                                </Button>
                            )}
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {/* الإعدادات الأساسية */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>الإعدادات الأساسية</Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
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
                            <FormControl fullWidth size="small">
                                <InputLabel>القناة الافتراضية</InputLabel>
                                <Select
                                    value={settings.default_channel || ''}
                                    onChange={(e) => handleSettingChange('default_channel', e.target.value)}
                                    label="القناة الافتراضية"
                                >
                                    <MenuItem value=""><em>بدون قناة افتراضية</em></MenuItem>
                                    {channels.map((ch) => (
                                        <MenuItem key={ch.id} value={ch.name}>{ch.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
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
                                control={<Switch checked={settings.show_channel_list} onChange={(e) => handleSettingChange('show_channel_list', e.target.checked)} />}
                                label="عرض قائمة القنوات"
                            />
                            <FormControlLabel
                                control={<Switch checked={settings.show_viewer_count} onChange={(e) => handleSettingChange('show_viewer_count', e.target.checked)} />}
                                label="عرض عدد المشاهدين"
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
                        <Grid item xs={12} md={8}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                <FormControlLabel
                                    control={<Switch checked={settings.auto_play} onChange={(e) => handleSettingChange('auto_play', e.target.checked)} />}
                                    label="تشغيل تلقائي"
                                />
                                <FormControlLabel
                                    control={<Switch checked={settings.show_controls} onChange={(e) => handleSettingChange('show_controls', e.target.checked)} />}
                                    label="أدوات التحكم"
                                />
                                <FormControlLabel
                                    control={<Switch checked={settings.enable_fullscreen} onChange={(e) => handleSettingChange('enable_fullscreen', e.target.checked)} />}
                                    label="شاشة كاملة"
                                />
                                <FormControlLabel
                                    control={<Switch checked={settings.enable_volume_control} onChange={(e) => handleSettingChange('enable_volume_control', e.target.checked)} />}
                                    label="التحكم بالصوت"
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* التحكم في البافر */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>التحكم في البافر</Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={4}>
                            <Typography variant="body2" gutterBottom>حجم البافر (ث): {settings.buffer_size || 30}</Typography>
                            <Slider
                                value={settings.buffer_size || 30}
                                onChange={(e, val) => handleSettingChange('buffer_size', val)}
                                min={5}
                                max={120}
                                step={5}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Typography variant="body2" gutterBottom>الحد الأقصى (ث): {settings.max_buffer_length || 60}</Typography>
                            <Slider
                                value={settings.max_buffer_length || 60}
                                onChange={(e, val) => handleSettingChange('max_buffer_length', val)}
                                min={10}
                                max={300}
                                step={10}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Typography variant="body2" gutterBottom>البافر الخلفي (ث): {settings.live_back_buffer_length || 30}</Typography>
                            <Slider
                                value={settings.live_back_buffer_length || 30}
                                onChange={(e, val) => handleSettingChange('live_back_buffer_length', val)}
                                min={0}
                                max={120}
                                step={5}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                    </Grid>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        قيم أصغر = تأخير أقل. للبث المباشر يُنصح 15–30 ثانية.
                    </Typography>
                </CardContent>
            </Card>

            {/* جدول مباريات اليوم */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">جدول مباريات اليوم</Typography>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={!!settings.show_matches_table}
                                    onChange={(e) => handleSettingChange('show_matches_table', e.target.checked)}
                                />
                            }
                            label={settings.show_matches_table ? 'مفعل' : 'معطل'}
                        />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        يظهر زر في صفحة المشاهدة لجدول مباريات اليوم. البيانات تُحدّث تلقائياً كل ساعة.
                    </Typography>
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
                        <List dense>
                            {channels.slice(0, 8).map((ch) => (
                                <ListItem key={ch.id} sx={{ py: 0.5 }}>
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <LiveTvIcon fontSize="small" color={ch.is_active ? 'success' : 'disabled'} />
                                    </ListItemIcon>
                                    <ListItemText primary={ch.name} secondary={ch.category || '—'} />
                                    <Chip label={ch.is_active ? 'نشط' : 'معطل'} size="small" color={ch.is_active ? 'success' : 'default'} />
                                </ListItem>
                            ))}
                            {channels.length > 8 && (
                                <ListItem><ListItemText primary={`و ${channels.length - 8} قنوات أخرى`} primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} /></ListItem>
                            )}
                        </List>
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
