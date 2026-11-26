'use client';

import { useState } from 'react';
import { safeImageUrl } from '../../lib/catalogue-api';

type GalleryImage={url:string;altText:string|null;position:number};
export default function ProductGallery({images,name}:{images:GalleryImage[];name:string}){
  const [failed,setFailed]=useState<number[]>([]);
  const visible=images.map(image=>({...image,safeUrl:safeImageUrl(image.url)})).filter(image=>image.safeUrl&&!failed.includes(image.position));
  return <div className="product-gallery">{visible.length?visible.map(image=><img key={`${image.position}-${image.url}`} src={image.safeUrl!} alt={image.altText||name} onError={()=>setFailed(old=>old.includes(image.position)?old:[...old,image.position])}/>):<div className="product-gallery-fallback" aria-label="No product image available"><span>✳</span></div>}</div>;
}
