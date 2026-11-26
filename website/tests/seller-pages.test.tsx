import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url:'http://localhost:3000/seller/apply' });
Object.assign(globalThis,{window:dom.window,self:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const { render,screen,fireEvent,cleanup,waitFor } = await import('@testing-library/react');
const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
const { PathnameContext,SearchParamsContext } = await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
const { AuthProvider } = await import('../src/components/marketplace/AuthProvider');
const { default: SellerPortal } = await import('../src/features/seller/SellerPortal');
const { default: ProductImageManager } = await import('../src/features/seller/ProductImageManager');
const originalFetch=globalThis.fetch;

function response(data:unknown,status=200) { return new Response(JSON.stringify({success:status<400,message:status<400?'OK':'Failed',...(status<400?{data}:{})}),{status,headers:{'content-type':'application/json'}}); }
function mount(path:string,push:(path:string)=>void) {
  const router={back(){},forward(){},refresh(){},push,replace(){},prefetch:async()=>{}};
  return render(<AppRouterContext.Provider value={router as never}><PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams() as never}><AuthProvider><SellerPortal/></AuthProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>);
}
function commonFetch(url:string,roles=['CUSTOMER']) {
  if(url.endsWith('/auth/refresh')) return response({accessToken:'memory-token'});
  if(url.endsWith('/auth/me')) return response({id:7,email:'maker@example.invalid',fullName:'Mina Maker',roles});
  return null;
}

test('seller application form submits the documented fields for an authenticated customer',async()=>{
  const navigations:string[]=[];
  const submitted:Record<string,unknown>[]=[];
  globalThis.fetch=async (input,init)=>{
    const url=String(input); const common=commonFetch(url); if(common) return common;
    if(url.endsWith('/seller-applications/me')) return response([]);
    if(url.endsWith('/seller-applications')) { submitted.push(JSON.parse(String(init?.body||'{}'))); return new Response(JSON.stringify({success:true,message:'Created',data:{id:21}}),{status:201}); }
    throw new Error(`Unexpected request ${url}`);
  };
  const original=globalThis.fetch;
  try {
    const { unmount }=mount('/seller/apply',path=>navigations.push(path));
    await screen.findByLabelText('Business name');
    fireEvent.change(screen.getByLabelText('Business name'),{target:{value:'Mina Foods'}});
    fireEvent.change(screen.getByLabelText('Business type'),{target:{value:'Packaged foods'}});
    fireEvent.change(screen.getByLabelText('Contact phone'),{target:{value:'+919876543210'}});
    fireEvent.change(screen.getByLabelText('Business address'),{target:{value:'12 Market Road, Pune'}});
    const form=screen.getByRole('button',{name:'Submit application'}).closest('form');
    assert.ok(form); fireEvent.submit(form);
    await screen.findByText('Changes saved successfully.');
    assert.deepEqual(navigations,['/seller/application']);
    assert.equal(submitted[0].businessName,'Mina Foods');
    assert.equal(submitted[0].businessAddress,'12 Market Road, Pune');
    unmount();
  } finally { cleanup(); globalThis.fetch=originalFetch; }
});

test('seller can save a store profile and submit its saved draft for review',async()=>{
  const calls:string[]=[]; let store:Record<string,unknown>|null=null;
  globalThis.fetch=async(input,init)=>{
    const url=String(input); const common=commonFetch(url,['CUSTOMER','SELLER']); if(common) return common;
    if(url.endsWith('/seller/stores/me')) return response(store);
    if(url.includes('/seller/products?')) return response([]);
    if(url.endsWith('/categories')) return response([]);
    if(url.endsWith('/seller/stores') && init?.method==='POST') { calls.push('save'); store={id:3,name:'Mina Foods',slug:'mina-foods',description:null,contactPhone:null,location:null,status:'DRAFT',rejectionReason:null}; return response(store,201); }
    if(url.endsWith('/seller/stores/me') && init?.method==='PATCH') { calls.push('save'); store={...store,...JSON.parse(String(init.body)),status:'DRAFT'}; return response(store); }
    if(url.endsWith('/seller/stores/me/submit')) { calls.push('submit'); store={...store!,status:'PENDING_REVIEW'}; return response(store); }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const {unmount}=mount('/seller/store',()=>{});
    await screen.findByLabelText('Store name');
    fireEvent.change(screen.getByLabelText('Store name'),{target:{value:'Mina Foods'}});
    fireEvent.change(screen.getByLabelText('Store slug'),{target:{value:'mina-foods'}});
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await screen.findByText('Changes saved successfully.');
    fireEvent.click(screen.getByRole('button',{name:'Submit for review'}));
    await screen.findByText('Changes saved successfully.');
    assert.deepEqual(calls,['save','submit']);
    unmount();
  } finally { cleanup(); globalThis.fetch=originalFetch; }
});

test('seller product form saves a draft using the category, price and inventory contract',async()=>{
  const submissions:Record<string,unknown>[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input); const common=commonFetch(url,['CUSTOMER','SELLER']); if(common) return common;
    if(url.endsWith('/seller/stores/me')) return response({id:3,name:'Mina Foods',slug:'mina-foods',description:null,contactPhone:null,location:null,status:'ACTIVE',rejectionReason:null});
    if(url.includes('/seller/products?')) return response([]);
    if(url.endsWith('/categories')) return response([{id:8,name:'Pantry',children:[]}]);
    if(url.endsWith('/seller/products') && init?.method==='POST') { const submitted=JSON.parse(String(init.body)); submissions.push(submitted); return response({id:44,...submitted,status:'DRAFT',category:{name:'Pantry'},images:[]},201); }
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const {unmount}=mount('/seller/products/new',()=>{});
    await screen.findByLabelText('Product name');
    fireEvent.change(screen.getByLabelText('Product name'),{target:{value:'Small batch chutney'}});
    fireEvent.change(screen.getByLabelText('Product slug'),{target:{value:'small-batch-chutney'}});
    fireEvent.change(screen.getByLabelText('Category'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('Price (INR)'),{target:{value:'125.50'}});
    fireEvent.change(screen.getByLabelText('Stock quantity'),{target:{value:'6'}});
    fireEvent.click(screen.getByRole('button',{name:'Save product draft'}));
    await waitFor(()=>assert.equal(submissions.length,1));
    assert.equal(submissions[0].name,'Small batch chutney');
    assert.equal(submissions[0].categoryId,8);
    assert.equal(submissions[0].price,'125.50');
    assert.equal(submissions[0].stockQuantity,6);
    unmount();
  } finally { cleanup(); globalThis.fetch=originalFetch; }
});

test('application status displays rejection guidance and offers resubmission',async()=>{
  globalThis.fetch=async input=>{
    const url=String(input); const common=commonFetch(url); if(common) return common;
    if(url.endsWith('/seller-applications/me')) return response([{id:21,businessName:'Mina Foods',businessType:'Packaged foods',contactPhone:'+919876543210',businessAddress:'12 Market Road, Pune',description:null,status:'REJECTED',submittedAt:'2026-11-20T00:00:00.000Z',applicantMessage:'Please provide a clearer business address.'}]);
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const {unmount}=mount('/seller/application',()=>{});
    assert.ok(await screen.findByRole('heading',{name:'Rejected'}));
    assert.ok(screen.getByText('Please provide a clearer business address.'));
    assert.ok(screen.getByRole('link',{name:'Submit a new application'}));
    unmount();
  } finally { cleanup(); globalThis.fetch=originalFetch; }
});

test('seller image manager uploads with progress and applies ordering and deletion APIs',async()=>{
  const calls:string[]=[];const existing=[{id:1,url:'https://images.invalid/one.webp',altText:null,position:0,status:'ACTIVE'},{id:2,url:'https://images.invalid/two.webp',altText:null,position:1,status:'ACTIVE'}];
  globalThis.fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/auth/refresh'))return response({accessToken:'image-token'});if(url.endsWith('/seller/products/44/images')&&init?.method!=='POST')return response(existing);if(url.endsWith('/images/order')){calls.push('order');return response([existing[1],existing[0]].map((x,index)=>({...x,position:index})));}if(url.endsWith('/images/2')&&init?.method==='DELETE'){calls.push('delete');return response([existing[0]]);}throw new Error(`Unexpected fetch ${url}`);};
  const oldXHR=globalThis.XMLHttpRequest;const oldForm=globalThis.FormData;const oldConfirm=window.confirm;
  class TestFormData{values:unknown[]=[];append(...args:unknown[]){this.values.push(args);}}
  class TestXHR{upload:{onprogress?:((event:any)=>void)|null}={};status=201;responseText='';onload?:()=>void;onerror?:()=>void;open(method:string,url:string){(this as any).method=method;(this as any).url=url;}setRequestHeader(){}send(){calls.push((this as any).method);this.upload.onprogress?.({lengthComputable:true,loaded:50,total:100});this.responseText=JSON.stringify({success:true,data:[...existing,{id:3,url:'https://images.invalid/three.webp',altText:'Product image',position:2,status:'ACTIVE'}]});setTimeout(()=>this.onload?.(),5);}}
  globalThis.FormData=TestFormData as never;globalThis.XMLHttpRequest=TestXHR as never;window.confirm=()=>true;
  try{const view=render(<ProductImageManager productId={44} productName="Mango pickle"/>);await screen.findByText('Main image');const file=new File(['image'], 'sample.png',{type:'image/png'});fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[file]}});await screen.findByText('Uploaded 1 image.');assert.ok(calls.includes('POST'));fireEvent.click(screen.getAllByRole('button',{name:'Make main'})[0]);await waitFor(()=>assert.ok(calls.includes('order')));fireEvent.click(screen.getAllByRole('button',{name:'Delete'})[0]);await waitFor(()=>assert.ok(calls.includes('delete')));view.unmount();}finally{cleanup();globalThis.fetch=originalFetch;globalThis.XMLHttpRequest=oldXHR;globalThis.FormData=oldForm;window.confirm=oldConfirm;}
});
