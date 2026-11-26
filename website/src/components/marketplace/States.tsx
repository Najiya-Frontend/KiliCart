'use client';

import Link from 'next/link';

export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return <div className="empty-state"><div className="empty-art" aria-hidden="true"><span /><i /><b /></div><h2>{title}</h2><p>{description}</p>{href && action && <Link className="button button--outline" href={href}>{action}</Link>}</div>;
}

export function ErrorState({ title = 'We couldn’t load this just now', description = 'Please try again in a moment.' }: { title?: string; description?: string }) {
  return <div className="notice-state" role="alert"><span className="notice-icon" aria-hidden="true">!</span><div><h2>{title}</h2><p>{description}</p></div><button type="button" className="button button--outline" onClick={() => window.location.reload()}>Try again</button></div>;
}

export function NotFoundState({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} href="/categories" action="Explore categories" />;
}

export function LoadingSkeleton({ count = 4 }: { count?: number }) {
  return <div className="skeleton-grid" aria-label="Loading catalogue" aria-busy="true">{Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index}><span /><i /><b /></div>)}</div>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb">{items.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <i aria-hidden="true">/</i>}{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>;
}
