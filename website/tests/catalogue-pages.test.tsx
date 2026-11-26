import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
dom.window.requestIdleCallback = callback => dom.window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1);
dom.window.cancelIdleCallback = id => dom.window.clearTimeout(id);
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { render, screen, cleanup } = await import('@testing-library/react');
const originalFetch = globalThis.fetch;
const category = { id: 1, name: 'Homemade Foods', slug: 'homemade-foods', description: 'Made close to home.', imageUrl: null, parentId: null, children: [] };
const home = { categories: [category], featuredSellers: [], featuredProducts: [], trendingProducts: [], newArrivals: [] };
function api(data: unknown, status = 200, pagination?: unknown) {
  return new Response(JSON.stringify({ success: status < 400, message: status < 400 ? 'OK' : 'Not found', ...(status < 400 ? { data, ...(pagination ? { pagination } : {}) } : {}) }), { status, headers: { 'content-type': 'application/json' } });
}
function mockFetch(handler: (url: string) => Response) { globalThis.fetch = async input => handler(String(input)); }

test('home renders real categories and the public-catalogue empty state', async () => {
  mockFetch(() => api(home));
  try {
    const { default: Page } = await import('../src/app/page');
    render(await Page());
    assert.ok(screen.getByText('Good finds.'));
    assert.ok(screen.getByText('Homemade Foods'));
    assert.ok(screen.getByText('Local businesses are getting ready'));
    assert.equal(screen.queryByText('Trending right now'), null);
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('category listing and detail render API categories and an empty product collection', async () => {
  mockFetch(url => url.endsWith('/categories') ? api([category]) : url.endsWith('/categories/homemade-foods') ? api(category) : api([], 200, { page: 1, pageSize: 20, hasMore: false }));
  try {
    const { default: Listing } = await import('../src/app/categories/page');
    render(await Listing()); assert.ok(screen.getByRole('heading', { name: 'Browse categories' })); assert.ok(screen.getByText('Homemade Foods')); cleanup();
    const { default: Detail } = await import('../src/app/categories/[slug]/page');
    render(await Detail({ params: Promise.resolve({ slug: category.slug }), searchParams: Promise.resolve({}) }));
    assert.ok(screen.getByRole('heading', { name: 'Homemade Foods' })); assert.ok(screen.getByText('No public products in this category'));
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('product listing remains empty without public inventory and exposes supported filters', async () => {
  mockFetch(url => url.endsWith('/categories') ? api([category]) : api([], 200, { page: 1, pageSize: 20, hasMore: false }));
  try {
    const { default: Page } = await import('../src/app/products/page');
    render(await Page({ searchParams: Promise.resolve({}) }));
    assert.ok(screen.getByRole('heading', { name: 'Explore products' }));
    assert.ok(screen.getByText('The catalogue is getting ready'));
    assert.ok(screen.getByLabelText('Sort by'));
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('product details render API price, stock and seller without inventing reviews or discounts', async () => {
  const product = { id: 2, name: 'Small batch pickle', slug: 'small-batch-pickle', description: 'A real API description.', price: '125.50', stockQuantity: 3, createdAt: '2026-11-25T00:00:00.000Z', category: { id: 1, name: category.name, slug: category.slug }, store: { id: 3, name: 'Local Kitchen', slug: 'local-kitchen', description: null }, images: [] };
  mockFetch(() => api(product));
  try {
    const { default: Page } = await import('../src/app/products/[slug]/page');
    render(await Page({ params: Promise.resolve({ slug: product.slug }) }));
    assert.ok(screen.getByRole('heading', { name: 'Small batch pickle' }));
    assert.ok(screen.getByText('₹125.50'));
    assert.ok(screen.getByText('3 available'));
    assert.ok(screen.getByRole('button', { name: /Add to cart/ }).hasAttribute('disabled'));
    assert.equal(screen.queryByText(/reviews/i), null);
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('store directory and private store response remain unavailable', async () => {
  mockFetch(url => url.includes('/stores?') ? api([], 200, { page: 1, pageSize: 20, hasMore: false }) : api(null, 404));
  try {
    const { default: Directory } = await import('../src/app/stores/page');
    render(await Directory()); assert.ok(screen.getByText('No public stores just yet')); cleanup();
    const { getStore, CatalogueApiError } = await import('../src/lib/catalogue-api');
    await assert.rejects(getStore('draft-store'), error => error instanceof CatalogueApiError && error.status === 404);
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('search renders matching categories and truthful no-results feedback', async () => {
  mockFetch(() => api({ products: [], stores: [], categories: [category] }, 200, { page: 1, pageSize: 20, hasMore: false }));
  try {
    const { default: Page } = await import('../src/app/search/page');
    render(await Page({ searchParams: Promise.resolve({ q: 'pickles' }) }));
    assert.ok(screen.getByRole('heading', { name: /Results for/ })); assert.ok(screen.getByText('Homemade Foods'));
    cleanup(); mockFetch(() => api({ products: [], stores: [], categories: [] }, 200, { page: 1, pageSize: 20, hasMore: false }));
    render(await Page({ searchParams: Promise.resolve({ q: 'unknown' }) })); assert.ok(screen.getByText('No results yet'));
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});

test('loading, API error and not-found states have accessible labels', async () => {
  const { LoadingSkeleton, ErrorState, NotFoundState } = await import('../src/components/marketplace/States');
  render(<><LoadingSkeleton /><ErrorState /><NotFoundState title="This page isn’t available" description="Not public." /></>);
  assert.ok(screen.getByLabelText('Loading catalogue'));
  assert.ok(screen.getByRole('alert'));
  assert.ok(screen.getByText('This page isn’t available'));
});

test('catalogue API failures render retry feedback and missing products use the not-found route', async () => {
  cleanup();
  mockFetch(url => url.endsWith('/products/unavailable-item') ? api(null, 404) : api(null, 503));
  try {
    const { default: Listing } = await import('../src/app/categories/page');
    render(await Listing());
    assert.ok(screen.getByRole('alert'));
    assert.ok(screen.getByRole('button', { name: 'Try again' }));
    cleanup();
    const { default: ProductPage } = await import('../src/app/products/[slug]/page');
    await assert.rejects(ProductPage({ params: Promise.resolve({ slug: 'unavailable-item' }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  } finally { cleanup(); globalThis.fetch = originalFetch; }
});
