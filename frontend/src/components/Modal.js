import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, DialogActions } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const Modal = ({ isOpen, onClose, title, children, actions }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {title}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {children}
      </DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </Dialog>
  );
};

export default Modal; 