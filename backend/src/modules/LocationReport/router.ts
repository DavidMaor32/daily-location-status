import { Router } from 'express';
import { handleGetReports, handleGetReportById, handleAddReport } from './handlers';

const router = Router();

// Get reports by query parameters
router.get('/', handleGetReports);

// Get report by ID
router.get('/:id', handleGetReportById);

// Add a new report
router.post('/', handleAddReport);

export default router;