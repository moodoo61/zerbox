import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, CircularProgress, Alert,
    Slider, Grid, ToggleButtonGroup, ToggleButton, Divider, Tabs, Tab,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Checkbox, Select, MenuItem, Dialog, DialogTitle, DialogContent,
    DialogActions, IconButton, Chip, FormControl, InputLabel, Tooltip,
    Collapse
} from '@mui/material';
import {
    CloudUpload as CloudUploadIcon, Save as SaveIcon, ColorLens,
    Image as ImageIcon, TextFields as TextFieldsIcon, Add as AddIcon,
    Edit as EditIcon, Delete as DeleteIcon, Security as SecurityIcon,
    Person as PersonIcon, KeyboardArrowDown, KeyboardArrowUp,
    AdminPanelSettings as AdminPanelIcon, Lock as LockIcon
} from '@mui/icons-material';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import NetworkTab from './NetworkTab';
import UpdateTab from './UpdateTab';

const SECTIONS = [
    { key: 'نظرة عامة', label: 'نظرة عامة', isParent: true },

    { key: 'الخدمات', label: 'الخدمات', isParent: true },
    { key: 'الخدمات > الخدمات الافتراضية', label: 'الخدمات الافتراضية', isChild: true },
    { key: 'الخدمات > الخدمات المخصصة', label: 'الخدمات المخصصة', isChild: true },
    { key: 'الخدمات > إحصائيات الخدمات', label: 'إحصائيات الخدمات', isChild: true },

    { key: 'البث المباشر', label: 'البث المباشر', isParent: true },
    { key: 'البث المباشر > إدارة القنوات', label: 'إدارة القنوات', isChild: true },
    { key: 'البث المباشر > صفحة المشاهدة', label: 'صفحة المشاهدة', isChild: true },

    { key: 'التطبيقات', label: 'التطبيقات', isParent: true },

    { key: 'الإشعارات', label: 'الإشعارات', isParent: true },

    { key: 'طلبات التوصيل', label: 'طلبات التوصيل', isParent: true },

    { key: 'الضبط', label: 'الضبط', isParent: true },
    { key: 'الضبط > عامة', label: 'عامة', isChild: true },
    { key: 'الضبط > الشبكة', label: 'الشبكة', isChild: true },
    { key: 'الضبط > إدارة الصلاحيات', label: 'إدارة الصلاحيات', isChild: true },
    { key: 'الضبط > التحديث', label: 'التحديث', isChild: true },
];

const ROLE_LABELS = { owner: 'مالك', manager: 'مدير', sub_manager: 'مدير فرعي' };
const ROLE_COLORS = { owner: 'error', manager: 'primary', sub_manager: 'default' };

function buildDefaultPermissions(level = 'write') {
    const perms = {};
    SECTIONS.forEach(s => { perms[s.key] = { visible: true, permission: level }; });
    return perms;
}

function parsePermissions(permsStr) {
    try {
        const p = typeof permsStr === 'string' ? JSON.parse(permsStr) : permsStr;
        if (p && typeof p === 'object') return p;
    } catch {}
    return buildDefaultPermissions('write');
}

function getMyVisibleSections(userInfo) {
    if (!userInfo || userInfo.role === 'owner') return SECTIONS;
    const myPerms = parsePermissions(userInfo.permissions);
    return SECTIONS.filter(section => {
        const p = myPerms[section.key];
        if (!p) return true;
        return p.visible !== false;
    });
}

const SettingsManager = ({ auth, setAuth, userInfo, setUserInfo }) => {
    const location = useLocation();
    const [settingsTab, setSettingsTab] = useState(() => location.state?.tab ?? 0);
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

    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState(null);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [dialogSaving, setDialogSaving] = useState(false);
    const [dialogError, setDialogError] = useState(null);

    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
    const [adminNewUsername, setAdminNewUsername] = useState('');
    const [adminNewPassword, setAdminNewPassword] = useState('');
    const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
    const [adminCredSaving, setAdminCredSaving] = useState(false);
    const [adminCredError, setAdminCredError] = useState(null);
    const [adminCredSuccess, setAdminCredSuccess] = useState(false);

    const [formUsername, setFormUsername] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState('manager');
    const [formPermissions, setFormPermissions] = useState(() => buildDefaultPermissions('write'));

    const currentRole = userInfo?.role || 'manager';
    const isOwner = currentRole === 'owner';
    const isManager = currentRole === 'manager';

    useEffect(() => {
        fetch('/api/settings/')
            .then(res => res.json())
            .then(data => { setSettings(data); setLoading(false); })
            .catch(() => { setError('Failed to load settings.'); setLoading(false); });
    }, []);

    const fetchUsers = useCallback(() => {
        if (!auth) return;
        setUsersLoading(true);
        setUsersError(null);
        fetch('/api/users/', { headers: { 'Authorization': `Basic ${auth}` } })
            .then(res => res.ok ? res.json() : Promise.reject(new Error('فشل تحميل المستخدمين')))
            .then(data => { setUsers(data); setUsersLoading(false); })
            .catch(err => { setUsersError(err.message); setUsersLoading(false); });
    }, [auth]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
        const response = await fetch('/api/upload-image/', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}` },
            body: formData,
        });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
        const data = await response.json();
        return data.image_url;
    };
    const handleSave = async () => {
        setSaving(true); setError(null); setSuccess(false);
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
            setLogoFile(null); setHeaderBgFile(null); setSuccess(true);
        } catch (err) { setError(`Operation failed: ${err.message}`); }
        finally { setSaving(false); }
    };

    async function handleSaveAdminCredentials() {
        setAdminCredError(null); setAdminCredSuccess(false);
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
            if (!res.ok) throw new Error(data.detail || 'فشل في تحديث البيانات');
            setAdminCredSuccess(true);
            setAdminCurrentPassword(''); setAdminNewUsername(''); setAdminNewPassword(''); setAdminConfirmPassword('');
            if (setAuth) setAuth(null);
        } catch (err) { setAdminCredError(err.message || 'حدث خطأ.'); }
        finally { setAdminCredSaving(false); }
    }

    const myVisibleSections = getMyVisibleSections(userInfo);

    function openAddDialog() {
        setFormUsername(''); setFormPassword('');
        setFormRole(isOwner ? 'manager' : 'sub_manager');
        const perms = {};
        myVisibleSections.forEach(s => { perms[s.key] = { visible: true, permission: 'write' }; });
        setFormPermissions(perms);
        setDialogError(null);
        setShowAddDialog(true);
    }
    function openEditDialog(user) {
        setEditingUser(user); setFormUsername(user.username); setFormPassword('');
        const existing = parsePermissions(user.permissions);
        const filtered = {};
        myVisibleSections.forEach(s => {
            filtered[s.key] = existing[s.key] || { visible: true, permission: 'write' };
        });
        setFormPermissions(filtered);
        setFormRole(user.role); setDialogError(null);
        setShowEditDialog(true);
    }

    function handleParentVisibleChange(parentKey, checked) {
        setFormPermissions(prev => {
            const next = { ...prev };
            next[parentKey] = { ...next[parentKey], visible: checked };
            myVisibleSections.filter(s => s.isChild && s.key.startsWith(parentKey + ' >')).forEach(child => {
                next[child.key] = { ...next[child.key], visible: checked };
            });
            return next;
        });
    }
    function handleChildVisibleChange(childKey, checked) {
        setFormPermissions(prev => ({
            ...prev,
            [childKey]: { ...prev[childKey], visible: checked }
        }));
    }
    function handlePermissionLevelChange(sectionKey, level) {
        setFormPermissions(prev => {
            const next = { ...prev };
            next[sectionKey] = { ...next[sectionKey], permission: level };
            if (myVisibleSections.find(s => s.key === sectionKey && s.isParent)) {
                myVisibleSections.filter(s => s.isChild && s.key.startsWith(sectionKey + ' >')).forEach(child => {
                    next[child.key] = { ...next[child.key], permission: level };
                });
            }
            return next;
        });
    }

    async function handleCreateUser() {
        setDialogError(null);
        if (!formUsername.trim()) { setDialogError('اسم المستخدم مطلوب'); return; }
        if (!formPassword.trim()) { setDialogError('كلمة المرور مطلوبة'); return; }
        setDialogSaving(true);
        try {
            const res = await fetch('/api/users/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify({
                    username: formUsername.trim(), password: formPassword.trim(),
                    role: formRole, permissions: JSON.stringify(formPermissions),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل إنشاء المستخدم');
            setShowAddDialog(false); fetchUsers();
        } catch (err) { setDialogError(err.message); }
        finally { setDialogSaving(false); }
    }
    async function handleUpdateUser() {
        setDialogError(null);
        if (!editingUser) return;
        setDialogSaving(true);
        try {
            const body = { permissions: JSON.stringify(formPermissions) };
            if (formUsername.trim() && formUsername.trim() !== editingUser.username) body.username = formUsername.trim();
            if (formPassword.trim()) body.password = formPassword.trim();
            const res = await fetch(`/api/users/${editingUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل تحديث المستخدم');
            setShowEditDialog(false); fetchUsers();
        } catch (err) { setDialogError(err.message); }
        finally { setDialogSaving(false); }
    }
    async function handleDeleteUser(userId) {
        if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
        try {
            const res = await fetch(`/api/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Basic ${auth}` } });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل حذف المستخدم');
            fetchUsers();
        } catch (err) { setUsersError(err.message); }
    }
    async function handleToggleActive(user) {
        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify({ is_active: !user.is_active }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل تحديث الحالة');
            fetchUsers();
        } catch (err) { setUsersError(err.message); }
    }

    function renderPermissionsTable() {
        return (
            <TableContainer sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 700, width: '50%' }}>الأقسام</TableCell>
                            <TableCell sx={{ fontWeight: 700, width: '50%' }}>الصلاحيات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {myVisibleSections.map((section) => {
                            const perm = formPermissions[section.key] || { visible: true, permission: 'write' };
                            const isParent = section.isParent;
                            const isChild = section.isChild;
                            const parentKey = isChild ? section.key.split(' > ')[0] : null;
                            const parentVisible = parentKey ? (formPermissions[parentKey]?.visible !== false) : true;

                            return (
                                <TableRow key={section.key} hover sx={{ bgcolor: isChild ? 'grey.25' : 'inherit' }}>
                                    <TableCell sx={{ pr: isChild ? 1 : 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: isChild ? 3 : 0 }}>
                                            <Checkbox
                                                checked={perm.visible !== false}
                                                onChange={(e) => isParent
                                                    ? handleParentVisibleChange(section.key, e.target.checked)
                                                    : handleChildVisibleChange(section.key, e.target.checked)
                                                }
                                                size="small"
                                                disabled={isChild && !parentVisible}
                                            />
                                            <Typography variant="body2" sx={{ fontWeight: isParent ? 700 : 400, color: isChild && !parentVisible ? 'text.disabled' : 'text.primary' }}>
                                                {isChild ? '↳ ' : ''}{section.label}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <FormControl size="small" fullWidth disabled={perm.visible === false || (isChild && !parentVisible)}>
                                            <Select
                                                value={perm.permission || 'write'}
                                                onChange={(e) => handlePermissionLevelChange(section.key, e.target.value)}
                                            >
                                                <MenuItem value="read">قراءة فقط</MenuItem>
                                                <MenuItem value="write">قراءة وكتابة</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    }

    if (loading) return <CircularProgress />;

    return (
        <Paper sx={{ width: '100%' }}>
            <Tabs
                value={settingsTab}
                onChange={(e, newValue) => setSettingsTab(newValue)}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab label="عامة" />
                <Tab label="الشبكة" />
                <Tab label="إدارة الصلاحيات" />
                <Tab label="التحديث" icon={<CloudUploadIcon />} iconPosition="start" />
            </Tabs>

            {/* تاب عامة */}
            {settingsTab === 0 && (
                <Box sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>ضبط الوجهة الرئيسية :</Typography>
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
                        <Box sx={{ mb: 3, p: 2.5, borderRadius: '12px', border: '1px solid', borderColor: settings.marquee_enabled ? 'primary.main' : 'divider', bgcolor: settings.marquee_enabled ? 'rgba(25,118,210,0.04)' : 'transparent', transition: 'all 0.3s' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <TextFieldsIcon color={settings.marquee_enabled ? 'primary' : 'disabled'} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>نص متحرك (Marquee)</Typography>
                                <FormControlLabel
                                    control={<Switch checked={!!settings.marquee_enabled} onChange={(e) => setSettings(prev => ({ ...prev, marquee_enabled: e.target.checked }))} color="primary" />}
                                    label={settings.marquee_enabled ? 'مفعّل' : 'معطّل'}
                                    labelPlacement="start" sx={{ mr: 0 }}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>نص يتحرك أفقياً في الواجهة الأمامية</Typography>
                            <TextField label="النص المتحرك" name="marquee_text" fullWidth multiline rows={2} margin="dense" value={settings.marquee_text || ''} onChange={handleInputChange} disabled={!settings.marquee_enabled} placeholder="أدخل النص..." sx={{ mb: 2 }} />
                            <Typography gutterBottom>حجم الخط ({settings.marquee_font_size || 35}px)</Typography>
                            <Slider name="marquee_font_size" value={settings.marquee_font_size || 35} onChange={(e, val) => handleSliderChange('marquee_font_size', val)} step={1} marks={[{value:12,label:'12'},{value:18,label:'18'},{value:24,label:'24'},{value:32,label:'32'},{value:35,label:'35'},{value:48,label:'48'}]} min={12} max={48} disabled={!settings.marquee_enabled} />
                            {settings.marquee_enabled && settings.marquee_text && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: '#0f172a', borderRadius: '12px', overflow: 'hidden' }}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', mb: 1, display: 'block' }}>معاينة:</Typography>
                                    <Box sx={{ overflow: 'hidden', whiteSpace: 'nowrap', '@keyframes marqueePreview': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(100%)' } } }}>
                                        <Typography sx={{ display: 'inline-block', color: '#e2e8f0', fontSize: `${settings.marquee_font_size || 35}px`, fontWeight: 600, animation: 'marqueePreview 8s linear infinite' }}>{settings.marquee_text}</Typography>
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
            {settingsTab === 1 && (
                <Box sx={{ p: 3 }}><NetworkTab auth={auth} /></Box>
            )}

            {/* تاب إدارة الصلاحيات */}
            {settingsTab === 2 && (
                <Box sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SecurityIcon color="primary" /> إدارة الصلاحيات
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        إدارة مستخدمي لوحة التحكم وصلاحياتهم. المالك يضيف مدراء، والمدير يضيف مدراء فرعيين.
                    </Typography>

                    {/* ===== قسم إدارة المستخدمين (أعلى) ===== */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AdminPanelIcon fontSize="small" /> إدارة المستخدمين
                        </Typography>
                        {(isOwner || isManager) && (
                            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAddDialog}>
                                إضافة {isOwner ? 'مدير' : 'مدير فرعي'}
                            </Button>
                        )}
                    </Box>

                    {usersLoading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 3 }} />}
                    {usersError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUsersError(null)}>{usersError}</Alert>}

                    {!usersLoading && users.length > 0 && (
                        <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>المستخدم</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>الدور</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>الأقسام المتاحة</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>الصلاحيات</TableCell>
                                        <TableCell sx={{ fontWeight: 700, width: 130 }}>إجراءات</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((user) => {
                                        const perms = parsePermissions(user.permissions);
                                        const visibleParents = myVisibleSections.filter(s => s.isParent && perms[s.key]?.visible !== false);
                                        const canEdit = isOwner || (isManager && user.parent_id === userInfo?.user_id) || user.id === userInfo?.user_id;
                                        const canDelete = (isOwner && user.role !== 'owner') ||
                                            (isManager && user.parent_id === userInfo?.user_id && user.id !== userInfo?.user_id);
                                        const canToggle = user.role !== 'owner' && (isOwner || (isManager && user.parent_id === userInfo?.user_id));

                                        return (
                                            <TableRow key={user.id} hover sx={{ opacity: user.is_active === false ? 0.5 : 1 }}>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <PersonIcon fontSize="small" color="action" />
                                                        <Typography variant="body2" fontWeight={600}>{user.username}</Typography>
                                                        {user.is_default && (
                                                            <Chip label="افتراضي" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                                        )}
                                                        {user.is_active === false && (
                                                            <Chip label="معطّل" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                                        )}
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={ROLE_LABELS[user.role] || user.role} size="small" color={ROLE_COLORS[user.role] || 'default'} />
                                                </TableCell>
                                                <TableCell>
                                                    {user.role === 'owner' ? (
                                                        <Chip label="جميع الأقسام" size="small" color="success" variant="outlined" />
                                                    ) : (
                                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                            {visibleParents.map(s => (
                                                                <Chip key={s.key} label={s.label} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
                                                            ))}
                                                        </Box>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {user.role === 'owner' ? (
                                                        <Chip label="كتابة كاملة" size="small" color="success" />
                                                    ) : (
                                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                            {visibleParents.map(s => {
                                                                const p = perms[s.key]?.permission || 'write';
                                                                return (
                                                                    <Tooltip key={s.key} title={s.label} arrow>
                                                                        <Chip
                                                                            label={p === 'write' ? 'كتابة' : 'قراءة'}
                                                                            size="small"
                                                                            color={p === 'write' ? 'primary' : 'default'}
                                                                            variant={p === 'write' ? 'filled' : 'outlined'}
                                                                            sx={{ height: 22, fontSize: '0.65rem' }}
                                                                        />
                                                                    </Tooltip>
                                                                );
                                                            })}
                                                        </Box>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                        {canToggle && (
                                                            <Tooltip title={user.is_active !== false ? 'تعطيل' : 'تفعيل'}>
                                                                <Switch
                                                                    size="small"
                                                                    checked={user.is_active !== false}
                                                                    onChange={() => handleToggleActive(user)}
                                                                    color="success"
                                                                />
                                                            </Tooltip>
                                                        )}
                                                        {canEdit && user.role !== 'owner' && (
                                                            <Tooltip title="تعديل">
                                                                <IconButton size="small" onClick={() => openEditDialog(user)}>
                                                                    <EditIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {canDelete && (
                                                            <Tooltip title="حذف">
                                                                <IconButton size="small" color="error" onClick={() => handleDeleteUser(user.id)}>
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    <Divider sx={{ my: 3 }} />

                    {/* ===== قسم تغيير كلمة المرور (أسفل - قابل للطي) ===== */}
                    <Button
                        variant="outlined"
                        color="inherit"
                        fullWidth
                        onClick={() => setShowPasswordSection(!showPasswordSection)}
                        endIcon={showPasswordSection ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        startIcon={<LockIcon />}
                        sx={{
                            justifyContent: 'flex-start', py: 1.5, px: 2,
                            borderColor: 'divider', borderRadius: 2,
                            bgcolor: showPasswordSection ? 'grey.50' : 'transparent',
                            fontWeight: 600, fontSize: '0.9rem',
                            '& .MuiButton-endIcon': { marginRight: 'auto', marginLeft: 0 }
                        }}
                    >
                        تغيير بيانات الدخول الخاصة بك
                    </Button>
                    <Collapse in={showPasswordSection}>
                        <Box sx={{ mt: 2, p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                المستخدم الحالي: <strong>{userInfo?.username || '—'}</strong>
                                {' '}
                                <Chip label={ROLE_LABELS[currentRole] || currentRole} size="small" color={ROLE_COLORS[currentRole] || 'default'} sx={{ mr: 1 }} />
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField label="كلمة المرور الحالية" type="password" fullWidth margin="dense" value={adminCurrentPassword} onChange={(e) => setAdminCurrentPassword(e.target.value)} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField label="اسم المستخدم الجديد (اختياري)" fullWidth margin="dense" value={adminNewUsername} onChange={(e) => setAdminNewUsername(e.target.value)} placeholder={userInfo?.username} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField label="كلمة المرور الجديدة" type="password" fullWidth margin="dense" value={adminNewPassword} onChange={(e) => setAdminNewPassword(e.target.value)} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField label="تأكيد كلمة المرور" type="password" fullWidth margin="dense" value={adminConfirmPassword} onChange={(e) => setAdminConfirmPassword(e.target.value)} />
                                </Grid>
                            </Grid>
                            {adminCredError && <Alert severity="error" sx={{ mt: 2 }}>{adminCredError}</Alert>}
                            {adminCredSuccess && <Alert severity="success" sx={{ mt: 2 }}>تم تحديث بيانات الدخول. يرجى تسجيل الدخول مرة أخرى.</Alert>}
                            <Button variant="outlined" color="primary" disabled={adminCredSaving} onClick={handleSaveAdminCredentials}
                                startIcon={adminCredSaving ? <CircularProgress size={20} /> : <SaveIcon />} sx={{ mt: 2 }}>
                                {adminCredSaving ? 'جاري الحفظ...' : 'حفظ بيانات الدخول'}
                            </Button>
                        </Box>
                    </Collapse>

                    {/* Dialog إضافة مستخدم */}
                    <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} maxWidth="sm" fullWidth>
                        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AddIcon color="primary" /> إضافة {isOwner ? 'مدير' : 'مدير فرعي'} جديد
                        </DialogTitle>
                        <DialogContent>
                            {dialogError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{dialogError}</Alert>}
                            <TextField label="اسم المستخدم" fullWidth margin="dense" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} sx={{ mb: 1 }} />
                            <TextField label="كلمة المرور" type="password" fullWidth margin="dense" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} sx={{ mb: 1 }} />
                            {isOwner && (
                                <FormControl fullWidth margin="dense" sx={{ mb: 1 }}>
                                    <InputLabel>الدور</InputLabel>
                                    <Select value={formRole} onChange={(e) => setFormRole(e.target.value)} label="الدور">
                                        <MenuItem value="manager">مدير</MenuItem>
                                    </Select>
                                </FormControl>
                            )}
                            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 700 }}>صلاحيات الأقسام</Typography>
                            {renderPermissionsTable()}
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 2 }}>
                            <Button onClick={() => setShowAddDialog(false)}>إلغاء</Button>
                            <Button variant="contained" onClick={handleCreateUser} disabled={dialogSaving}>
                                {dialogSaving ? <CircularProgress size={20} /> : 'إنشاء'}
                            </Button>
                        </DialogActions>
                    </Dialog>

                    {/* Dialog تعديل مستخدم */}
                    <Dialog open={showEditDialog} onClose={() => setShowEditDialog(false)} maxWidth="sm" fullWidth>
                        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EditIcon color="primary" /> تعديل المستخدم: {editingUser?.username}
                        </DialogTitle>
                        <DialogContent>
                            {dialogError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{dialogError}</Alert>}
                            <TextField label="اسم المستخدم" fullWidth margin="dense" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} sx={{ mb: 1 }} />
                            <TextField label="كلمة المرور الجديدة (اتركه فارغ لعدم التغيير)" type="password" fullWidth margin="dense" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} sx={{ mb: 1 }} />
                            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 700 }}>صلاحيات الأقسام</Typography>
                            {renderPermissionsTable()}
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 2 }}>
                            <Button onClick={() => setShowEditDialog(false)}>إلغاء</Button>
                            <Button variant="contained" onClick={handleUpdateUser} disabled={dialogSaving}>
                                {dialogSaving ? <CircularProgress size={20} /> : 'حفظ التعديلات'}
                            </Button>
                        </DialogActions>
                    </Dialog>
                </Box>
            )}

            {/* تاب التحديث */}
            {settingsTab === 3 && (
                <UpdateTab auth={auth} />
            )}
        </Paper>
    );
};

export default SettingsManager;
