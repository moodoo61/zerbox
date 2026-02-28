import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Button, TextField,
    CircularProgress, Alert, IconButton, Tooltip, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Chip, Divider, Select,
    MenuItem, FormControl, InputLabel
} from '@mui/material';
import {
    Notifications as NotifIcon,
    NotificationsActive as NotifActiveIcon,
    Send as SendIcon,
    Schedule as ScheduleIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Add as AddIcon,
    People as PeopleIcon,
    CheckCircle as CheckIcon,
    AccessTime as TimeIcon
} from '@mui/icons-material';

const NotificationsManager = ({ auth }) => {
    const [notifications, setNotifications] = useState([]);
    const [stats, setStats] = useState({ total_notifications: 0, total_subscribers: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [form, setForm] = useState({
        title: '', body: '', icon_url: '', link_url: '',
        notification_type: 'instant', scheduled_at: ''
    });

    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [notifRes, statsRes] = await Promise.all([
                fetch('/api/notifications/', { headers }),
                fetch('/api/notifications/stats', { headers })
            ]);
            if (notifRes.ok) setNotifications(await notifRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
            setError('');
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u062c\u0644\u0628 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleCreate = async () => {
        if (!form.title.trim() || !form.body.trim()) {
            setError('\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0645\u0637\u0644\u0648\u0628\u0627\u0646');
            return;
        }
        setSending(true);
        try {
            const res = await fetch('/api/notifications/', {
                method: 'POST', headers,
                body: JSON.stringify(form)
            });
            if (!res.ok) throw new Error('Failed');
            setSuccess(form.notification_type === 'instant' ? '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0628\u0646\u062c\u0627\u062d' : '\u062a\u0645 \u062c\u062f\u0648\u0644\u0629 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0628\u0646\u062c\u0627\u062d');
            setDialogOpen(false);
            setForm({ title: '', body: '', icon_url: '', link_url: '', notification_type: 'instant', scheduled_at: '' });
            fetchData();
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0625\u0634\u0639\u0627\u0631');
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: 'DELETE', headers });
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u0627\u0644\u062d\u0630\u0641');
        }
    };

    const handleSendScheduled = async () => {
        try {
            const res = await fetch('/api/notifications/send-scheduled', { method: 'POST', headers });
            if (res.ok) {
                const data = await res.json();
                setSuccess(`\u062a\u0645 \u0645\u0639\u0627\u0644\u062c\u0629 ${data.processed} \u0625\u0634\u0639\u0627\u0631`);
                fetchData();
            }
        } catch (err) {
            setError('\u0641\u0634\u0644 \u0641\u064a \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u062c\u062f\u0648\u0644\u0629');
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '-';
        try {
            return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
        } catch { return iso; }
    };

    return (
        <Box sx={{ direction: 'rtl' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
                        <NotifIcon sx={{ color: '#fff', fontSize: 26 }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>الإشعارات</Typography>
                        <Typography variant="body2" color="text.secondary">إرسال إشعارات فورية أو مجدولة للعملاء</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="تحديث"><IconButton onClick={fetchData}><RefreshIcon /></IconButton></Tooltip>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}
                        sx={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', fontWeight: 700, borderRadius: '12px' }}>
                        إشعار جديد
                    </Button>
                </Box>
            </Box>

            {/* Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={4}>
                    <Card sx={{ bgcolor: '#fff7ed', border: '1px solid #fed7aa' }}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <NotifActiveIcon sx={{ color: '#f59e0b' }} />
                                <Typography variant="h4" sx={{ fontWeight: 800, color: '#d97706' }}>{stats.total_notifications}</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#92400e' }}>إجمالي الإشعارات</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={4}>
                    <Card sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PeopleIcon sx={{ color: '#3b82f6' }} />
                                <Typography variant="h4" sx={{ fontWeight: 800, color: '#2563eb' }}>{stats.total_subscribers}</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#1d4ed8' }}>المشتركون</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ border: '1px solid #e2e8f0', cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc' } }} onClick={handleSendScheduled}>
                        <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <ScheduleIcon sx={{ color: '#8b5cf6' }} />
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>إرسال المجدولة</Typography>
                                <Typography variant="caption" color="text.secondary">إرسال الإشعارات التي حان وقتها</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

            {/* Notifications List */}
            <Card>
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>سجل الإشعارات</Typography>
                    </Box>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                            <NotifIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
                            <Typography>لا توجد إشعارات</Typography>
                        </Box>
                    ) : (
                        notifications.map((notif, index) => (
                            <React.Fragment key={notif.id}>
                                {index > 0 && <Divider />}
                                <Box sx={{ px: 2.5, py: 2, '&:hover': { bgcolor: '#f8fafc' } }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{notif.title}</Typography>
                                                {notif.is_sent ? (
                                                    <Chip icon={<CheckIcon sx={{ fontSize: '14px !important' }} />} label="مُرسل" size="small" sx={{ height: 22, fontSize: '0.6rem', bgcolor: '#dcfce7', color: '#16a34a' }} />
                                                ) : (
                                                    <Chip icon={<TimeIcon sx={{ fontSize: '14px !important' }} />} label={notif.notification_type === 'scheduled' ? 'مجدول' : 'قيد الانتظار'} size="small" sx={{ height: 22, fontSize: '0.6rem', bgcolor: '#fef3c7', color: '#d97706' }} />
                                                )}
                                                {notif.notification_type === 'scheduled' && (
                                                    <Chip icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />} label="مجدول" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.6rem' }} />
                                                )}
                                            </Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{notif.body}</Typography>
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                <Typography variant="caption" color="text.secondary">إنشاء: {formatDate(notif.created_at)}</Typography>
                                                {notif.sent_at && <Typography variant="caption" color="text.secondary">إرسال: {formatDate(notif.sent_at)}</Typography>}
                                                {notif.scheduled_at && <Typography variant="caption" sx={{ color: '#8b5cf6' }}>موعد: {formatDate(notif.scheduled_at)}</Typography>}
                                            </Box>
                                        </Box>
                                        <Tooltip title="حذف">
                                            <IconButton size="small" onClick={() => handleDelete(notif.id)} sx={{ color: '#ef4444' }}>
                                                <DeleteIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            </React.Fragment>
                        ))
                    )}
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth dir="rtl">
                <DialogTitle sx={{ fontWeight: 700 }}>إشعار جديد</DialogTitle>
                <DialogContent>
                    <TextField label="العنوان" fullWidth value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} margin="normal" required />
                    <TextField label="المحتوى" fullWidth multiline rows={3} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} margin="normal" required />
                    <TextField label="رابط الأيقونة (اختياري)" fullWidth value={form.icon_url} onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))} margin="normal" />
                    <TextField label="رابط عند الضغط (اختياري)" fullWidth value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} margin="normal" />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>نوع الإشعار</InputLabel>
                        <Select value={form.notification_type} onChange={e => setForm(f => ({ ...f, notification_type: e.target.value }))} label="نوع الإشعار">
                            <MenuItem value="instant">فوري - إرسال الآن</MenuItem>
                            <MenuItem value="scheduled">مجدول - تحديد موعد</MenuItem>
                        </Select>
                    </FormControl>
                    {form.notification_type === 'scheduled' && (
                        <TextField label="موعد الإرسال" type="datetime-local" fullWidth value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} margin="normal" InputLabelProps={{ shrink: true }} />
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDialogOpen(false)}>إلغاء</Button>
                    <Button variant="contained" onClick={handleCreate} disabled={sending} startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                        sx={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', fontWeight: 700 }}>
                        {form.notification_type === 'instant' ? 'إرسال الآن' : 'جدولة'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default NotificationsManager;
