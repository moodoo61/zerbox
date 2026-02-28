import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    AppBar, Toolbar, IconButton, Typography, Button, Box,
    Drawer, List, ListItem, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Alert, CircularProgress, Badge, Popover, Divider, Fade
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ServiceIcon from '@mui/icons-material/MiscellaneousServices';
import WifiIcon from '@mui/icons-material/Wifi';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import CloseIcon from '@mui/icons-material/Close';
import { shadows } from '../../styles/animations';

const Navbar = ({ 
    settings, 
    drawerOpen, 
    setDrawerOpen, 
    onScrollToApps, 
    isMobile 
}) => {
    const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
    const [deliveryForm, setDeliveryForm] = useState({ name: '', phone: '', address: '' });
    const [deliverySubmitStatus, setDeliverySubmitStatus] = useState(null);
    const [deliveryErrorMsg, setDeliveryErrorMsg] = useState('');
    const [notifAnchor, setNotifAnchor] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);

    // Fetch public notifications
    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications/public?limit=8');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (e) { /* silent */ }
    }, []);

    useEffect(() => { fetchNotifications(); const i = setInterval(fetchNotifications, 60000); return () => clearInterval(i); }, [fetchNotifications]);

    // Check push subscription status
    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    setPushEnabled(!!sub);
                });
            });
        }
    }, []);

    const togglePush = async () => {
        // Push API requires HTTPS (except localhost)
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            if (!isSecure) {
                alert('الإشعارات الفورية تتطلب اتصال HTTPS آمن. يرجى الوصول للموقع عبر HTTPS.');
            } else {
                alert('متصفحك لا يدعم الإشعارات الفورية');
            }
            return;
        }
        setPushLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            if (pushEnabled) {
                // إلغاء الاشتراك
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    await fetch('/api/push/unsubscribe', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: sub.endpoint })
                    });
                    await sub.unsubscribe();
                }
                setPushEnabled(false);
            } else {
                // طلب إذن الإشعارات أولاً
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    alert('يجب السماح بالإشعارات لتفعيل هذه الميزة');
                    setPushLoading(false);
                    return;
                }
                // جلب مفتاح VAPID العام
                const keyRes = await fetch('/api/push/vapid-key');
                const keyData = await keyRes.json();
                if (!keyData.public_key) {
                    console.warn('No VAPID public key available');
                    setPushLoading(false);
                    return;
                }
                // تحويل المفتاح لصيغة Uint8Array
                const padding = '='.repeat((4 - keyData.public_key.length % 4) % 4);
                const base64 = (keyData.public_key + padding).replace(/-/g, '+').replace(/_/g, '/');
                const rawData = atob(base64);
                const arr = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
                // الاشتراك في Push
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: arr
                });
                const subJson = sub.toJSON();
                await fetch('/api/push/subscribe', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endpoint: subJson.endpoint,
                        p256dh: subJson.keys.p256dh,
                        auth: subJson.keys.auth
                    })
                });
                setPushEnabled(true);
            }
        } catch (e) {
            console.warn('Push toggle error:', e);
            alert('حدث خطأ في تفعيل الإشعارات: ' + e.message);
        }
        setPushLoading(false);
    };

    const toggleDrawer = (open) => (event) => {
        if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
            return;
        }
        setDrawerOpen(open);
    };

    const openDeliveryDialog = () => {
        setDeliveryDialogOpen(true);
        setDeliveryForm({ name: '', phone: '', address: '' });
        setDeliverySubmitStatus(null);
        setDeliveryErrorMsg('');
        setDrawerOpen(false);
    };

    const closeDeliveryDialog = () => {
        setDeliveryDialogOpen(false);
        setDeliverySubmitStatus(null);
    };

    const handleDeliverySubmit = async () => {
        if (!deliveryForm.name.trim() || !deliveryForm.phone.trim() || !deliveryForm.address.trim()) {
            setDeliveryErrorMsg('يرجى تعبئة جميع الحقول');
            return;
        }
        setDeliverySubmitStatus('loading');
        setDeliveryErrorMsg('');
        try {
            const res = await fetch('/api/delivery-requests/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveryForm),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'فشل في إرسال الطلب');
            }
            setDeliverySubmitStatus('success');
            setDeliveryForm({ name: '', phone: '', address: '' });
        } catch (err) {
            setDeliverySubmitStatus('error');
            setDeliveryErrorMsg(err.message || 'حدث خطأ أثناء الإرسال');
        }
    };

    return (
        <>
            <AppBar 
                position="fixed" 
                sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    backdropFilter: 'blur(10px)',
                    boxShadow: shadows.navbar,
                    color: 'text.primary',
                    zIndex: 1200,
                    top: { xs: 8, md: 16 }, // مسافة أقل على الهواتف
                    left: { xs: 8, md: 16 }, // مسافة أقل على الهواتف
                    right: { xs: 8, md: 16 }, // مسافة أقل على الهواتف
                    width: { xs: 'calc(100% - 16px)', md: 'calc(100% - 32px)' }, // عرض متجاوب
                    borderRadius: 2 // حواف مدورة
                }}
            >
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ 
                        flexGrow: 1, 
                        fontWeight: 'bold',
                        background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textAlign: { xs: 'center', md: 'right' }, // توسيط النص في الهواتف
                        fontSize: { xs: '1rem', md: '1.25rem' } // تصغير الخط في الهواتف
                    }}>
                        {settings?.welcome_message || 'المنصة الترفيهية'}
                    </Typography>

                    <IconButton
                        edge="end"
                        color="inherit"
                        onClick={toggleDrawer(true)}
                        sx={{ ml: 2, display: { md: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>
                    
                    {/* Desktop Navigation */}
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 2 }}>
                        {settings?.home_delivery_enabled && (
                            <Button
                                color="inherit"
                                startIcon={<WifiIcon />}
                                onClick={openDeliveryDialog}
                                sx={{ 
                                    fontWeight: 'medium',
                                    '&:hover': {
                                        backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                        transform: 'translateY(-1px)'
                                    },
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                التوصيل للمنازل
                            </Button>
                        )}
                        <Button
                            color="inherit"
                            startIcon={<ServiceIcon />}
                            onClick={onScrollToApps}
                            sx={{ 
                                fontWeight: 'medium',
                                '&:hover': {
                                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                    transform: 'translateY(-1px)'
                                },
                                transition: 'all 0.3s ease'
                            }}
                        >
                            الخدمات
                        </Button>
                        <IconButton
                            color="inherit"
                            onClick={(e) => setNotifAnchor(e.currentTarget)}
                            sx={{
                                '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.08)' },
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <Badge badgeContent={notifications.length} color="error" max={9}
                                sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16 } }}>
                                <NotificationsIcon />
                            </Badge>
                        </IconButton>
                        <Button
                            component={RouterLink}
                            to="/admin"
                            variant="contained"
                            color="primary"
                            startIcon={<AdminPanelSettingsIcon />}
                            sx={{ 
                                ml: 1,
                                fontWeight: 'bold',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 6px 20px rgba(25, 118, 210, 0.4)'
                                },
                                transition: 'all 0.3s ease'
                            }}
                        >
                            لوحة التحكم
                        </Button>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Mobile Drawer */}
            <Drawer
                anchor="left" // تغيير لليسار لأن الأيقونة الآن على اليمين
                open={drawerOpen}
                onClose={toggleDrawer(false)}
                sx={{
                    '& .MuiDrawer-paper': {
                        minWidth: 250,
                        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                        direction: 'rtl' // اتجاه عربي
                    }
                }}
            >
                <Box
                    sx={{ width: 250, pt: 2, direction: 'rtl' }}
                    role="presentation"
                    onClick={toggleDrawer(false)}
                    onKeyDown={toggleDrawer(false)}
                >
                    <List>
                        {settings?.home_delivery_enabled && (
                            <ListItem 
                                button 
                                onClick={openDeliveryDialog}
                                sx={{ 
                                    '&:hover': { 
                                        backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                        transform: 'translateX(4px)'
                                    },
                                    transition: 'all 0.3s ease',
                                    borderRadius: 1,
                                    mx: 1,
                                    flexDirection: 'row-reverse'
                                }}
                            >
                                <ListItemText primary="التوصيل للمنازل" sx={{ textAlign: 'right' }} />
                                <WifiIcon sx={{ ml: 2, color: 'primary.main' }} />
                            </ListItem>
                        )}
                        <ListItem
                            button
                            onClick={(e) => { setNotifAnchor(e.currentTarget); setDrawerOpen(false); }}
                            sx={{
                                '&:hover': { backgroundColor: 'rgba(25, 118, 210, 0.08)', transform: 'translateX(4px)' },
                                transition: 'all 0.3s ease', borderRadius: 1, mx: 1, flexDirection: 'row-reverse'
                            }}
                        >
                            <ListItemText primary="الإشعارات" sx={{ textAlign: 'right' }} />
                            <Badge badgeContent={notifications.length} color="error" max={9}>
                                <NotificationsIcon sx={{ ml: 2, color: 'primary.main' }} />
                            </Badge>
                        </ListItem>
                        <ListItem 
                            button 
                            onClick={onScrollToApps}
                            sx={{ 
                                '&:hover': { 
                                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                    transform: 'translateX(4px)' // تغيير الاتجاه
                                },
                                transition: 'all 0.3s ease',
                                borderRadius: 1,
                                mx: 1,
                                flexDirection: 'row-reverse' // عكس اتجاه العناصر
                            }}
                        >
                            <ListItemText primary="الخدمات" sx={{ textAlign: 'right' }} />
                            <ServiceIcon sx={{ ml: 2, color: 'primary.main' }} />
                        </ListItem>
                        <ListItem 
                            button 
                            component={RouterLink} 
                            to="/admin"
                            sx={{ 
                                '&:hover': { 
                                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                    transform: 'translateX(4px)' // تغيير الاتجاه
                                },
                                transition: 'all 0.3s ease',
                                borderRadius: 1,
                                mx: 1,
                                flexDirection: 'row-reverse' // عكس اتجاه العناصر
                            }}
                        >
                            <ListItemText primary="لوحة التحكم" sx={{ textAlign: 'right' }} />
                            <AdminPanelSettingsIcon sx={{ ml: 2, color: 'primary.main' }} />
                        </ListItem>
                    </List>
                </Box>
            </Drawer>

            {/* قائمة الإشعارات المنبثقة */}
            <Popover
                open={Boolean(notifAnchor)}
                anchorEl={notifAnchor}
                onClose={() => setNotifAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                PaperProps={{ sx: { width: 340, maxHeight: 440, borderRadius: '16px', direction: 'rtl', overflow: 'hidden' } }}
            >
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>الإشعارات</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton size="small" onClick={togglePush} disabled={pushLoading}
                            sx={{ color: pushEnabled ? '#22c55e' : '#94a3b8' }}>
                            {pushLoading ? <CircularProgress size={16} /> : pushEnabled ? <NotificationsActiveIcon sx={{ fontSize: 18 }} /> : <NotificationsOffIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                        <IconButton size="small" onClick={() => setNotifAnchor(null)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
                    </Box>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: pushEnabled ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" sx={{ color: pushEnabled ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {pushEnabled ? 'الإشعارات الفورية مفعلة' : 'اضغط الجرس لتفعيل الإشعارات الفورية'}
                    </Typography>
                </Box>
                <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                            <NotificationsIcon sx={{ fontSize: 36, mb: 1, opacity: 0.3 }} />
                            <Typography variant="body2">لا توجد إشعارات</Typography>
                        </Box>
                    ) : notifications.map((n, i) => (
                        <Fade in key={n.id}>
                            <Box>
                                {i > 0 && <Divider />}
                                <Box sx={{ px: 2, py: 1.5, '&:hover': { bgcolor: '#f8fafc' }, cursor: n.link_url ? 'pointer' : 'default' }}
                                    onClick={() => { if (n.link_url) window.location.href = n.link_url; }}>
                                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.3 }}>{n.title}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>{n.body}</Typography>
                                    {n.sent_at && <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                                        {new Date(n.sent_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })}
                                    </Typography>}
                                </Box>
                            </Box>
                        </Fade>
                    ))}
                </Box>
            </Popover>

            {/* نافذة طلب التوصيل للمنزل */}
            <Dialog open={deliveryDialogOpen} onClose={closeDeliveryDialog} maxWidth="sm" fullWidth dir="rtl">
                <DialogTitle>طلب توصيل الخدمة إلى المنزل</DialogTitle>
                <DialogContent>
                    {deliveryErrorMsg && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDeliveryErrorMsg('')}>
                            {deliveryErrorMsg}
                        </Alert>
                    )}
                    {deliverySubmitStatus === 'success' && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            تم إرسال طلبك بنجاح. سنتواصل معك قريباً.
                        </Alert>
                    )}
                    <TextField
                        label="الاسم"
                        fullWidth
                        value={deliveryForm.name}
                        onChange={(e) => setDeliveryForm((f) => ({ ...f, name: e.target.value }))}
                        margin="normal"
                        disabled={deliverySubmitStatus === 'loading'}
                    />
                    <TextField
                        label="رقم الهاتف"
                        fullWidth
                        value={deliveryForm.phone}
                        onChange={(e) => setDeliveryForm((f) => ({ ...f, phone: e.target.value }))}
                        margin="normal"
                        disabled={deliverySubmitStatus === 'loading'}
                    />
                    <TextField
                        label="العنوان"
                        fullWidth
                        multiline
                        rows={2}
                        value={deliveryForm.address}
                        onChange={(e) => setDeliveryForm((f) => ({ ...f, address: e.target.value }))}
                        margin="normal"
                        disabled={deliverySubmitStatus === 'loading'}
                    />
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-start', px: 3, pb: 2 }}>
                    <Button onClick={closeDeliveryDialog} disabled={deliverySubmitStatus === 'loading'}>
                        إلغاء
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleDeliverySubmit}
                        disabled={deliverySubmitStatus === 'loading'}
                        startIcon={deliverySubmitStatus === 'loading' ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {deliverySubmitStatus === 'loading' ? 'جاري الإرسال...' : 'تقديم'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default Navbar;
