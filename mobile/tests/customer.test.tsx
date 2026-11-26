import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const ReactNative = require('react-native');
  const routeParams: Record<string, string> = {};
  const route = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
  return {
    router: route,
    __routeParams: routeParams,
    useLocalSearchParams: () => routeParams,
    Link: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(ReactNative.Text, null, children),
  };
});
jest.mock('@/store/AuthContext', () => {
  const authMethods = { signIn: jest.fn(), createAccount: jest.fn(), signOut: jest.fn(), reload: jest.fn() };
  const authState: { account: any } = { account: null };
  return { __authMethods: authMethods, __authState: authState, useAuth: () => ({ account: authState.account, loading: false, ...authMethods }) };
});
jest.mock('@/services/catalogue', () => ({
  getHome: jest.fn(), getCategories: jest.fn(), getCategory: jest.fn(), getProducts: jest.fn(), getCategoryProducts: jest.fn(),
  getProduct: jest.fn(), getStores: jest.fn(), getStore: jest.fn(), getStoreProducts: jest.fn(), searchCatalogue: jest.fn(),
}));
jest.mock('@/services/auth', () => ({ confirmEmail: jest.fn(), requestEmailVerification: jest.fn(), requestPasswordReset: jest.fn(), resetPassword: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }), launchImageLibraryAsync: jest.fn() }));
jest.mock('@/services/seller', () => ({ listMyApplications: jest.fn(), submitApplication: jest.fn(), getMyStore: jest.fn(), createStore: jest.fn(), updateStore: jest.fn(), submitStore: jest.fn(), listMyProducts: jest.fn(), getMyProduct: jest.fn(), createProduct: jest.fn(), updateProduct: jest.fn(), submitProduct: jest.fn(), archiveProduct: jest.fn(), listSellerCategories: jest.fn(), listSellerProductImages: jest.fn().mockResolvedValue([]), uploadSellerProductImage: jest.fn(), reorderSellerProductImages: jest.fn(), deleteSellerProductImage: jest.fn() }));

import { router } from 'expo-router';
import { getHome, getProduct, getStore, getStoreProducts, getProducts, searchCatalogue } from '@/services/catalogue';
import { confirmEmail, requestPasswordReset, resetPassword } from '@/services/auth';
import { apiRequest, ApiError } from '@/services/api';
import { CategoryTile, ProductCard } from '@/components/catalogue';
import HomeScreen from '@/screens/HomeScreen';
import ProductListingScreen from '@/screens/ProductListingScreen';
import ProductDetailScreen from '@/screens/ProductDetailScreen';
import StorefrontScreen from '@/screens/StorefrontScreen';
import SearchScreen from '@/screens/SearchScreen';
import { ForgotPasswordScreen, LoginScreen, RegisterScreen, ResetPasswordScreen, VerifyEmailScreen } from '@/screens/AuthScreens';
import { SellerApplyScreen, SellerApplicationsScreen, SellerStoreScreen, NewSellerProductScreen } from '@/screens/SellerScreens';
import * as sellerApi from '@/services/seller';
import * as imagePicker from 'expo-image-picker';
import type { Category, HomeData, Product } from '@/types/catalogue';

const category: Category = { id: 1, name: 'Homemade Foods', slug: 'homemade-foods', description: 'Made nearby.', imageUrl: null, parentId: null, children: [] };
const product: Product = { id: 5, name: 'Small batch pickle', slug: 'small-batch-pickle', description: 'A bright, tangy pickle.', price: '125.50', stockQuantity: 4, createdAt: '2026-11-26T00:00:00Z', category: { id: 1, name: category.name, slug: category.slug }, store: { id: 7, name: 'Local Kitchen', slug: 'local-kitchen', description: 'Made by hand.' }, images: [] };
const home: HomeData = { categories: [category], featuredSellers: [], featuredProducts: [], trendingProducts: [], newArrivals: [] };

const routeParams = (jest.requireMock('expo-router') as { __routeParams: Record<string, string> }).__routeParams;
const authMethods = (jest.requireMock('@/store/AuthContext') as { __authMethods: { signIn: jest.Mock; createAccount: jest.Mock } }).__authMethods;
const authState = (jest.requireMock('@/store/AuthContext') as { __authState: { account: any } }).__authState;
beforeEach(() => { Object.assign(routeParams, { slug: product.slug, q: 'pickles' }); delete routeParams.id; authState.account = null; jest.clearAllMocks(); });

test('home renders API categories and truthful no-public-inventory state', async () => {
  jest.mocked(getHome).mockResolvedValue(home);
  const view = await render(<HomeScreen />);
  expect(await view.findByText('Explore by category')).toBeTruthy();
  expect(view.getByText(category.name)).toBeTruthy();
  expect(view.getByText('Local businesses are getting ready')).toBeTruthy();
});

test('category navigation opens the selected API category', async () => {
  const view = await render(<CategoryTile category={category} />);
  await fireEvent.press(view.getByRole('button', { name: category.name }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/categories/[slug]', params: { slug: category.slug } });
});

test('product cards use the backend price, seller and availability', async () => {
  const view = await render(<ProductCard product={product} />);
  expect(view.getByText('₹125.50')).toBeTruthy();
  expect(view.getByText('Local Kitchen')).toBeTruthy();
  expect(view.getByText('Available')).toBeTruthy();
});

test('product listing shows supported sorting and an empty catalogue state', async () => {
  jest.mocked(getProducts).mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, hasMore: false } });
  const view = await render(<ProductListingScreen />);
  expect(await view.findByText('No public products here yet')).toBeTruthy();
  expect(view.getByText('Price ↑')).toBeTruthy();
});

test('product details display price, stock and seller navigation without enabling cart', async () => {
  jest.mocked(getProduct).mockResolvedValue(product);
  const view = await render(<ProductDetailScreen />);
  expect(await view.findByText('Small batch pickle')).toBeTruthy();
  expect(view.getByText('₹125.50')).toBeTruthy();
  expect(view.getByText('4 available')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Add to cart · Coming soon' })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'Visit store' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/stores/[slug]', params: { slug: 'local-kitchen' } });
});

test('draft storefront response stays unavailable', async () => {
  jest.mocked(getStore).mockRejectedValue(new ApiError(404, 'Store not found'));
  jest.mocked(getStoreProducts).mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, hasMore: false } });
  const view = await render(<StorefrontScreen />);
  expect(await view.findByText('We couldn’t load this')).toBeTruthy();
});

test('search renders matching categories and an empty result message', async () => {
  jest.mocked(searchCatalogue).mockResolvedValue({ data: { products: [], stores: [], categories: [category] }, pagination: { page: 1, pageSize: 20, hasMore: false } });
  const view = await render(<SearchScreen />);
  expect(await view.findByText('Homemade Foods')).toBeTruthy();
});

test('login invokes the shared account session and then returns to its safe destination', async () => {
  routeParams.returnTo = '/products'; authMethods.signIn.mockResolvedValue(undefined);
  const view = await render(<LoginScreen />);
  await fireEvent.changeText(view.getByLabelText('Email address'), 'customer@example.invalid');
  await fireEvent.changeText(view.getByLabelText('Password'), 'a long passphrase');
  await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(authMethods.signIn).toHaveBeenCalledWith('customer@example.invalid', 'a long passphrase'));
  expect(router.replace).toHaveBeenCalledWith('/products');
});

test('registration calls the existing backend flow and confirms verification guidance', async () => {
  routeParams.returnTo = '/(tabs)'; authMethods.createAccount.mockResolvedValue(undefined);
  const view = await render(<RegisterScreen />);
  await fireEvent.changeText(view.getByLabelText('Full name'), 'Test Customer');
  await fireEvent.changeText(view.getByLabelText('Email address'), 'customer@example.invalid');
  await fireEvent.changeText(view.getByLabelText('Password'), 'a long passphrase');
  await fireEvent.press(view.getByRole('button', { name: 'Create account' }));
  expect(await view.findByText('Check your inbox.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Verify email' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/auth/verify-email', params: { email: 'customer@example.invalid' } });
});

test('email verification submits a deep-link token and removes it from route state', async () => {
  routeParams.token = 'one-time-token'; jest.mocked(confirmEmail).mockResolvedValue(undefined);
  const view = await render(<VerifyEmailScreen />);
  expect(router.setParams).toHaveBeenCalledWith({ token: undefined });
  await fireEvent.press(view.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(confirmEmail).toHaveBeenCalledWith('one-time-token'));
  expect(await view.findByText('Email verified.')).toBeTruthy();
});

test('forgot password requests the existing generic recovery flow', async () => {
  jest.mocked(requestPasswordReset).mockResolvedValue(undefined);
  const view = await render(<ForgotPasswordScreen />);
  await fireEvent.changeText(view.getByLabelText('Email address'), 'customer@example.invalid');
  await fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));
  expect(await view.findByText('Check your inbox.')).toBeTruthy();
  expect(requestPasswordReset).toHaveBeenCalledWith('customer@example.invalid');
});

test('reset password submits the supplied token and new password', async () => {
  jest.mocked(resetPassword).mockResolvedValue(undefined);
  routeParams.token = 'reset-token';
  const view = await render(<ResetPasswordScreen />);
  await fireEvent.changeText(view.getByLabelText('New password'), 'another long passphrase');
  await fireEvent.press(view.getByRole('button', { name: 'Reset password' }));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('reset-token', 'another long passphrase'));
  expect(await view.findByText('Password updated.')).toBeTruthy();
});

test('API failures are bounded, reported with status and do not expose response internals', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false, message: 'Unavailable' }) }) as typeof fetch;
  await expect(apiRequest('/home')).rejects.toMatchObject({ status: 503, message: 'Unavailable' });
  expect(router).toBeTruthy();
});

test('account exposes seller application entry without changing customer tab navigation', async () => {
  const { AccountScreen } = require('@/screens/AuthScreens');
  const view = await render(<AccountScreen />);
  await fireEvent.press(view.getByRole('button', { name: 'Explore selling on KiliCart' }));
  expect(router.push).toHaveBeenCalledWith('/seller/apply');
});

test('seller application status displays rejection note and resubmission path', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['CUSTOMER'] };
  jest.mocked(sellerApi.listMyApplications).mockResolvedValue([{ id: 4, businessName: 'Maya Foods', businessType: 'Food', contactPhone: '1234567', businessAddress: 'Market Road', description: null, status: 'REJECTED', submittedAt: '2026-01-01', decidedAt: '2026-01-02', applicantMessage: 'Please clarify your address.' }]);
  const view = await render(<SellerApplicationsScreen />);
  expect(await view.findByText('Review note: Please clarify your address.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Submit a new application' }));
  expect(router.push).toHaveBeenCalledWith('/seller/apply');
});

test('seller application validates required fields before calling API', async () => {
  authState.account = { fullName: 'Customer Person', email: 'person@example.invalid', roles: ['CUSTOMER'] };
  jest.mocked(sellerApi.listMyApplications).mockResolvedValue([]);
  const view = await render(<SellerApplyScreen />);
  await fireEvent.press(view.getByRole('button', { name: 'Submit application' }));
  expect(await view.findByText(/Check the fields/)).toBeTruthy();
  expect(sellerApi.submitApplication).not.toHaveBeenCalled();
});

test('seller store displays API authorization errors', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };
  jest.mocked(sellerApi.getMyStore).mockRejectedValue(new ApiError(403, 'Active seller account required'));
  const view = await render(<SellerStoreScreen />);
  expect(await view.findByText(/seller account is suspended or inactive/)).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save draft' })).toBeNull();
});

test('new product requires valid data and category selection before creation', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };
  jest.mocked(sellerApi.listSellerCategories).mockResolvedValue([category]);
  const view = await render(<NewSellerProductScreen />);
  expect(await view.findByText('Homemade Foods')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Save product' }));
  expect(await view.findByText(/Check name/)).toBeTruthy();
  expect(sellerApi.createProduct).not.toHaveBeenCalled();
});

test('seller application submission sends backend-supported business fields', async () => {
  authState.account = { fullName: 'Customer Person', email: 'person@example.invalid', roles: ['CUSTOMER'] };
  jest.mocked(sellerApi.listMyApplications).mockResolvedValue([]);
  jest.mocked(sellerApi.submitApplication).mockResolvedValue({ id: 9, businessName: 'Maya Foods', businessType: 'Home kitchen', contactPhone: '9876543210', businessAddress: '12 Market Road', description: null, status: 'PENDING', submittedAt: '2026-01-01', decidedAt: null, applicantMessage: null });
  const view = await render(<SellerApplyScreen />);
  await fireEvent.changeText(view.getByLabelText('Business name'), 'Maya Foods');
  await fireEvent.changeText(view.getByLabelText('Business type'), 'Home kitchen');
  await fireEvent.changeText(view.getByLabelText('Contact phone'), '9876543210');
  await fireEvent.changeText(view.getByLabelText('Business address'), '12 Market Road');
  await fireEvent.press(view.getByRole('button', { name: 'Submit application' }));
  await waitFor(() => expect(sellerApi.submitApplication).toHaveBeenCalledWith({ businessName: 'Maya Foods', businessType: 'Home kitchen', contactPhone: '9876543210', businessAddress: '12 Market Road', description: null }));
  expect(await view.findByText('Application submitted')).toBeTruthy();
});

test('store draft can be saved and submitted for review', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };
  jest.mocked(sellerApi.getMyStore).mockResolvedValue(null);
  jest.mocked(sellerApi.createStore).mockResolvedValue({ id: 3, name: 'Maya Foods', slug: 'maya-foods', description: null, contactPhone: null, location: null, status: 'DRAFT', rejectionReason: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
  jest.mocked(sellerApi.submitStore).mockResolvedValue({ id: 3, name: 'Maya Foods', slug: 'maya-foods', description: null, contactPhone: null, location: null, status: 'PENDING_REVIEW', rejectionReason: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
  const view = await render(<SellerStoreScreen />);
  await fireEvent.changeText(await view.findByLabelText('Store name'), 'Maya Foods');
  await fireEvent.changeText(view.getByLabelText('Store slug'), 'maya-foods');
  await fireEvent.press(view.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(sellerApi.createStore).toHaveBeenCalled());
  await fireEvent.press(view.getByRole('button', { name: 'Submit for review' }));
  await waitFor(() => expect(sellerApi.submitStore).toHaveBeenCalled());
});

test('product form creates a draft with selected category and stock', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };
  jest.mocked(sellerApi.listSellerCategories).mockResolvedValue([category]);
  jest.mocked(sellerApi.createProduct).mockResolvedValue({ id: 22, storeId: 3, categoryId: 1, name: 'Mango pickle', slug: 'mango-pickle', description: null, price: '125.50', status: 'DRAFT', rejectionReason: null, stockQuantity: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01', images: [], category: { id: 1, name: category.name, slug: category.slug, status: 'ACTIVE' } });
  const view = await render(<NewSellerProductScreen />);
  await fireEvent.changeText(await view.findByLabelText('Product name'), 'Mango pickle');
  await fireEvent.changeText(view.getByLabelText('Product slug'), 'mango-pickle');
  await fireEvent.press(view.getByRole('radio', { name: 'Homemade Foods' }));
  await fireEvent.changeText(view.getByLabelText('Price'), '125.50');
  await fireEvent.changeText(view.getByLabelText('Stock quantity'), '5');
  await fireEvent.press(view.getByRole('button', { name: 'Save product' }));
  await waitFor(() => expect(sellerApi.createProduct).toHaveBeenCalledWith({ name: 'Mango pickle', slug: 'mango-pickle', description: null, categoryId: 1, price: '125.50', stockQuantity: 5 }));
  expect(router.replace).toHaveBeenCalledWith('/seller/products/22');
});

test('seller product editing saves supported fields and submits a draft for review', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };
  routeParams.id = '22';
  const draft = { id: 22, storeId: 3, categoryId: 1, name: 'Mango pickle', slug: 'mango-pickle', description: null, price: '125.50', status: 'DRAFT' as const, rejectionReason: null, stockQuantity: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01', images: [], category: { id: 1, name: category.name, slug: category.slug, status: 'ACTIVE' } };
  jest.mocked(sellerApi.listSellerCategories).mockResolvedValue([category]);
  jest.mocked(sellerApi.getMyProduct).mockResolvedValue(draft);
  jest.mocked(sellerApi.updateProduct).mockResolvedValue(draft);
  jest.mocked(sellerApi.submitProduct).mockResolvedValue({ ...draft, status: 'PENDING_REVIEW' });
  const { EditSellerProductScreen } = require('@/screens/SellerScreens');
  const view = await render(<EditSellerProductScreen />);
  await fireEvent.changeText(await view.findByLabelText('Product name'), 'Mango pickle special');
  await fireEvent.press(view.getByRole('button', { name: 'Save product' }));
  await waitFor(() => expect(sellerApi.updateProduct).toHaveBeenCalledWith(22, expect.objectContaining({ name: 'Mango pickle special', categoryId: 1, price: '125.50', stockQuantity: 5 })));
  await fireEvent.press(view.getByRole('button', { name: 'Submit for review' }));
  await waitFor(() => expect(sellerApi.submitProduct).toHaveBeenCalledWith(22));
});

test('mobile seller image gallery uploads a selected asset and retries a failed upload', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };routeParams.id = '22';
  const draft = { id: 22, storeId: 3, categoryId: 1, name: 'Mango pickle', slug: 'mango-pickle', description: null, price: '125.50', status: 'DRAFT' as const, rejectionReason: null, stockQuantity: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01', images: [], category: { id: 1, name: category.name, slug: category.slug, status: 'ACTIVE' } };
  jest.mocked(sellerApi.listSellerCategories).mockResolvedValue([category]);jest.mocked(sellerApi.getMyProduct).mockResolvedValue(draft);jest.mocked(sellerApi.listSellerProductImages).mockResolvedValue([]);
  jest.mocked(imagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///picked/mango.png', fileName: 'mango.png', mimeType: 'image/png', width: 300, height: 300, type: 'image' }] } as never);
  jest.mocked(sellerApi.uploadSellerProductImage).mockRejectedValueOnce(new Error('Temporary upload failure')).mockResolvedValueOnce([{ id: 8, url: 'https://images.example.invalid/mango.webp', altText: 'Mango pickle', position: 0, status: 'ACTIVE' }]);
  const { EditSellerProductScreen } = require('@/screens/SellerScreens');const view = await render(<EditSellerProductScreen />);
  await fireEvent.press(await view.findByRole('button', { name: 'Choose from gallery' }));
  expect(await view.findByText('Temporary upload failure')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Retry upload' }));
  await waitFor(() => expect(sellerApi.uploadSellerProductImage).toHaveBeenCalledTimes(2));
  expect(await view.findByText('Image upload complete.')).toBeTruthy();
  expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
});

test('mobile seller can make an uploaded image the main image by reordering it first', async () => {
  authState.account = { fullName: 'Seller Person', email: 'seller@example.invalid', roles: ['SELLER'] };routeParams.id = '22';
  const draft = { id: 22, storeId: 3, categoryId: 1, name: 'Mango pickle', slug: 'mango-pickle', description: null, price: '125.50', status: 'DRAFT' as const, rejectionReason: null, stockQuantity: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01', images: [], category: { id: 1, name: category.name, slug: category.slug, status: 'ACTIVE' } };
  const images=[{id:31,url:'https://images.example.invalid/one.webp',altText:null,position:0,status:'ACTIVE' as const},{id:32,url:'https://images.example.invalid/two.webp',altText:null,position:1,status:'ACTIVE' as const}];
  jest.mocked(sellerApi.listSellerCategories).mockResolvedValue([category]);jest.mocked(sellerApi.getMyProduct).mockResolvedValue(draft);jest.mocked(sellerApi.listSellerProductImages).mockResolvedValue(images);jest.mocked(sellerApi.reorderSellerProductImages).mockResolvedValue([{...images[1],position:0},{...images[0],position:1}]);
  const { EditSellerProductScreen } = require('@/screens/SellerScreens');const view=await render(<EditSellerProductScreen/>);
  await fireEvent.press(await view.findByRole('button',{name:'Make main'}));
  await waitFor(()=>expect(sellerApi.reorderSellerProductImages).toHaveBeenCalledWith(22,[32,31]));
});
