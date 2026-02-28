import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, CircularProgress, Alert, Slider, Grid, ToggleButtonGroup, ToggleButton, Divider, Tabs, Tab } from '@mui/material';
import { CloudUpload as CloudUploadIcon, Save as SaveIcon, ColorLens, Image as ImageIcon, AdminPanelSettings as AdminPanelIcon, TextFields as TextFieldsIcon } from '@mui/icons-material';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import NetworkTab from './NetworkTab';

const SettingsManager = ({ auth, setAuth }) => {
    const [settingsTab, setSettingsTab] = useState(0);
    const [settings, setSettings] = useState({ 
        welcome_message: '', header_color: '#ffffff', welcome_font_size: 48,
        welcome_font_color: '#FFFFFF', header_background_type: 'color', header_color_opacity: 1.0
    });
    const [logoFile, setLogoFile] = useState(null);
    const [headerBgFile, setHeaderBgFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // إدارة لوحة التحكم: بيانات الدخول
    const [adminUsername, setAdminUsername] = useState('');
    const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
    const [adminNewUsername, setAdminNewUsername] = useState('');
    const [adminNewPassword, setAdminNewPassword] = useState('');
    const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
    const [adminCredLoading, setAdminCredLoading] = useState(false);
    const [adminCredSaving, setAdminCredSaving] = useState(false);
    const [adminCredError, setAdminCredError] = useState(null);
    const [adminCredSuccess, setAdminCredSuccess] = useState(false);

    useEffect(() => {
        fetch('/api/settings/')
            .then(res => res.json())
            .then(data => {
                setSettings(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching settings:", err);
                setError('Failed to load settings.');
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!auth) return;
        setAdminCredLoading(true);
        fetch('/api/admin-credentials/', { headers: { 'Authorization': `Basic ${auth}` } })
            .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load')))
            .then(data => {
                setAdminUsername(data.username || '');
                setAdminCredLoading(false);
            })
            .catch(() => setAdminCredLoading(false));
    }, [auth]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSliderChange = (name, newValue) => {
        setSettings(prev => ({ ...prev, [name]: newValue }));
    };

    const handleFileChange = (e, fileType) => {
        const file = e.target.files[0];
        if (fileType === 'logo') setLogoFile(file);
        if (fileType === 'headerBg') setHeaderBgFile(file);
    };

    const uploadFile = async (file) => {
        if (!file) return null;
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch('/api/upload-image/', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` },
                body: formData,
            });
            if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
            const data = await response.json();
            return data.image_url;
        } catch (err) {
            throw err; // Re-throw to be caught by handleSave
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const newLogoUrl = await uploadFile(logoFile);
            const newHeaderBgUrl = await uploadFile(headerBgFile);

            const settingsToUpdate = {
                ...settings,
                logo_url: newLogoUrl ?? settings.logo_url,
                header_background_image_url: newHeaderBgUrl ?? settings.header_background_image_url,
            };
            
            const response = await fetch('/api/settings/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(settingsToUpdate),
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to save settings');
            }
            const updatedSettings = await response.json();
            setSettings(updatedSettings);
            setLogoFile(null);
            setHeaderBgFile(null);
            setSuccess(true);
        } catch (err) {
            setError(`Operation failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    async function handleSaveAdminCredentials() {
        setAdminCredError(null);
        setAdminCredSuccess(false);
        if (adminNewPassword && adminNewPassword !== adminConfirmPassword) {
            setAdminCredError('كلمة المرور الجديدة وتأكيدها غير متطابقتين.');
            return;
        }
        setAdminCredSaving(true);
        try {
            const body = {
                current_password: adminCurrentPassword.trim() || null,
                new_username: adminNewUsername.trim() || null,
                new_password: adminNewPassword.trim() || null,
            };
            const res = await fetch('/api/admin-credentials/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.detail || 'فشل في تحديث البيانات');
            }
            setAdminCredSuccess(true);
            setAdminCurrentPassword('');
            setAdminNewUsername('');
            setAdminNewPassword('');
            setAdminConfirmPassword('');
            if (data.username) setAdminUsername(data.username);
            if (setAuth) setAuth(null);
        } catch (err) {
            setAdminCredError(err.message || 'حدث خطأ.');
        } finally {
            setAdminCredSaving(false);
        }
    }

    if (loading) return <CircularProgress />;

    return (
        <Paper sx={{ width: '100%' }}>
            <Tabs
                value={settingsTab}
                onChange={(e, newValue) => setSettingsTab(newValue)}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab label="ضبط الرئيسية" />
                <Tab label="إدارة لوحة التحكم" icon={<AdminPanelIcon />} iconPosition="start" />
                <Tab label="الشبكة" />
            </Tabs>

            {/* تاب ضبط الرئيسية */}
            {settingsTab === 0 && (
                <Box sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>ضبط الوجهة الرئيسية للمنصة</Typography>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {success && <Alert severity="success" sx={{ mb: 2 }}>تم حفظ الإعدادات بنجاح.</Alert>}
                    <Box component="form" noValidate autoComplete="off">
                        <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>محتوى الهيدر</Typography>
                        <TextField label="رسالة الترحيب" name="welcome_message" fullWidth margin="dense" value={settings.welcome_message || ''} onChange={handleInputChange}/>
                        <Grid container spacing={2} alignItems="center" sx={{ mt: 0, mb: 1 }}>
                            <Grid item xs={12} sm={6}>
                                <Typography gutterBottom>لون خط الترحيب</Typography>
                                <TextField type="color" name="welcome_font_color" value={settings.welcome_font_color || '#FFFFFF'} onChange={handleInputChange} fullWidth />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography gutterBottom>حجم خط الترحيب ({settings.welcome_font_size || 48}px)</Typography>
                                <Slider name="welcome_font_size" value={settings.welcome_font_size || 48} onChange={(e, val) => handleSliderChange('welcome_font_size', val)} step={2} marks min={24} max={72} />
                            </Grid>
                        </Grid>
                        <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ mt: 1 }}>
                            تحميل شعار
                            <input type="file" hidden onChange={(e) => handleFileChange(e, 'logo')} accept="image/*" />
                        </Button>
                        {logoFile && <Typography variant="body2" sx={{ display: 'inline', ml: 2 }}>{logoFile.name}</Typography>}

                        <Divider sx={{ my: 3 }} />

                        <Typography variant="subtitle1" sx={{ mb: 1 }}>خلفية الهيدر</Typography>
                        <ToggleButtonGroup color="primary" value={settings.header_background_type} exclusive onChange={(e, val) => val && handleInputChange({ target: { name: 'header_background_type', value: val }})} sx={{ mb: 2 }}>
                            <ToggleButton value="color"><ColorLens sx={{ mr: 1 }} /> لون</ToggleButton>
                            <ToggleButton value="image"><ImageIcon sx={{ mr: 1 }} /> صورة</ToggleButton>
                        </ToggleButtonGroup>

                        {settings.header_background_type === 'color' && (
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={6}>
                                    <Typography gutterBottom>لون الخلفية</Typography>
                                    <TextField type="color" name="header_color" value={settings.header_color || '#1976d2'} onChange={handleInputChange} fullWidth />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography gutterBottom>شفافية اللون</Typography>
                                    <Slider name="header_color_opacity" value={settings.header_color_opacity || 1} onChange={(e, val) => handleSliderChange('header_color_opacity', val)} step={0.1} min={0} max={1} />
                                </Grid>
                            </Grid>
                        )}

                        {settings.header_background_type === 'image' && (
                            <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ mt: 1, width: '100%' }}>
                                تحميل صورة خلفية
                                <input type="file" hidden onChange={(e) => handleFileChange(e, 'headerBg')} accept="image/*" />
                            </Button>
                        )}
                        {headerBgFile && <Typography variant="body2" sx={{ mt: 1 }}>{headerBgFile.name}</Typography>}

                        <Divider sx={{ my: 3 }} />

                        {/* قسم النص المتحرك */}
                        <Box sx={{ mb: 3, p: 2.5, borderRadius: '12px', border: '1px solid', borderColor: settings.marquee_enabled ? 'primary.main' : 'divider', bgcolor: settings.marquee_enabled ? 'rgba(25,118,210,0.04)' : 'transparent', transition: 'all 0.3s' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <TextFieldsIcon color={settings.marquee_enabled ? 'primary' : 'disabled'} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>نص متحرك (Marquee)</Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={!!settings.marquee_enabled}
                                            onChange={(e) => setSettings(prev => ({ ...prev, marquee_enabled: e.target.checked }))}
                                            color="primary"
                                        />
                                    }
                                    label={settings.marquee_enabled ? 'مفعّل' : 'معطّل'}
                                    labelPlacement="start"
                                    sx={{ mr: 0 }}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                نص يتحرك أفقياً في الواجهة الأمامية - يظهر في منطقة قسم التطبيقات عند إخفائها
                            </Typography>
                            <TextField
                                label="النص المتحرك"
                                name="marquee_text"
                                fullWidth
                                multiline
                                rows={2}
                                margin="dense"
                                value={settings.marquee_text || ''}
                                onChange={handleInputChange}
                                disabled={!settings.marquee_enabled}
                                placeholder="أدخل النص الذي تريد عرضه بشكل متحرك..."
                                sx={{ mb: 2 }}
                            />
                            <Typography gutterBottom>حجم الخط ({settings.marquee_font_size || 18}px)</Typography>
                            <Slider
                                name="marquee_font_size"
                                value={settings.marquee_font_size || 18}
                                onChange={(e, val) => handleSliderChange('marquee_font_size', val)}
                                step={1}
                                marks={[
                                    { value: 12, label: '12' },
                                    { value: 18, label: '18' },
                                    { value: 24, label: '24' },
                                    { value: 32, label: '32' },
                                    { value: 48, label: '48' }
                                ]}
                                min={12}
                                max={48}
                                disabled={!settings.marquee_enabled}
                            />
                            {/* معاينة النص المتحرك */}
                            {settings.marquee_enabled && settings.marquee_text && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: '#0f172a', borderRadius: '12px', overflow: 'hidden' }}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', mb: 1, display: 'block' }}>معاينة:</Typography>
                                    <Box sx={{
                                        overflow: 'hidden', whiteSpace: 'nowrap',
                                        '@keyframes marqueePreview': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(100%)' } }
                                    }}>
                                        <Typography sx={{
                                            display: 'inline-block',
                                            color: '#e2e8f0',
                                            fontSize: `${settings.marquee_font_size || 18}px`,
                                            fontWeight: 600,
                                            animation: 'marqueePreview 8s linear infinite'
                                        }}>
                                            {settings.marquee_text}
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                        </Box>

                        <Divider sx={{ my: 3 }} />

                        <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}>
                            {saving ? 'جاري الحفظ...' : 'حفظ كل التغييرات'}
                        </Button>
                    </Box>
                </Box>
            )}

            {/* تاب الشبكة */}
            {settingsTab === 2 && (
                <Box sx={{ p: 3 }}>
                    <NetworkTab auth={auth} />
                </Box>
            )}

            {/* تاب إدارة لوحة التحكم */}
            {settingsTab === 1 && (
                <Box sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AdminPanelIcon color="primary" /> إدارة لوحة التحكم
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        تغيير اسم المستخدم أو كلمة المرور المستخدمة للدخول إلى لوحة التحكم.
                    </Typography>
                    {adminCredLoading && <CircularProgress size={24} sx={{ mb: 2 }} />}
                    {!adminCredLoading && (
                        <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>اسم المستخدم الحالي: <strong>{adminUsername || '—'}</strong></Typography>
                            <TextField
                                label="كلمة المرور الحالية (اختياري)"
                                type="password"
                                fullWidth
                                margin="dense"
                                value={adminCurrentPassword}
                                onChange={(e) => setAdminCurrentPassword(e.target.value)}
                                placeholder="للتحقق عند الرغبة"
                                sx={{ mb: 1 }}
                            />
                            <TextField
                                label="اسم المستخدم الجديد (اختياري)"
                                fullWidth
                                margin="dense"
                                value={adminNewUsername}
                                onChange={(e) => setAdminNewUsername(e.target.value)}
                                placeholder={adminUsername || 'admin'}
                                sx={{ mb: 1 }}
                            />
                            <TextField
                                label="كلمة المرور الجديدة (اختياري)"
                                type="password"
                                fullWidth
                                margin="dense"
                                value={adminNewPassword}
                                onChange={(e) => setAdminNewPassword(e.target.value)}
                                sx={{ mb: 1 }}
                            />
                            <TextField
                                label="تأكيد كلمة المرور الجديدة"
                                type="password"
                                fullWidth
                                margin="dense"
                                value={adminConfirmPassword}
                                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                                sx={{ mb: 2 }}
                            />
                            {adminCredError && <Alert severity="error" sx={{ mb: 2 }}>{adminCredError}</Alert>}
                            {adminCredSuccess && <Alert severity="success" sx={{ mb: 2 }}>تم تحديث بيانات الدخول. يرجى تسجيل الدخول مرة أخرى بالبيانات الجديدة.</Alert>}
                            <Button
                                variant="outlined"
                                color="primary"
                                disabled={adminCredSaving}
                                onClick={handleSaveAdminCredentials}
                                startIcon={adminCredSaving ? <CircularProgress size={20} /> : <SaveIcon />}
                            >
                                {adminCredSaving ? 'جاري الحفظ...' : 'حفظ بيانات الدخول'}
                            </Button>
                        </Box>
                    )}
                </Box>
            )}
        </Paper>
    );
};

export default SettingsManager; 