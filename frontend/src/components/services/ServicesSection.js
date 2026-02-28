import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Container, Typography, Box, Grid, Skeleton, Alert, Paper, Button, Fab, Zoom
} from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ServiceCard from './ServiceCard';

const ServicesSection = ({ 
    services, 
    loading, 
    error, 
    onServiceClick,
    showScrollToApps,
    onScrollToApps 
}) => {
    const EmptyState = () => (
        <Grid item xs={12}>
            <Paper sx={{ 
                p: 6, 
                textAlign: 'center', 
                background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                borderRadius: 4,
                border: '1px solid rgba(0,0,0,0.08)'
            }}>
                <Box sx={{
                    background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                    borderRadius: '50%',
                    width: 80,
                    height: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 3,
                    boxShadow: '0 8px 32px rgba(25, 118, 210, 0.3)'
                }}>
                    <AppsIcon sx={{ fontSize: 40, color: 'white' }} />
                </Box>
                <Typography variant="h5" sx={{ 
                    fontWeight: 'bold',
                    color: 'primary.main',
                    mb: 2 
                }}>
                    لا توجد تطبيقات لعرضها حاليًا
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400, mx: 'auto' }}>
                    قم بإضافة التطبيقات والخدمات المفيدة من لوحة التحكم لتوفير تجربة أفضل للمستخدمين
                </Typography>
                <Button
                    component={RouterLink}
                    to="/admin"
                    variant="contained"
                    size="large"
                    startIcon={<AdminPanelSettingsIcon />}
                    sx={{
                        background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                        fontWeight: 'bold',
                        px: 4,
                        py: 1.5,
                        borderRadius: 3,
                        '&:hover': {
                            background: 'linear-gradient(45deg, #1565c0, #1976d2)',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 8px 25px rgba(25, 118, 210, 0.4)'
                        },
                        transition: 'all 0.3s ease'
                    }}
                >
                    الانتقال إلى لوحة التحكم
                </Button>
            </Paper>
        </Grid>
    );

    const LoadingSkeleton = () => (
        Array.from(new Array(8)).map((item, index) => (
            <Grid item key={index} xs={12} sm={6} md={4} lg={3}>
                <Box sx={{ animation: `slideInUp 0.6s ease-out ${index * 0.1}s both` }}>
                    <Skeleton 
                        variant="rectangular" 
                        sx={{ 
                            aspectRatio: '1', // مربع
                            borderRadius: 2, 
                            mb: 1 
                        }} 
                    />
                    <Skeleton height={20} sx={{ mb: 0.5 }} />
                    <Skeleton height={15} width="80%" sx={{ mb: 0.5 }} />
                    <Skeleton height={15} width="60%" />
                </Box>
            </Grid>
        ))
    );

    return (
        <>
            <Container sx={{ py: { xs: 4, md: 8 }, px: { xs: 1, sm: 2, md: 3 } }} maxWidth="lg" id="applications-section">
                {/* Section Header */}
                <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 8 } }}>
                    <Typography variant="h4" component="h2" sx={{
                        fontWeight: 'bold',
                        background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 2,
                        fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem' } // تصغير حجم الخط أكثر
                    }}>
                        قسم الخدمات
                    </Typography>
                    
                    <Box sx={{
                        width: 80,
                        height: 4,
                        background: 'linear-gradient(90deg, #1976d2, #42a5f5)',
                        borderRadius: 2,
                        mx: 'auto',
                        mb: 3
                    }} />
                    

                    

                </Box>

                {/* Error Alert */}
                {error && (
                    <Alert 
                        severity="error" 
                        sx={{ 
                            mb: 4,
                            borderRadius: 3,
                            '& .MuiAlert-icon': {
                                fontSize: '1.5rem'
                            }
                        }}
                    >
                        {error}
                    </Alert>
                )}
                
                {/* Services Grid */}
                <Grid container spacing={{ xs: 2, sm: 3, md: 4 }}>
                    {loading ? (
                        <LoadingSkeleton />
                    ) : services.length === 0 && !error ? (
                        <EmptyState />
                    ) : (
                        services.map((service, index) => (
                            <Grid item key={service.id} xs={12} sm={6} md={4} lg={3}>
                                <ServiceCard 
                                    service={service}
                                    onServiceClick={onServiceClick}
                                    index={index}
                                />
                            </Grid>
                        ))
                    )}
                </Grid>
            </Container>

            {/* Floating Action Button */}
            <Zoom in={showScrollToApps}>
                <Fab
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        zIndex: 1000,
                        background: 'linear-gradient(45deg, #1976d2, #42a5f5)',
                        color: 'white',
                        boxShadow: '0 8px 32px rgba(25, 118, 210, 0.4)',
                        '&:hover': {
                            background: 'linear-gradient(45deg, #1565c0, #1976d2)',
                            transform: 'scale(1.1)',
                            boxShadow: '0 12px 40px rgba(25, 118, 210, 0.5)'
                        },
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onClick={onScrollToApps}
                >
                    <AppsIcon />
                </Fab>
            </Zoom>
        </>
    );
};

export default ServicesSection;
