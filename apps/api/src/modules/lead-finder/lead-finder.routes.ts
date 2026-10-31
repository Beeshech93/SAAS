import { Router } from 'express';
import { z } from 'zod';
import { LeadStatus } from '@prisma/client';
import { parseId } from '../../lib/crud';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import * as leadService from './lead-finder.service';

export const leadFinderRouter = Router();

// Protect all routes with authentication and Super Admin authorization
leadFinderRouter.use(authenticate, requireSuperAdmin);

// 1. Get Google Places API configuration status
leadFinderRouter.get('/config', async (_req, res, next) => {
  try {
    const config = await leadService.getLeadFinderConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

// 2. Save Google Places API key
const saveConfigSchema = z.object({
  apiKey: z.string(),
});

leadFinderRouter.put('/config', validateBody(saveConfigSchema), async (req, res, next) => {
  try {
    await leadService.saveGooglePlacesApiKey(req.body.apiKey, req.auth!.userId);
    const config = await leadService.getLeadFinderConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

// 3. Search businesses & extract emails
const searchSchema = z.object({
  query: z.string().min(1, 'El rubro o término de búsqueda es requerido'),
  location: z.string().min(1, 'La ciudad o ubicación es requerida'),
  provider: z.enum(['auto', 'google_places', 'osm']).optional().default('auto'),
  maxResults: z.coerce.number().int().min(5).max(50).optional().default(20),
  extractEmails: z.boolean().optional().default(true),
});

leadFinderRouter.post('/search', validateBody(searchSchema), async (req, res, next) => {
  try {
    const data = await leadService.searchLeads(req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 4. Crawl a single URL on-demand
const crawlSingleSchema = z.object({
  url: z.string().url('URL de sitio web inválida'),
});

leadFinderRouter.post('/crawl-single', validateBody(crawlSingleSchema), async (req, res, next) => {
  try {
    const data = await leadService.crawlSingleUrl(req.body.url);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 5. List saved leads
const listSavedQuerySchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

leadFinderRouter.get('/', validateQuery(listSavedQuerySchema), async (req, res, next) => {
  try {
    const data = await leadService.listSavedLeads(req.query as any);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// 6. Save discovered leads to database
const saveLeadsSchema = z.object({
  leads: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      otherEmails: z.array(z.string()).optional(),
      phone: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      source: z.string().optional(),
      rating: z.number().nullable().optional(),
      reviewsCount: z.number().nullable().optional(),
      socialLinks: z.record(z.any()).nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  ),
});

leadFinderRouter.post('/save', validateBody(saveLeadsSchema), async (req, res, next) => {
  try {
    const result = await leadService.saveDiscoveredLeads(req.body.leads, req.auth!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 7. Update status of a saved lead
const updateStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
});

leadFinderRouter.patch('/:id/status', validateBody(updateStatusSchema), async (req, res, next) => {
  try {
    const updated = await leadService.updateLeadStatus(parseId(req.params.id), req.body.status, req.auth!.userId);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// 8. Delete a saved lead
leadFinderRouter.delete('/:id', async (req, res, next) => {
  try {
    await leadService.deleteSavedLead(parseId(req.params.id), req.auth!.userId);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

// 9. Export leads to CSV
const exportSchema = z.object({
  leads: z.array(z.record(z.any())).optional(),
});

leadFinderRouter.post('/export', validateBody(exportSchema), async (req, res, next) => {
  try {
    let leadsToExport = req.body.leads;
    if (!leadsToExport || leadsToExport.length === 0) {
      // Export all saved leads
      const all = await leadService.listSavedLeads({ limit: 1000 });
      leadsToExport = all.leads;
    }

    const csvContent = leadService.generateLeadsCsv(leadsToExport);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="prospectos_leads.csv"');
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

