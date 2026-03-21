import { Request, Response } from 'express';
import { getReportsByQuery, getReportById, addReport } from './dal';

// Get reports by query parameters
export async function handleGetReports(req: Request, res: Response) {
  try {
    const reports = await getReportsByQuery(req.query);
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
}

// Get report by ID
export async function handleGetReportById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const report = await getReportById(id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
}

// Add a new report
export async function handleAddReport(req: Request, res: Response) {
  try {
    const report = await addReport(req.body);
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add report' });
  }
}