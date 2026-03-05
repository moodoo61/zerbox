import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, CircularProgress, Alert, Switch, FormControlLabel,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Select, MenuItem, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import DeleteIcon from '@mui/icons-material/Delete';
import EditNoteIcon from '@mui/icons-material/EditNote';

const STATUS_LABELS = {
    new: 'جديد',
    contacted: 'تم التواصل',
    completed: 'مكتمل',
    cancelled: 'ملغي',
};

const DeliveryRequestsManager = ({ auth }) => {
    const [requests, setRequests] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toggleSaving, setToggleSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notesDialog, setNotesDialog] = useState(null); // { id, name, notes }
    const [notesSaving, setNotesSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
    const [deleting, setDeleting] = useState(false);
    const [updatingStatusId, setUpdatingStatusId] = useState(null);

    const fetchData = useCallback(() => {
        if (!auth) return;
        setLoading(true);
        Promise.all([
            fetch('/api/delivery-requests/', { headers: { Authorization: `Basic ${auth}` } }),
            fetch('/api/settings/'),
        ])
            .then(([resReq, resSettings]) => {
                if (!resReq.ok) throw new Error('فشل تحميل الطلبات');
                return Promise.all([resReq.json(), resSettings.json()]);
            })
            .then(([requestsData, settingsData]) => {
                setRequests(requestsData);
                setSettings(settingsData);
                setError(null);
            })
            .catch((err) => {
                setError(err.message || 'حدث خطأ');
            })
            .finally(() => setLoading(false));
    }, [auth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleStatusChange = async (requestId, newStatus) => {
        setUpdatingStatusId(requestId);
        try {
            const res = await fetch(`/api/delivery-requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('فشل في تحديث الحالة');
            const updated = await res.json();
            setRequests((prev) => prev.map((r) => (r.id === requestId ? updated : r)));
        } catch (err) {
            setError(err.message || 'فشل في تحديث الحالة');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const openNotesDialog = (req) => {
        setNotesDialog({ id: req.id, name: req.name, notes: req.notes || '' });
    };

    const saveNotes = async () => {
        if (!notesDialog) return;
        setNotesSaving(true);
        try {
            const res = await fetch(`/api/delivery-requests/${notesDialog.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
                body: JSON.stringify({ notes: notesDialog.notes }),
            });
            if (!res.ok) throw new Error('فشل في حفظ الملاحظات');
            const updated = await res.json();
            setRequests((prev) => prev.map((r) => (r.id === notesDialog.id ? updated : r)));
            setNotesDialog(null);
        } catch (err) {
            setError(err.message || 'فشل في حفظ الملاحظات');
        } finally {
            setNotesSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/delivery-requests/${deleteConfirm.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Basic ${auth}` },
            });
            if (!res.ok) throw new Error('فشل في حذف الطلب');
            setRequests((prev) => prev.filter((r) => r.id !== deleteConfirm.id));
            setDeleteConfirm(null);
        } catch (err) {
            setError(err.message || 'فشل في حذف الطلب');
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleHomeDelivery = async (event) => {
        const enabled = event.target.checked;
        setToggleSaving(true);
        try {
            const res = await fetch('/api/settings/', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
                body: JSON.stringify({ home_delivery_enabled: enabled }),
            });
            if (!res.ok) throw new Error('فشل في تحديث الإعداد');
            const updated = await res.json();
            setSettings(updated);
        } catch (err) {
            setError(err.message || 'فشل في حفظ الإعداد');
        } finally {
            setToggleSaving(false);
        }
    };

    const formatDate = (isoStr) => {
        if (!isoStr) return '—';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoStr;
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                <WifiIcon color="primary" />
                طلبات التوصيل للمنازل
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 3 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={settings?.home_delivery_enabled ?? false}
                            onChange={handleToggleHomeDelivery}
                            disabled={toggleSaving}
                            color="primary"
                        />
                    }
                    label={
                        <Typography>
                            تفعيل ميزة«طلبات توصيل الشبكة للمنازل» — عند التفعيل يظهر زر التوصيل في الواجهة الأمامية، وعند التعطيل يختفي الزر.
                        </Typography>
                    }
                />
            </Paper>

            <Typography variant="h6" sx={{ mb: 1 }}>
                قائمة الطلبات الواردة
            </Typography>
            <TableContainer component={Paper}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell align="right">#</TableCell>
                            <TableCell align="right">الاسم</TableCell>
                            <TableCell align="right">رقم الهاتف</TableCell>
                            <TableCell align="right">العنوان</TableCell>
                            <TableCell align="right">الحالة</TableCell>
                            <TableCell align="right">ملاحظات</TableCell>
                            <TableCell align="right">التاريخ</TableCell>
                            <TableCell align="center">إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {requests.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center">
                                    لا توجد طلبات حتى الآن
                                </TableCell>
                            </TableRow>
                        ) : (
                            requests.map((req, idx) => (
                                <TableRow key={req.id}>
                                    <TableCell align="right">{requests.length - idx}</TableCell>
                                    <TableCell align="right">{req.name}</TableCell>
                                    <TableCell align="right">{req.phone}</TableCell>
                                    <TableCell align="right">{req.address}</TableCell>
                                    <TableCell align="right">
                                        <Select
                                            size="small"
                                            value={req.status || 'new'}
                                            onChange={(e) => handleStatusChange(req.id, e.target.value)}
                                            disabled={updatingStatusId === req.id}
                                            sx={{ minWidth: 120 }}
                                        >
                                            <MenuItem value="new">{STATUS_LABELS.new}</MenuItem>
                                            <MenuItem value="contacted">{STATUS_LABELS.contacted}</MenuItem>
                                            <MenuItem value="completed">{STATUS_LABELS.completed}</MenuItem>
                                            <MenuItem value="cancelled">{STATUS_LABELS.cancelled}</MenuItem>
                                        </Select>
                                    </TableCell>
                                    <TableCell align="right">
                                        {req.notes ? (
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 120 }} title={req.notes}>
                                                {req.notes}
                                            </Typography>
                                        ) : (
                                            '—'
                                        )}
                                        <IconButton size="small" onClick={() => openNotesDialog(req)} title="تعديل الملاحظات">
                                            <EditNoteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                    <TableCell align="right">{formatDate(req.created_at)}</TableCell>
                                    <TableCell align="center">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => setDeleteConfirm({ id: req.id, name: req.name })}
                                            title="حذف الطلب"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* نافذة تعديل الملاحظات */}
            <Dialog open={Boolean(notesDialog)} onClose={() => setNotesDialog(null)} maxWidth="sm" fullWidth dir="rtl">
                <DialogTitle>ملاحظات الطلب {notesDialog?.name}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        value={notesDialog?.notes ?? ''}
                        onChange={(e) => setNotesDialog((d) => (d ? { ...d, notes: e.target.value } : null))}
                        placeholder="أضف ملاحظات حول هذا الطلب..."
                        disabled={notesSaving}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-start', px: 3, pb: 2 }}>
                    <Button onClick={() => setNotesDialog(null)} disabled={notesSaving}>
                        إلغاء
                    </Button>
                    <Button variant="contained" onClick={saveNotes} disabled={notesSaving}>
                        {notesSaving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* تأكيد الحذف */}
            <Dialog open={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)} dir="rtl">
                <DialogTitle>تأكيد الحذف</DialogTitle>
                <DialogContent>
                    <Typography>
                        هل أنت متأكد من حذف طلب «{deleteConfirm?.name}»؟ لا يمكن التراجع عن هذا الإجراء.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'flex-start', px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteConfirm(null)} disabled={deleting}>
                        إلغاء
                    </Button>
                    <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
                        {deleting ? 'جاري الحذف...' : 'حذف'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DeliveryRequestsManager;
