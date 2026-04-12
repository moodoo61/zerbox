import React from 'react';
import {
    Card, CardMedia, CardContent, Typography, Box, Chip
} from '@mui/material';
import { shadows, transitions } from '../../styles/animations';

const ServiceCard = ({ service, onServiceClick, index }) => {
    const handleCardClick = () => {
        const sid = String(service.id);
        const isDefaultService = sid.startsWith('999');
        const trackedUrl = isDefaultService
            ? `/api/default-services/${sid.slice(3)}/open`
            : `/api/services/${sid}/open`;
        window.open(trackedUrl, '_blank', 'noopener,noreferrer');
        if (typeof onServiceClick === 'function') onServiceClick(service.id);
    };

    const cardStyles = {
        aspectRatio: '1', // جعل البطاقة مربعة
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'linear-gradient(145deg, #ffffff, #f8f9fa)',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: shadows.card,
        transition: transitions.hover,
        animation: `slideInUp 0.6s ease-out ${index * 0.1}s both`,
        position: 'relative',
        cursor: 'pointer',
        '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #1976d2, #42a5f5, #64b5f6)',
            opacity: 0,
            transition: 'opacity 0.3s ease'
        },
        '&:hover': {
            transform: 'translateY(-12px) scale(1.02)',
            boxShadow: shadows.cardHover,
            '&::before': {
                opacity: 1
            }
        }
    };



    return (
        <Card sx={cardStyles} onClick={handleCardClick}>
            {/* Expanded Image Area */}
            <Box sx={{ 
                position: 'relative',
                height: '65%', // زيادة مساحة الصورة
                overflow: 'hidden'
            }}>
                <CardMedia
                    component="img"
                    sx={{
                        height: '100%',
                        width: '100%',
                        objectFit: 'cover', // stretch الصورة
                        transition: 'transform 0.3s ease',
                        '&:hover': {
                            transform: 'scale(1.05)'
                        }
                    }}
                    image={service.image_url || 'https://via.placeholder.com/300x300/e3f2fd/1976d2?text=تطبيق'}
                    alt={service.name}
                />
                
                {/* Gradient overlay for better text visibility */}
                <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '40%',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))'
                }} />
                
                <Chip
                    label="متاح"
                    size="small"
                    sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'success.main',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.6rem',
                        height: 18,
                        '& .MuiChip-label': {
                            px: 0.8,
                            py: 0
                        },
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        zIndex: 2
                    }}
                />
            </Box>

            {/* Compact Content Area */}
            <CardContent sx={{ 
                height: '35%', // تقليل مساحة النص
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <Typography 
                    variant="subtitle1" 
                    component="h3" 
                    sx={{
                        fontWeight: 'bold',
                        color: 'primary.main',
                        mb: 0.3,
                        fontSize: '0.85rem',
                        lineHeight: 1.1,
                        textAlign: 'center'
                    }}
                >
                    {service.name}
                </Typography>
                
                <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{
                        lineHeight: 1.2,
                        fontSize: '0.7rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 1, // سطر واحد فقط
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textAlign: 'center'
                    }}
                >
                    {service.description || 'خدمة مميزة'}
                </Typography>
            </CardContent>
        </Card>
    );
};

export default ServiceCard;
