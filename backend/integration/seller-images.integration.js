import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import { testDatabaseUrl } from './guard.js';

const url=testDatabaseUrl();if(process.env.DATABASE_URL!==url)throw new Error('Integration client is not configured for kilicart_test');
const {prisma}=await import('../src/config/prisma.js');
const {register,login}=await import('../src/services/auth.service.js');
const {roleService}=await import('../src/services/role.service.js');
const {createProductImageService}=await import('../src/services/product-image.service.js');
const {createSellerProductImageRouter}=await import('../src/routes/seller-product-images.routes.js');
const {default:catalogueRoutes}=await import('../src/routes/catalogue.routes.js');
const prefix=`product-images-${crypto.randomUUID()}`;const password='Image Integration passphrase 123';
let server,base,category,owner,other,ownerAuth,otherAuth,store,otherStore,product,storageFails=false;const assets=new Map();

async function seller(label){
 const email=`${prefix}-${label}@example.invalid`;await register({fullName:`Image ${label}`,email,password});const user=await prisma.user.findUniqueOrThrow({where:{email}});await roleService.assignRole(user.id,'SELLER');
 const app=await prisma.sellerApplication.create({data:{userId:user.id,businessName:`Image ${label}`,businessType:'Local goods',contactPhone:'+919876543210',businessAddress:'12 Image Integration Road',status:'APPROVED',decidedAt:new Date()}});
 const account=await prisma.sellerAccount.create({data:{userId:user.id,applicationId:app.id,status:'ACTIVE'}});const token=(await login(email,password)).accessToken;return{user,account,auth:{authorization:`Bearer ${token}`}};
}
const formFor=buffer=>{const form=new FormData();form.append('image',new Blob([buffer],{type:'image/png'}),'client-name-is-not-trusted.txt');form.append('altText','Test product');return form;};
const png=()=>sharp({create:{width:90,height:80,channels:3,background:'#528151'}}).png().toBuffer();
const json=async response=>response.json();

before(async()=>{
 assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name,'kilicart_test');
 for(const code of ['CUSTOMER','SELLER'])if(!await prisma.role.findUnique({where:{code}}))await prisma.role.create({data:{code,name:code}});
 owner=await seller('owner');other=await seller('other');ownerAuth=owner.auth;otherAuth=other.auth;
 store=await prisma.store.create({data:{sellerAccountId:owner.account.id,name:'Image Store',slug:`${prefix}-store`,status:'ACTIVE'}});
 otherStore=await prisma.store.create({data:{sellerAccountId:other.account.id,name:'Other Image Store',slug:`${prefix}-other-store`,status:'ACTIVE'}});
 category=await prisma.category.create({data:{name:'Image Category',slug:`${prefix}-category`,status:'ACTIVE'}});
 product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,name:'Image Product',slug:`${prefix}-product`,price:'10.00',status:'DRAFT'}});
 const service=createProductImageService({db:prisma,storage:{upload:async(buffer,{productId,assetId})=>{if(storageFails)throw new Error('provider offline');const storedId=assetId||`${prefix}/${productId}/${crypto.randomUUID()}`;assets.set(storedId,buffer);return{url:`https://res.cloudinary.com/test/image/upload/${storedId}.webp`,assetId:storedId,format:'webp',bytes:buffer.length,width:90,height:80};},delete:async id=>{if(storageFails)throw new Error('provider offline');assets.delete(id);}}});
 const api=express();api.use(express.json({limit:'1mb'}));api.use('/api/v1',createSellerProductImageRouter(service));api.use('/api/v1',catalogueRoutes);
 server=api.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name,'kilicart_test');
 const userIds=[owner?.user.id,other?.user.id].filter(Boolean);const accountIds=[owner?.account.id,other?.account.id].filter(Boolean);
 if(product)await prisma.catalogueReviewAudit.deleteMany({where:{productId:product.id}});
 if(product)await prisma.product.deleteMany({where:{id:product.id}});
 if(store||otherStore)await prisma.store.deleteMany({where:{id:{in:[store?.id,otherStore?.id].filter(Boolean)}}});
 if(category)await prisma.category.deleteMany({where:{id:category.id}});
 if(accountIds.length)await prisma.sellerAccount.deleteMany({where:{id:{in:accountIds}}});
 if(userIds.length){const applications=await prisma.sellerApplication.findMany({where:{userId:{in:userIds}},select:{id:true}});await prisma.sellerApplication.deleteMany({where:{id:{in:applications.map(row=>row.id)}}});await prisma.userRole.deleteMany({where:{userId:{in:userIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
 await prisma.$disconnect();
});

test('authenticated sellers can safely manage owned product images and publish only approved catalogue content',async()=>{
 const unauth=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST'});assert.equal(unauth.status,401);
 const success=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(await png())});assert.equal(success.status,201,await success.clone().text());let data=(await json(success)).data;const first=data[0];assert.equal(first.position,0);assert.equal(first.isMain,true);
 const invalid=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(Buffer.from('not an image'))});assert.equal(invalid.status,400);
 const oversized=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(Buffer.alloc(10*1024*1024+1))});assert.equal(oversized.status,413);
 const foreign=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:otherAuth,body:formFor(await png())});assert.equal(foreign.status,404);
 const secondResponse=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(await png())});data=(await json(secondResponse)).data;const second=data.find(image=>image.id!==first.id);assert.ok(second);
 const reordered=await fetch(`${base}/seller/products/${product.id}/images/order`,{method:'PATCH',headers:{...ownerAuth,'content-type':'application/json'},body:JSON.stringify({imageIds:[second.id,first.id]})});assert.equal(reordered.status,200);data=(await json(reordered)).data;assert.equal(data[0].id,second.id);assert.equal(data[0].isMain,true);
 await prisma.product.update({where:{id:product.id},data:{status:'PUBLISHED'}});
 let publicProduct=(await json(await fetch(`${base}/products/${product.slug}`))).data;assert.equal(publicProduct.images.length,2);assert.equal(publicProduct.images[0].id,second.id);assert.equal(publicProduct.images[0].providerAssetId,undefined);
 storageFails=true;const denied=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(await png())});assert.equal(denied.status,502);storageFails=false;
 await prisma.sellerAccount.update({where:{id:owner.account.id},data:{status:'SUSPENDED'}});const suspended=await fetch(`${base}/seller/products/${product.id}/images`,{method:'POST',headers:ownerAuth,body:formFor(await png())});assert.equal(suspended.status,403);await prisma.sellerAccount.update({where:{id:owner.account.id},data:{status:'ACTIVE'}});
 const assetsBeforeDelete=assets.size;const deleted=await fetch(`${base}/seller/products/${product.id}/images/${second.id}`,{method:'DELETE',headers:ownerAuth});assert.equal(deleted.status,200);assert.equal((await json(deleted)).data[0].id,first.id);assert.equal((await prisma.product.findUnique({where:{id:product.id}})).status,'DRAFT');assert.equal(assets.size,assetsBeforeDelete-1);
});
