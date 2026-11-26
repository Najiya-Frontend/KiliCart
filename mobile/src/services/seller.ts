import { ApiError, apiRequest, queryString } from './api';
import { getAccessToken, refreshSession } from './auth';
import type { Category } from '@/types/catalogue';
import type { SellerApplication, SellerPage, SellerProduct, SellerStore } from '@/types/seller';

async function sellerRequest<T>(path: string, options: RequestInit = {}) {
  let token = getAccessToken();
  if (!token && !await refreshSession()) throw new ApiError(401, 'Sign in to access seller tools.');
  token = getAccessToken();
  try { return await apiRequest<T>(path, options, token || undefined); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !await refreshSession()) throw error;
    return apiRequest<T>(path, options, getAccessToken() || undefined);
  }
}

export const listMyApplications = async () => (await sellerRequest<SellerApplication[]>('/seller-applications/me')).data;
export const submitApplication = async (body: {businessName:string;businessType:string;contactPhone:string;businessAddress:string;description:string|null}) =>
  (await sellerRequest<SellerApplication>('/seller-applications',{method:'POST',body:JSON.stringify(body)})).data;
export const getMyStore = async () => (await sellerRequest<SellerStore|null>('/seller/stores/me')).data;
export const createStore = async (body: StoreInput) => (await sellerRequest<SellerStore>('/seller/stores',{method:'POST',body:JSON.stringify(body)})).data;
export const updateStore = async (body: Partial<StoreInput>) => (await sellerRequest<SellerStore>('/seller/stores/me',{method:'PATCH',body:JSON.stringify(body)})).data;
export const submitStore = async () => (await sellerRequest<SellerStore>('/seller/stores/me/submit',{method:'POST'})).data;
export async function listMyProducts(page=1,pageSize=20):Promise<SellerPage<SellerProduct>> {
  const result=await sellerRequest<SellerProduct[]>(`/seller/products${queryString({page,pageSize})}`);
  return {items:result.data,pagination:result.pagination??{page,pageSize,hasMore:false}};
}
export const getMyProduct = async (id:number) => (await sellerRequest<SellerProduct>(`/seller/products/${id}`)).data;
export const createProduct = async (body: ProductInput) => (await sellerRequest<SellerProduct>('/seller/products',{method:'POST',body:JSON.stringify(body)})).data;
export const updateProduct = async (id:number,body:Partial<ProductInput>) => (await sellerRequest<SellerProduct>(`/seller/products/${id}`,{method:'PATCH',body:JSON.stringify(body)})).data;
export const submitProduct = async (id:number) => (await sellerRequest<SellerProduct>(`/seller/products/${id}/submit`,{method:'POST'})).data;
export const archiveProduct = async (id:number) => (await sellerRequest<SellerProduct>(`/seller/products/${id}/archive`,{method:'POST'})).data;
export const listSellerCategories = async () => (await sellerRequest<Category[]>('/categories')).data;

export type UploadedProductImage = { id:number; url:string; altText:string|null; position:number; isMain?:boolean; status?:'ACTIVE'|'DELETE_PENDING' };
export type MobileImageAsset = { uri:string; fileName?:string|null; mimeType?:string|null };
export async function uploadSellerProductImage(productId:number, asset:MobileImageAsset, onProgress:(value:number)=>void, imageId?:number) {
  const send = (token:string) => new Promise<any>((resolve,reject) => {
    const base=process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/,'');
    if(!base)return reject(new ApiError(0,'Set EXPO_PUBLIC_API_BASE_URL before starting the app.'));
    const xhr=new XMLHttpRequest();xhr.open(imageId?'PUT':'POST',`${base}/seller/products/${productId}/images${imageId?`/${imageId}`:''}`);xhr.timeout=60000;
    xhr.setRequestHeader('Accept','application/json');xhr.setRequestHeader('Authorization',`Bearer ${token}`);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100));};
    xhr.onerror=()=>reject(new ApiError(0,'Could not reach KiliCart. Check your connection and try again.'));
    xhr.ontimeout=()=>reject(new ApiError(0,'The image upload took too long. Please retry.'));
    xhr.onload=()=>{let body:any=null;try{body=JSON.parse(xhr.responseText);}catch{/* handled as API response error */}if(xhr.status>=200&&xhr.status<300&&body?.success)return resolve(body.data);reject(new ApiError(xhr.status,body?.message||'The image upload could not be completed.'));};
    const form=new FormData();form.append('image',{uri:asset.uri,name:asset.fileName||`product-${Date.now()}.jpg`,type:asset.mimeType||'image/jpeg'} as any);form.append('altText','Product image');xhr.send(form);
  });
  let token=getAccessToken();if(!token&&!await refreshSession())throw new ApiError(401,'Sign in to access seller tools.');token=getAccessToken();
  try{return await send(token||'');}catch(error){if(!(error instanceof ApiError)||error.status!==401||!await refreshSession())throw error;return send(getAccessToken()||'');}
}
export const reorderSellerProductImages=async(productId:number,imageIds:number[])=>
  (await sellerRequest<UploadedProductImage[]>(`/seller/products/${productId}/images/order`,{method:'PATCH',body:JSON.stringify({imageIds})})).data;
export const listSellerProductImages=async(productId:number)=>
  (await sellerRequest<UploadedProductImage[]>(`/seller/products/${productId}/images`)).data;
export const deleteSellerProductImage=async(productId:number,imageId:number)=>
  (await sellerRequest<UploadedProductImage[]>(`/seller/products/${productId}/images/${imageId}`,{method:'DELETE'})).data;

export type StoreInput={name:string;slug:string;description:string|null;contactPhone:string|null;location:string|null};
export type ProductInput={name:string;slug:string;description:string|null;categoryId:number;price:string;stockQuantity:number};
