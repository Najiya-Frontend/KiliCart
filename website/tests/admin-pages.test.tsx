import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:3000/admin'});
Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {render,screen,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const {AppRouterContext}=await import('next/dist/shared/lib/app-router-context.shared-runtime');
const {PathnameContext,SearchParamsContext}=await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
const {AuthProvider}=await import('../src/components/marketplace/AuthProvider');
const {default:AdminConsole}=await import('../src/features/admin/AdminConsole');
const originalFetch=globalThis.fetch;
function response(data:unknown,status=200){return new Response(JSON.stringify({success:status<400,message:status<400?'OK':'Denied',...(status<400?{data}:{})}),{status,headers:{'content-type':'application/json'}});}
function mount(path:string){const router={back(){},forward(){},refresh(){},push(){},replace(){},prefetch:async()=>{}};return render(<AppRouterContext.Provider value={router as never}><PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams() as never}><AuthProvider><AdminConsole/></AuthProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>);}
function auth(url:string,roles=['ADMIN']){if(url.endsWith('/auth/refresh'))return response({accessToken:'admin-token'});if(url.endsWith('/auth/me'))return response({id:1,email:'admin@example.invalid',fullName:'Admin Person',roles});return null;}

test('admin route blocks signed-in non-admin accounts before requesting review data',async()=>{
  const protectedCalls:string[]=[];
  globalThis.fetch=async input=>{const url=String(input);const base=auth(url,['CUSTOMER']);if(base)return base;protectedCalls.push(url);return response([]);};
  try{const{unmount}=mount('/admin');assert.ok(await screen.findByRole('heading',{name:'Administrator access required'}));assert.deepEqual(protectedCalls,[]);unmount();}finally{cleanup();globalThis.fetch=originalFetch;}
});

test('admin workspace handles expired unauthenticated sessions with a sign-in prompt',async()=>{
  globalThis.fetch=async input=>{const url=String(input);if(url.endsWith('/auth/refresh'))return response(null,401);if(url.endsWith('/auth/me'))return response(null,401);throw new Error(`Unexpected protected request ${url}`);};
  try{const{unmount}=mount('/admin/products');assert.ok(await screen.findByRole('heading',{name:'Administrator sign in required'}));assert.ok(screen.getByRole('link',{name:'Sign in'}));unmount();}finally{cleanup();globalThis.fetch=originalFetch;}
});

test('admin API 403 responses remain visible as authorization errors',async()=>{
  globalThis.fetch=async input=>{const url=String(input);const base=auth(url);if(base)return base;return response(null,403);};
  try{const{unmount}=mount('/admin');assert.ok(await screen.findByRole('alert'));assert.equal(screen.getByRole('alert').textContent,'Denied');unmount();}finally{cleanup();globalThis.fetch=originalFetch;}
});

test('application rejection requires applicant message and internal reason and posts the admin contract',async()=>{
  let body:Record<string,string>|null=null; const originalConfirm=window.confirm; window.confirm=()=>true;
  const application={id:31,businessName:'Mina Foods',businessType:'Packaged foods',contactPhone:'+919876543210',businessAddress:'12 Market Road',description:null,status:'PENDING',submittedAt:'2026-11-25T10:00:00.000Z',applicant:{id:8,fullName:'Mina Maker',email:'mina@example.invalid'},decidedBy:null};
  globalThis.fetch=async(input,init)=>{const url=String(input);const base=auth(url);if(base)return base;if(url.endsWith('/admin/seller-applications/31'))return response(application);if(url.endsWith('/admin/seller-applications/31/decision')){body=JSON.parse(String(init?.body));return response({...application,status:'REJECTED',decidedBy:{id:1,fullName:'Admin Person'}});}throw new Error(`Unexpected ${url}`);};
  try{
    const{unmount}=mount('/admin/seller-applications/31');await screen.findByRole('heading',{name:'Mina Foods'});
    fireEvent.change(screen.getByLabelText('Decision'),{target:{value:'REJECT'}});
    const submit=screen.getByRole('button',{name:'Save decision'});assert.equal((submit as HTMLButtonElement).disabled,true);
    fireEvent.change(screen.getByLabelText('Message to applicant'),{target:{value:'Please update the business address.'}});
    fireEvent.change(screen.getByLabelText('Internal rejection reason'),{target:{value:'Address verification did not pass.'}});
    fireEvent.click(submit);
    await waitFor(()=>assert.ok(body));
    assert.deepEqual(body,{decision:'REJECT',applicantMessage:'Please update the business address.',internalRejectionReason:'Address verification did not pass.'});
    unmount();
  }finally{window.confirm=originalConfirm;cleanup();globalThis.fetch=originalFetch;}
});

test('audit filter uses one supported entity filter and renders administrator history',async()=>{
  const requests:string[]=[];
  globalThis.fetch=async input=>{const url=String(input);const base=auth(url);if(base)return base;if(url.includes('/admin/catalogue-audits')){requests.push(url);return response([{id:4,actor:{id:1,fullName:'Admin Person',email:'admin@example.invalid'},target:{id:8,fullName:'Mina Maker',email:'mina@example.invalid'},sellerAccountId:5,storeId:6,productId:null,action:'STORE_REJECTED',fromStatus:'PENDING_REVIEW',toStatus:'REJECTED',reason:'Missing contact details.',createdAt:'2026-11-25T12:00:00.000Z'}]);}throw new Error(`Unexpected ${url}`);};
  try{const{unmount}=mount('/admin/catalogue-audit');await screen.findByText('Missing contact details.');fireEvent.change(screen.getByLabelText('Audit entity type'),{target:{value:'storeId'}});fireEvent.change(screen.getByLabelText('Audit entity ID'),{target:{value:'6'}});fireEvent.click(screen.getByRole('button',{name:'Apply filter'}));await waitFor(()=>assert.ok(requests.some(x=>x.includes('storeId=6'))));assert.ok(screen.getAllByText('Admin Person').length>=2);unmount();}finally{cleanup();globalThis.fetch=originalFetch;}
});

test('store review blocks approval for a suspended seller but allows a reasoned rejection',async()=>{
  let submitted:Record<string,string>|null=null;const originalConfirm=window.confirm;window.confirm=()=>true;
  const store={id:6,name:'Mina Foods',slug:'mina-foods',description:'Local pantry goods',contactPhone:'+919876543210',location:'Pune',status:'PENDING_REVIEW',rejectionReason:null,createdAt:'2026-11-25T10:00:00.000Z',sellerAccount:{id:5,status:'SUSPENDED',user:{id:8,fullName:'Mina Maker',email:'mina@example.invalid'}}};
  globalThis.fetch=async(input,init)=>{const url=String(input);const base=auth(url);if(base)return base;if(url.endsWith('/admin/stores/6'))return response(store);if(url.includes('/admin/catalogue-audits'))return response([]);if(url.endsWith('/admin/stores/6/decision')){submitted=JSON.parse(String(init?.body));return response({...store,status:'REJECTED'});}throw new Error(`Unexpected ${url}`);};
  try{const{unmount}=mount('/admin/stores/6');await screen.findByRole('heading',{name:'Mina Foods'});fireEvent.change(screen.getByLabelText('Decision reason'),{target:{value:'Seller account requires review.'}});assert.equal((screen.getByRole('button',{name:'Confirm approval'}) as HTMLButtonElement).disabled,true);fireEvent.change(screen.getByLabelText('store decision'),{target:{value:'REJECT'}});const button=screen.getByRole('button',{name:'Confirm rejection'});assert.equal((button as HTMLButtonElement).disabled,false);fireEvent.click(button);await waitFor(()=>assert.ok(submitted));assert.deepEqual(submitted,{decision:'REJECT',reason:'Seller account requires review.'});unmount();}finally{window.confirm=originalConfirm;cleanup();globalThis.fetch=originalFetch;}
});

test('product moderation posts a reasoned approval and displays current catalogue data',async()=>{
  let submitted:Record<string,string>|null=null;const originalConfirm=window.confirm;window.confirm=()=>true;
  const product={id:12,storeId:6,categoryId:3,name:'Chutney',slug:'chutney',description:'Small batch tomato chutney',price:'149.00',stockQuantity:4,status:'PENDING_REVIEW',rejectionReason:null,createdAt:'2026-11-25T10:00:00.000Z',category:{id:3,name:'Pantry',status:'ACTIVE'},store:{id:6,name:'Mina Foods',slug:'mina-foods',status:'ACTIVE',sellerAccount:{id:5,status:'ACTIVE',user:{id:8,fullName:'Mina Maker',email:'mina@example.invalid'}}},images:[]};
  globalThis.fetch=async(input,init)=>{const url=String(input);const base=auth(url);if(base)return base;if(url.endsWith('/admin/products/12'))return response(product);if(url.includes('/admin/catalogue-audits'))return response([]);if(url.endsWith('/admin/products/12/decision')){submitted=JSON.parse(String(init?.body));return response({...product,status:'PUBLISHED'});}throw new Error(`Unexpected ${url}`);};
  try{const{unmount}=mount('/admin/products/12');await screen.findByRole('heading',{name:'Chutney'});assert.ok(screen.getByText('Small batch tomato chutney'));fireEvent.change(screen.getByLabelText('Decision reason'),{target:{value:'Product details verified.'}});fireEvent.click(screen.getByRole('button',{name:'Confirm approval'}));await waitFor(()=>assert.ok(submitted));assert.deepEqual(submitted,{decision:'APPROVE',reason:'Product details verified.'});unmount();}finally{window.confirm=originalConfirm;cleanup();globalThis.fetch=originalFetch;}
});
