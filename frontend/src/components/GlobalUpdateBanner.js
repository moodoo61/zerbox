import React from 'react';
import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useUpdateStatus } from './UpdateStatusProvider';

const GlobalUpdateBanner = () => {
    const navigate = useNavigate();
    const { updateStatus, isUpdateInProgress } = useUpdateStatus();

    if (!isUpdateInProgress || !updateStatus) {
        return null;
    }

    return (
        <Alert
            severity="info"
            icon={<CircularProgress size={16} />}
            sx={{ mb: 1.5, alignItems: 'center' }}
            action={(
                <Button
                    size="small"
                    color="inherit"
                    onClick={() => navigate('/admin/settings', { state: { tab: 3 } })}
                >
                    فتح صفحة التحديث
                </Button>
            )}
        >
            <Box sx={{ minWidth: { xs: 200, md: 320 } }}>
                <Typography variant="body2" fontWeight={700}>
                    عملية التحديث جارية في الخلفية
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.75 }}>
                    {updateStatus.message || 'جاري تجهيز التحديث...'}
                </Typography>
                <LinearProgress
                    variant="determinate"
                    value={updateStatus.progress || 0}
                    sx={{ height: 6, borderRadius: 3 }}
                />
            </Box>
        </Alert>
    );
};

export default GlobalUpdateBanner;
