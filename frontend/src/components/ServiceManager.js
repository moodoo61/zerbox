import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from './Modal';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, IconButton, Typography, TextField, Alert, CircularProgress, Link,
    Tabs, Tab, Card, CardContent, Switch, FormControlLabel, Chip, Checkbox, LinearProgress
} from '@mui/material';
import { 
    Edit as EditIcon, 
    Delete as DeleteIcon, 
    Add as AddIcon, 
    CloudUpload as CloudUploadIcon,
    PlayArrow as PlayIcon,
    Stop as StopIcon,
    Refresh as RefreshIcon,
    Settings as SettingsIcon,
    Language as LanguageIcon,
    MenuBook as MenuBookIcon,
    Download as DownloadIcon,
    Pause as PauseIcon
} from '@mui/icons-material';
import ServiceStatsManager from './ServiceStatsManager';

function getUserPermissions(userInfo) {
    if (!userInfo || userInfo.role === 'owner') return null;
    try {
        return typeof userInfo.permissions === 'string' ? JSON.parse(userInfo.permissions) : userInfo.permissions || {};
    } catch { return {}; }
}

function isSubSectionVisible(perms, key) {
    if (!perms) return true;
    const p = perms[key];
    if (!p) return true;
    return p.visible !== false;
}

const ServiceManager = ({ auth, userInfo }) => {
    // Regular services state
    const [services, setServices] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentService, setCurrentService] = useState({ id: null, name: '', description: '', link: '', image_url: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);
    
    // Default services state
    const [defaultServices, setDefaultServices] = useState([]);
    const [currentTab, setCurrentTab] = useState(0);
    const [defaultServiceError, setDefaultServiceError] = useState(null);
    const [defaultServiceSuccess, setDefaultServiceSuccess] = useState(null);
    const [serviceActions, setServiceActions] = useState({}); // للإجراءات الجارية
    
    // Default service edit modal state
    const [isDefaultServiceModalOpen, setIsDefaultServiceModalOpen] = useState(false);
    const [currentDefaultService, setCurrentDefaultService] = useState({ id: null, name: '', description: '', icon_url: '' });
    const [isEditingDefaultService, setIsEditingDefaultService] = useState(false);
    const [defaultServiceImageFile, setDefaultServiceImageFile] = useState(null);
    const [isSavingDefaultService, setIsSavingDefaultService] = useState(false);
    const defaultServiceFileInputRef = useRef(null);
    
    // Quran settings modal state
    const [isQuranSettingsOpen, setIsQuranSettingsOpen] = useState(false);
    const [quranSettings, setQuranSettings] = useState(null);
    const [quranLoading, setQuranLoading] = useState(false);
    const [quranActionLoading, setQuranActionLoading] = useState(false);
    const [quranError, setQuranError] = useState(null);
    const [selectedReciterIds, setSelectedReciterIds] = useState([]);
    const [quranSelectionDirty, setQuranSelectionDirty] = useState(false);

    const fetchServices = useCallback(async () => {
        try {
            const response = await fetch('/api/services/');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setServices(data);
            setError(null);
        } catch (error) {
            console.error("Error fetching services:", error);
            setError('Failed to fetch services. Is the backend running?');
        }
    }, []);

    const fetchDefaultServices = useCallback(async () => {
        try {
            const response = await fetch('/api/default-services/', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (!response.ok) throw new Error('Failed to fetch default services');
            const data = await response.json();
            setDefaultServices(data);
            setDefaultServiceError(null);
        } catch (error) {
            console.error("Error fetching default services:", error);
            setDefaultServiceError('فشل في جلب الخدمات الافتراضية');
        }
    }, [auth]);

    useEffect(() => {
        fetchServices();
        fetchDefaultServices();
    }, [fetchServices, fetchDefaultServices]);

    const handleAdd = () => {
        setIsEditing(false);
        setCurrentService({ id: null, name: '', description: '', link: '', image_url: '' });
        setImageFile(null);
        setIsModalOpen(true);
    };

    const handleEdit = (service) => {
        setIsEditing(true);
        setCurrentService(service);
        setImageFile(null);
        setIsModalOpen(true);
    };

    const handleDelete = async (serviceId) => {
        if (window.confirm('Are you sure you want to delete this service?')) {
            try {
                const response = await fetch(`/api/services/${serviceId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Basic ${auth}` },
                });
                if (!response.ok) throw new Error('Failed to delete service');
                fetchServices();
            } catch (error) {
                console.error("Error deleting service:", error);
                setError('Failed to delete service.');
            }
        }
    };

    const handleFileChange = (e) => {
        setImageFile(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        let imageUrl = currentService.image_url;

        if (imageFile) {
            const formData = new FormData();
            formData.append("file", imageFile);
            try {
                const uploadResponse = await fetch('/api/upload-image/', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}` },
                    body: formData,
                });
                if (!uploadResponse.ok) throw new Error('Image upload failed');
                const uploadData = await uploadResponse.json();
                imageUrl = uploadData.image_url;
            } catch (error) {
                console.error("Error uploading image:", error);
                setError(`Failed to upload image: ${error.message}`);
                setIsSaving(false);
                return;
            }
        }
        
        const serviceToSubmit = { ...currentService, image_url: imageUrl };
        const url = isEditing ? `/api/services/${currentService.id}` : '/api/services/';
        const method = isEditing ? 'PATCH' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(serviceToSubmit),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to save service');
            }
            fetchServices();
            setIsModalOpen(false);
            setImageFile(null);
        } catch (error) {
            console.error("Error saving service:", error);
            setError(`Failed to save service: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCurrentService(prev => ({ ...prev, [name]: value }));
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setError(null); // Clear errors when closing modal
    }

    // Default services functions
    const toggleDefaultService = async (serviceId) => {
        setServiceActions(prev => ({ ...prev, [serviceId]: 'toggling' }));
        setDefaultServiceError(null);
        setDefaultServiceSuccess(null);
        
        try {
            const response = await fetch(`/api/default-services/${serviceId}/toggle`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'فشل في تغيير حالة الخدمة');
            }
            
            setDefaultServiceSuccess(data.message);
            fetchDefaultServices(); // Refresh the list
            
        } catch (error) {
            console.error("Error toggling service:", error);
            setDefaultServiceError(error.message);
        } finally {
            setServiceActions(prev => ({ ...prev, [serviceId]: null }));
        }
    };

    const startDefaultService = async (serviceId) => {
        setServiceActions(prev => ({ ...prev, [serviceId]: 'starting' }));
        setDefaultServiceError(null);
        setDefaultServiceSuccess(null);
        
        try {
            const response = await fetch(`/api/default-services/${serviceId}/start`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'فشل في تشغيل الخدمة');
            }
            
            setDefaultServiceSuccess(data.message);
            fetchDefaultServices(); // Refresh the list
            
        } catch (error) {
            console.error("Error starting service:", error);
            setDefaultServiceError(error.message);
        } finally {
            setServiceActions(prev => ({ ...prev, [serviceId]: null }));
        }
    };

    const stopDefaultService = async (serviceId) => {
        setServiceActions(prev => ({ ...prev, [serviceId]: 'stopping' }));
        setDefaultServiceError(null);
        setDefaultServiceSuccess(null);
        
        try {
            const response = await fetch(`/api/default-services/${serviceId}/stop`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'فشل في إيقاف الخدمة');
            }
            
            setDefaultServiceSuccess(data.message);
            fetchDefaultServices(); // Refresh the list
            
        } catch (error) {
            console.error("Error stopping service:", error);
            setDefaultServiceError(error.message);
        } finally {
            setServiceActions(prev => ({ ...prev, [serviceId]: null }));
        }
    };

    const restartDefaultService = async (serviceId) => {
        setServiceActions(prev => ({ ...prev, [serviceId]: 'restarting' }));
        setDefaultServiceError(null);
        setDefaultServiceSuccess(null);
        
        try {
            const response = await fetch(`/api/default-services/${serviceId}/restart`, {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'فشل في إعادة تشغيل الخدمة');
            }
            
            setDefaultServiceSuccess(data.message);
            fetchDefaultServices(); // Refresh the list
            
        } catch (error) {
            console.error("Error restarting service:", error);
            setDefaultServiceError(error.message);
        } finally {
            setServiceActions(prev => ({ ...prev, [serviceId]: null }));
        }
    };

    const getServiceIcon = (serviceName, iconUrl, large = false) => {
        const imgSize = large ? 112 : 40;
        const iconSize = large ? 80 : 40;
        if (iconUrl) {
            return (
                <Box 
                    component="img" 
                    src={iconUrl} 
                    alt={serviceName}
                    sx={{ 
                        width: imgSize, 
                        height: imgSize, 
                        borderRadius: 2,
                        objectFit: 'cover'
                    }} 
                />
            );
        }
        if (serviceName.includes('قرآن') || serviceName.includes('القرآن')) {
            return <MenuBookIcon sx={{ fontSize: iconSize, color: 'success.main' }} />;
        } else if (serviceName.includes('قافية')) {
            return <LanguageIcon sx={{ fontSize: iconSize, color: 'primary.main' }} />;
        }
        return <SettingsIcon sx={{ fontSize: iconSize, color: 'text.secondary' }} />;
    };

    // Default service edit functions
    const handleEditDefaultService = (service) => {
        setIsEditingDefaultService(true);
        setCurrentDefaultService({
            id: service.id,
            name: service.name,
            description: service.description,
            icon_url: service.icon_url || ''
        });
        setDefaultServiceImageFile(null);
        setIsDefaultServiceModalOpen(true);
    };

    const handleDefaultServiceFileChange = (e) => {
        setDefaultServiceImageFile(e.target.files[0]);
    };

    const handleDefaultServiceSubmit = async (e) => {
        e.preventDefault();
        setIsSavingDefaultService(true);
        setDefaultServiceError(null);
        setDefaultServiceSuccess(null);

        let iconUrl = currentDefaultService.icon_url;

        if (defaultServiceImageFile) {
            const formData = new FormData();
            formData.append("file", defaultServiceImageFile);
            try {
                const uploadResponse = await fetch('/api/upload-image/', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}` },
                    body: formData,
                });
                if (!uploadResponse.ok) throw new Error('Image upload failed');
                const uploadData = await uploadResponse.json();
                iconUrl = uploadData.image_url;
            } catch (error) {
                console.error("Error uploading image:", error);
                setDefaultServiceError(`فشل في رفع الصورة: ${error.message}`);
                setIsSavingDefaultService(false);
                return;
            }
        }
        
        const serviceToSubmit = { 
            name: currentDefaultService.name,
            description: currentDefaultService.description,
            icon_url: iconUrl 
        };

        try {
            const response = await fetch(`/api/default-services/${currentDefaultService.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                body: JSON.stringify(serviceToSubmit),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'فشل في حفظ الخدمة');
            }
            setDefaultServiceSuccess('تم حفظ الخدمة بنجاح');
            fetchDefaultServices();
            setIsDefaultServiceModalOpen(false);
            setDefaultServiceImageFile(null);
        } catch (error) {
            console.error("Error saving default service:", error);
            setDefaultServiceError(`فشل في حفظ الخدمة: ${error.message}`);
        } finally {
            setIsSavingDefaultService(false);
        }
    };
    
    const handleDefaultServiceInputChange = (e) => {
        const { name, value } = e.target;
        setCurrentDefaultService(prev => ({ ...prev, [name]: value }));
    };

    const closeDefaultServiceModal = () => {
        setIsDefaultServiceModalOpen(false);
        setDefaultServiceError(null);
    };

    const isQuranService = (service) => {
        const n = (service?.name || '').trim();
        return n.includes('القرآن') || n.includes('قرآن');
    };

    const fetchQuranSettings = useCallback(async (syncSelection = false) => {
        const response = await fetch('/api/quran/settings', {
            headers: { 'Authorization': `Basic ${auth}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'فشل في جلب إعدادات القرآن');
        }
        const data = await response.json();
        setQuranSettings(data);
        if (syncSelection) {
            setSelectedReciterIds(data.selected_reciter_ids || []);
            setQuranSelectionDirty(false);
        }
    }, [auth]);

    const openQuranSettings = async () => {
        setQuranError(null);
        setQuranLoading(true);
        setIsQuranSettingsOpen(true);
        try {
            await fetchQuranSettings(true);
        } catch (e) {
            setQuranError(e.message);
        } finally {
            setQuranLoading(false);
        }
    };

    const closeQuranSettings = () => {
        setIsQuranSettingsOpen(false);
        setQuranError(null);
    };

    useEffect(() => {
        if (!isQuranSettingsOpen) return undefined;
        const timer = setInterval(() => {
            fetchQuranSettings(!quranSelectionDirty).catch(() => {});
        }, 3000);
        return () => clearInterval(timer);
    }, [isQuranSettingsOpen, fetchQuranSettings, quranSelectionDirty]);

    const toggleReciterSelection = (reciterId) => {
        setQuranSelectionDirty(true);
        setSelectedReciterIds(prev => (
            prev.includes(reciterId)
                ? prev.filter(x => x !== reciterId)
                : [...prev, reciterId]
        ));
    };

    const saveRecitersSelection = async () => {
        setQuranActionLoading(true);
        setQuranError(null);
        try {
            const response = await fetch('/api/quran/settings/select-reciters', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ reciter_ids: selectedReciterIds }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'فشل في حفظ التحديد');
            }
            await fetchQuranSettings(true);
            setDefaultServiceSuccess('تم حفظ اختيار المقرئين');
        } catch (e) {
            setQuranError(e.message);
        } finally {
            setQuranActionLoading(false);
        }
    };

    const startRecitersDownload = async () => {
        setQuranActionLoading(true);
        setQuranError(null);
        try {
            const response = await fetch('/api/quran/download/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ reciter_ids: selectedReciterIds }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'فشل في بدء التنزيل');
            }
            await fetchQuranSettings(false);
            setDefaultServiceSuccess('تم بدء تنزيل المقرئين المحددين');
        } catch (e) {
            setQuranError(e.message);
        } finally {
            setQuranActionLoading(false);
        }
    };

    const pauseRecitersDownload = async () => {
        setQuranActionLoading(true);
        setQuranError(null);
        try {
            await fetch('/api/quran/download/pause', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            await fetchQuranSettings(false);
        } catch (e) {
            setQuranError(e.message || 'فشل الإيقاف المؤقت');
        } finally {
            setQuranActionLoading(false);
        }
    };

    const resumeRecitersDownload = async () => {
        setQuranActionLoading(true);
        setQuranError(null);
        try {
            await fetch('/api/quran/download/resume', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            await fetchQuranSettings(false);
        } catch (e) {
            setQuranError(e.message || 'فشل استئناف التنزيل');
        } finally {
            setQuranActionLoading(false);
        }
    };

    const stopRecitersDownload = async () => {
        setQuranActionLoading(true);
        setQuranError(null);
        try {
            await fetch('/api/quran/download/stop', {
                method: 'POST',
                headers: { 'Authorization': `Basic ${auth}` }
            });
            await fetchQuranSettings(false);
        } catch (e) {
            setQuranError(e.message || 'فشل إيقاف التنزيل');
        } finally {
            setQuranActionLoading(false);
        }
    };

    return (
        <>
            <Paper sx={{ width: '100%' }}>
                {(() => {
                    const perms = getUserPermissions(userInfo);
                    const allTabs = [
                        { key: 'الخدمات > الخدمات الافتراضية', label: 'الخدمات الافتراضية', id: 'default' },
                        { key: 'الخدمات > الخدمات المخصصة', label: 'الخدمات المخصصة', id: 'custom' },
                        { key: 'الخدمات > إحصائيات الخدمات', label: 'إحصائيات الخدمات', id: 'stats' },
                    ];
                    const visibleTabs = allTabs.filter(t => isSubSectionVisible(perms, t.key));
                    const activeTabId = visibleTabs[currentTab]?.id || visibleTabs[0]?.id;
                    return (<>
                <Tabs
                    value={Math.min(currentTab, visibleTabs.length - 1)}
                    onChange={(e, newValue) => setCurrentTab(newValue)}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                    {visibleTabs.map(t => <Tab key={t.id} label={t.label} />)}
                </Tabs>

                {activeTabId === 'default' && (
                    <Box sx={{ p: { xs: '15px', md: 3 } }}>
                        {defaultServiceError && <Alert severity="error" sx={{ mb: 2 }}>{defaultServiceError}</Alert>}
                        {defaultServiceSuccess && <Alert severity="success" sx={{ mb: 2 }}>{defaultServiceSuccess}</Alert>}
                        
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            خدمات مثبته في السيرفر يمكنك ادرتها من هنا ( تفعيل / تعطيل – إيقاف / تشغيل – إعادة تشغيل – تغير المسميات والوصف والصور )
                        </Typography>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {defaultServices.map((service) => {
                                const actionState = serviceActions[service.id];
                                
                                return (
                                    <Card key={service.id} variant="outlined" sx={{ overflow: 'hidden' }}>
                                        <CardContent
                                            sx={{
                                                p: 0,
                                                width: '100%',
                                                '&.MuiCardContent-root': { padding: 0, paddingBottom: '0 !important' },
                                                '&.MuiCardContent-root:last-child': { paddingBottom: '0 !important' },
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'stretch',
                                                    flexDirection: { xs: 'column', sm: 'row' },
                                                    width: '100%',
                                                    minHeight: { sm: 168 },
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        width: { xs: '100%', sm: 168 },
                                                        flexShrink: 0,
                                                        alignSelf: 'stretch',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        minHeight: { xs: 160, sm: 0 },
                                                        overflow: 'hidden',
                                                        bgcolor: (t) => (t.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
                                                        borderBottom: { xs: 1, sm: 0 },
                                                        borderInlineEnd: { xs: 0, sm: 1 },
                                                        borderColor: 'divider',
                                                    }}
                                                >
                                                    {service.icon_url ? (
                                                        <Box
                                                            sx={{
                                                                position: 'relative',
                                                                flex: 1,
                                                                width: '100%',
                                                                minHeight: { xs: 160, sm: 0 },
                                                                alignSelf: 'stretch',
                                                            }}
                                                        >
                                                            <Box
                                                                component="img"
                                                                src={service.icon_url}
                                                                alt={service.name}
                                                                sx={{
                                                                    position: 'absolute',
                                                                    inset: 0,
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'cover',
                                                                    objectPosition: 'center',
                                                                    display: 'block',
                                                                }}
                                                            />
                                                        </Box>
                                                    ) : (
                                                        <Box
                                                            sx={{
                                                                flex: 1,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                minHeight: { xs: 160, sm: 200 },
                                                                p: 2.5,
                                                            }}
                                                        >
                                                            {getServiceIcon(service.name, null, true)}
                                                        </Box>
                                                    )}
                                                </Box>
                                                <Box
                                                    sx={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                        width: { sm: '100%' },
                                                        p: 2.5,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        justifyContent: 'flex-start',
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'flex-start',
                                                            justifyContent: 'space-between',
                                                            gap: 2,
                                                            width: '100%',
                                                            mb: 1,
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                                                            <Typography variant="h6" component="h3">
                                                                {service.name}
                                                            </Typography>
                                                            <IconButton 
                                                                onClick={() => handleEditDefaultService(service)} 
                                                                color="primary"
                                                                size="small"
                                                                aria-label="تعديل الخدمة"
                                                            >
                                                                <EditIcon />
                                                            </IconButton>
                                                            {isQuranService(service) && (
                                                                <IconButton
                                                                    onClick={openQuranSettings}
                                                                    color="secondary"
                                                                    size="small"
                                                                    aria-label="إعدادات القرآن"
                                                                >
                                                                    <SettingsIcon />
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                        <Chip 
                                                            label={service.is_running ? 'تعمل' : 'لا تعمل'}
                                                            color={service.is_running ? 'success' : 'error'}
                                                            size="small"
                                                            variant="filled"
                                                            sx={{ flexShrink: 0 }}
                                                        />
                                                    </Box>
                                                    <Box
                                                        sx={{
                                                            display: 'flex',
                                                            flexDirection: { xs: 'column', sm: 'row' },
                                                            alignItems: { xs: 'center', sm: 'flex-start' },
                                                            justifyContent: { xs: 'center', sm: 'space-between' },
                                                            gap: { xs: 1, sm: 2 },
                                                            width: '100%',
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="body2"
                                                            color="text.secondary"
                                                            sx={{
                                                                mb: 0,
                                                                flex: { sm: '1 1 auto' },
                                                                minWidth: 0,
                                                                textAlign: { xs: 'center', sm: 'start' },
                                                                width: { xs: '100%', sm: 'auto' },
                                                            }}
                                                        >
                                                            {service.description}
                                                        </Typography>
                                                        {service.url && (
                                                            <Link 
                                                                href={service.url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                sx={{
                                                                    display: 'block',
                                                                    flexShrink: 0,
                                                                    maxWidth: { sm: '48%' },
                                                                    textAlign: { xs: 'center', sm: 'end' },
                                                                    wordBreak: 'break-all',
                                                                    alignSelf: { xs: 'center', sm: 'center' },
                                                                    width: { xs: '100%', sm: 'auto' },
                                                                }}
                                                            >
                                                                {service.url}
                                                            </Link>
                                                        )}
                                                    </Box>
                                                    <Box
                                                        component="div"
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexWrap: 'wrap',
                                                            gap: 1.5,
                                                            width: '100%',
                                                            mt: 2,
                                                            pt: 2,
                                                            borderTop: 1,
                                                            borderColor: 'divider',
                                                            boxSizing: 'border-box',
                                                        }}
                                                    >
                                                        <FormControlLabel
                                                            control={
                                                                <Switch 
                                                                    checked={service.is_active} 
                                                                    onChange={() => toggleDefaultService(service.id)}
                                                                    disabled={!!actionState}
                                                                />
                                                            }
                                                            label={service.is_active ? "مفعلة" : "معطلة"}
                                                            sx={{ m: 0 }}
                                                        />
                                                        {service.is_running ? (
                                                            <Button
                                                                size="small"
                                                                startIcon={
                                                                    actionState === 'stopping' ? <CircularProgress size={16} /> : <StopIcon />
                                                                }
                                                                onClick={() => stopDefaultService(service.id)}
                                                                disabled={!service.is_active || !!actionState}
                                                                color="error"
                                                            >
                                                                إيقاف
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="small"
                                                                startIcon={
                                                                    actionState === 'starting' ? <CircularProgress size={16} /> : <PlayIcon />
                                                                }
                                                                onClick={() => startDefaultService(service.id)}
                                                                disabled={!service.is_active || !!actionState}
                                                                color="success"
                                                            >
                                                                تشغيل
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="small"
                                                            startIcon={
                                                                actionState === 'restarting' ? <CircularProgress size={16} /> : <RefreshIcon />
                                                            }
                                                            onClick={() => restartDefaultService(service.id)}
                                                            disabled={!service.is_active || !!actionState}
                                                            color="primary"
                                                        >
                                                            إعادة تشغيل
                                                        </Button>
                                                    </Box>
                                                </Box>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                            
                            {defaultServices.length === 0 && (
                                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                                    لا توجد خدمات افتراضية مثبتة
                                </Typography>
                            )}
                        </Box>
                    </Box>
                )}

                {activeTabId === 'stats' && (
                    <Box sx={{ p: { xs: '15px', md: 3 } }}>
                        <ServiceStatsManager auth={auth} />
                    </Box>
                )}

                {activeTabId === 'custom' && (
                    <Box sx={{ p: { xs: '15px', md: 3 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">
                                الخدمات المخصصة
                            </Typography>
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
                                إضافة خدمة جديدة
                            </Button>
                        </Box>

                        {error && !isModalOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                        <TableContainer component={Paper}>
                            <Table sx={{ minWidth: 650 }} aria-label="simple table">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 'bold' } }}>
                                        <TableCell>الاسم</TableCell>
                                        <TableCell>الوصف</TableCell>
                                        <TableCell>الرابط</TableCell>
                                        <TableCell>الإجراءات</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {services.map((service) => (
                                        <TableRow key={service.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                            <TableCell component="th" scope="row">{service.name}</TableCell>
                                            <TableCell>{service.description}</TableCell>
                                            <TableCell>
                                                <Link href={`/api/services/${service.id}/open`} target="_blank" rel="noopener noreferrer">
                                                    {service.link}
                                                </Link>
                                            </TableCell>
                                            <TableCell align="right">
                                                <IconButton onClick={() => handleEdit(service)} color="primary"><EditIcon /></IconButton>
                                                <IconButton onClick={() => handleDelete(service.id)} color="error"><DeleteIcon /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
                </>); })()}
            </Paper>

            <Modal 
                isOpen={isModalOpen} 
                onClose={closeModal}
                title={isEditing ? 'تعديل الخدمة' : 'إضافة خدمة'}
                actions={
                    <>
                        <Button onClick={closeModal}>إلغاء</Button>
                        <Button onClick={handleSubmit} variant="contained" disabled={isSaving}>
                            {isSaving ? <CircularProgress size={24} /> : 'حفظ'}
                        </Button>
                    </>
                }
            >
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                    {error && isModalOpen && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <TextField
                        margin="dense" required fullWidth id="name" label="الاسم" name="name"
                        value={currentService.name} onChange={handleInputChange} autoFocus
                    />
                    <TextField
                        margin="dense" fullWidth multiline rows={4} id="description" label="الوصف"
                        name="description" value={currentService.description} onChange={handleInputChange}
                    />
                    <TextField
                        margin="dense" required fullWidth id="link" label="الرابط" name="link" type="url"
                        value={currentService.link} onChange={handleInputChange}
                    />
                    <Box sx={{ mt: 2, mb: 1 }}>
                        <Button
                            variant="outlined"
                            component="label"
                            startIcon={<CloudUploadIcon />}
                        >
                            رفع صورة
                            <input
                                type="file"
                                hidden
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                            />
                        </Button>
                        {imageFile && <Typography variant="body2" sx={{ display: 'inline', ml: 2 }}>{imageFile.name}</Typography>}
                        {isEditing && currentService.image_url && !imageFile && (
                           <Box sx={{ mt: 2 }}>
                               <Typography variant="body2" color="text.secondary">الصورة الحالية:</Typography>
                               <img src={currentService.image_url} alt="Current" style={{width: 80, height: 80, objectFit: 'cover', borderRadius: '4px', marginTop: '8px'}}/>
                           </Box>
                        )}
                    </Box>
                </Box>
            </Modal>

            {/* Default Service Edit Modal */}
            <Modal 
                isOpen={isDefaultServiceModalOpen} 
                onClose={closeDefaultServiceModal}
                title={`تعديل الخدمة: ${currentDefaultService.name}`}
                actions={
                    <>
                        <Button onClick={closeDefaultServiceModal}>إلغاء</Button>
                        <Button onClick={handleDefaultServiceSubmit} variant="contained" disabled={isSavingDefaultService}>
                            {isSavingDefaultService ? <CircularProgress size={24} /> : 'حفظ'}
                        </Button>
                    </>
                }
            >
                <Box component="form" onSubmit={handleDefaultServiceSubmit} noValidate sx={{ mt: 1 }}>
                    {defaultServiceError && isDefaultServiceModalOpen && <Alert severity="error" sx={{ mb: 2 }}>{defaultServiceError}</Alert>}
                    <TextField
                        margin="dense" required fullWidth id="default-name" label="الاسم" name="name"
                        value={currentDefaultService.name} onChange={handleDefaultServiceInputChange} autoFocus
                    />
                    <TextField
                        margin="dense" fullWidth multiline rows={4} id="default-description" label="الوصف"
                        name="description" value={currentDefaultService.description} onChange={handleDefaultServiceInputChange}
                    />
                    <Box sx={{ mt: 2, mb: 1 }}>
                        <Button
                            variant="outlined"
                            component="label"
                            startIcon={<CloudUploadIcon />}
                        >
                            رفع أيقونة
                            <input
                                type="file"
                                hidden
                                ref={defaultServiceFileInputRef}
                                onChange={handleDefaultServiceFileChange}
                                accept="image/*"
                            />
                        </Button>
                        {defaultServiceImageFile && <Typography variant="body2" sx={{ display: 'inline', ml: 2 }}>{defaultServiceImageFile.name}</Typography>}
                        {isEditingDefaultService && currentDefaultService.icon_url && !defaultServiceImageFile && (
                           <Box sx={{ mt: 2 }}>
                               <Typography variant="body2" color="text.secondary">الأيقونة الحالية:</Typography>
                               <img src={currentDefaultService.icon_url} alt="Current" style={{width: 80, height: 80, objectFit: 'cover', borderRadius: '4px', marginTop: '8px'}}/>
                           </Box>
                        )}
                    </Box>
                </Box>
            </Modal>

            <Modal
                isOpen={isQuranSettingsOpen}
                onClose={closeQuranSettings}
                title="إعدادات القرآن الكريم"
                actions={
                    <>
                        <Button onClick={closeQuranSettings}>إغلاق</Button>
                        <Button onClick={saveRecitersSelection} variant="outlined" disabled={quranActionLoading || quranLoading}>
                            {quranActionLoading ? <CircularProgress size={20} /> : 'حفظ الاختيار'}
                        </Button>
                        {quranSettings?.download_state?.status === 'downloading' && (
                            <Button
                                onClick={pauseRecitersDownload}
                                variant="outlined"
                                startIcon={<PauseIcon />}
                                disabled={quranActionLoading || quranLoading}
                            >
                                إيقاف مؤقت
                            </Button>
                        )}
                        {quranSettings?.download_state?.status === 'paused' && (
                            <Button
                                onClick={resumeRecitersDownload}
                                variant="outlined"
                                startIcon={<PlayIcon />}
                                disabled={quranActionLoading || quranLoading}
                            >
                                استئناف
                            </Button>
                        )}
                        {(quranSettings?.download_state?.status === 'downloading' || quranSettings?.download_state?.status === 'paused') && (
                            <Button
                                onClick={stopRecitersDownload}
                                variant="outlined"
                                color="error"
                                startIcon={<StopIcon />}
                                disabled={quranActionLoading || quranLoading}
                            >
                                إيقاف
                            </Button>
                        )}
                        <Button
                            onClick={startRecitersDownload}
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            disabled={quranActionLoading || quranLoading || selectedReciterIds.length === 0}
                        >
                            بدء تنزيل المحدد
                        </Button>
                    </>
                }
            >
                <Box sx={{ mt: 1 }}>
                    {quranError && <Alert severity="error" sx={{ mb: 2 }}>{quranError}</Alert>}
                    {quranLoading && <CircularProgress size={26} />}

                    {!quranLoading && quranSettings && (
                        <>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                وضع التشغيل المتاح لخدمة القرآن: <strong>محلي فقط</strong>
                            </Alert>

                            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Chip label={`إجمالي المقرئين: ${quranSettings.reciters?.length || 0}`} size="small" />
                                <Chip label={`المكتمل تنزيلهم: ${quranSettings.downloaded_reciters?.length || 0}`} color="success" size="small" />
                                <Chip label={`غير مكتملين: ${quranSettings.pending_reciters?.length || 0}`} color="warning" size="small" />
                            </Box>

                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>حالة التنزيل الحالية</Typography>
                                <LinearProgress variant="determinate" value={quranSettings.download_state?.progress || 0} />
                                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip label={`الحالة: ${quranSettings.download_state?.status || 'idle'}`} size="small" />
                                    <Chip label={`التقدم: ${quranSettings.download_state?.progress || 0}%`} size="small" />
                                    <Chip label={`المنجز: ${quranSettings.download_state?.processed_targets || 0} / ${quranSettings.download_state?.total_targets || 0}`} size="small" />
                                    <Chip label={`تم تنزيله: ${quranSettings.download_state?.downloaded_files || 0}`} color="primary" size="small" />
                                    <Chip label={`موجود مسبقاً: ${quranSettings.download_state?.skipped_files || 0}`} color="default" size="small" />
                                    <Chip label={`فشل: ${quranSettings.download_state?.failed_files || 0}`} color="error" size="small" />
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                    {quranSettings.download_state?.message || 'لا توجد عملية تنزيل حالياً'}
                                </Typography>
                            </Box>

                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                المقرئون غير المكتمل تنزيلهم
                            </Typography>
                            <Box sx={{ maxHeight: 300, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                                {(quranSettings.pending_reciters || []).map((r) => (
                                    <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
                                        <Checkbox
                                            checked={selectedReciterIds.includes(r.id)}
                                            onChange={() => toggleReciterSelection(r.id)}
                                        />
                                        <Typography variant="body2">{r.name_ar}</Typography>
                                    </Box>
                                ))}
                                {(quranSettings.pending_reciters || []).length === 0 && (
                                    <Typography variant="body2" color="text.secondary">
                                        جميع المقرئين تم تنزيل ملفاتهم الصوتية بالكامل.
                                    </Typography>
                                )}
                            </Box>
                        </>
                    )}
                </Box>
            </Modal>
        </>
    );
};

export default ServiceManager; 