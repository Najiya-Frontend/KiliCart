import { Router } from 'express';
import { catalogueService, parseProductFilters, parseSearchQuery } from '../services/catalogue.service.js';

const router = Router();
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const pageArgs = query => {
  if (Object.keys(query).some(key => !['page', 'pageSize'].includes(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? { page, pageSize } : null;
};
const page = (res, args, result) => res.json({ success: true, message: 'Catalogue results', data: result.items, pagination: { ...args, hasMore: result.hasMore } });
const validSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 191;

router.get('/home', async (_req, res) => res.json({ success: true, message: 'Home discovery', data: await catalogueService.getHome() }));
router.get('/categories', async (_req, res) => res.json({ success: true, message: 'Categories', data: await catalogueService.listCategories() }));
router.get('/categories/:slug', async (req, res) => {
  if (!validSlug(req.params.slug)) return bad(res);
  const data = await catalogueService.getCategory(req.params.slug);
  if (!data) return res.status(404).json({ success: false, message: 'Category not found' });
  return res.json({ success: true, message: 'Category', data });
});
router.get('/categories/:slug/products', async (req, res) => {
  if (!validSlug(req.params.slug)) return bad(res);
  const filters = parseProductFilters(req.query);
  if (!filters) return bad(res);
  if (!await catalogueService.getCategory(req.params.slug)) return res.status(404).json({ success: false, message: 'Category not found' });
  const result = await catalogueService.listCategoryProducts(req.params.slug, filters);
  return page(res, filters, result);
});
router.get('/products', async (req, res) => {
  const filters = parseProductFilters(req.query);
  if (!filters) return bad(res);
  const result = await catalogueService.listProducts(filters);
  return page(res, filters, result);
});
router.get('/products/:slug', async (req, res) => {
  if (!validSlug(req.params.slug)) return bad(res);
  const data = await catalogueService.getProduct(req.params.slug);
  if (!data) return res.status(404).json({ success: false, message: 'Product not found' });
  return res.json({ success: true, message: 'Product', data });
});
router.get('/stores', async (req, res) => {
  const args = pageArgs(req.query);
  if (!args) return bad(res);
  return page(res, args, await catalogueService.listStores(args));
});
router.get('/stores/:slug', async (req, res) => {
  if (!validSlug(req.params.slug)) return bad(res);
  const data = await catalogueService.getStore(req.params.slug);
  if (!data) return res.status(404).json({ success: false, message: 'Store not found' });
  return res.json({ success: true, message: 'Store', data });
});
router.get('/stores/:slug/products', async (req, res) => {
  if (!validSlug(req.params.slug)) return bad(res);
  const filters = parseProductFilters(req.query);
  if (!filters) return bad(res);
  if (!await catalogueService.getStore(req.params.slug)) return res.status(404).json({ success: false, message: 'Store not found' });
  const result = await catalogueService.listStoreProducts(req.params.slug, filters);
  return page(res, filters, result);
});
router.get('/search', async (req, res) => {
  const args = parseSearchQuery(req.query);
  if (!args) return bad(res);
  const data = await catalogueService.search(args.query, args);
  const hasMore = Object.values(data).some(rows => rows.length > args.pageSize);
  for (const key of Object.keys(data)) data[key] = data[key].slice(0, args.pageSize);
  return res.json({ success: true, message: 'Search results', data, pagination: { page: args.page, pageSize: args.pageSize, hasMore } });
});

export default router;
