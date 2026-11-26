import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

function developmentDatabase() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Catalogue fixtures require NODE_ENV=development');
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('A local development DATABASE_URL is required'); }
  if (url.protocol !== 'mysql:' || decodeURIComponent(url.pathname) !== '/kilicart_dev' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw new Error('Catalogue fixtures are restricted to local MySQL database kilicart_dev');
  }
  return url;
}

const categoryNames = [
  ['dev-fixture-groceries-food', 'Groceries and Food'],
  ['dev-fixture-homemade-products', 'Homemade Products'],
  ['dev-fixture-pickles-preserves', 'Pickles and Preserves'],
  ['dev-fixture-masala-spices', 'Masala and Spices'],
  ['dev-fixture-bakery', 'Bakery'],
  ['dev-fixture-beauty-personal-care', 'Beauty and Personal Care'],
  ['dev-fixture-clothing-fashion', 'Clothing and Fashion'],
  ['dev-fixture-handicrafts', 'Handicrafts'],
  ['dev-fixture-home-kitchen', 'Home and Kitchen'],
  ['dev-fixture-other', 'Other'],
];
const productSlugs = ['dev-fixture-sample-pickle', 'dev-fixture-sample-masala'];

async function main() {
  const url = developmentDatabase();
  if (process.argv.length > 2 && !(process.argv.length === 3 && process.argv[2] === '--reset')) throw new Error('Only the optional --reset argument is supported');
  const client = new PrismaClient({ adapter: new PrismaMariaDb(url.toString()) });
  try {
    const database = await client.$queryRaw`SELECT DATABASE() AS name`;
    if (database[0]?.name !== 'kilicart_dev') throw new Error('Fixture database verification failed');

    if (process.argv.includes('--reset')) {
      await client.product.deleteMany({ where: { slug: { in: productSlugs }, status: 'DRAFT', stockQuantity: 0, description: 'Non-public development fixture.' } });
      for (const [slug] of [...categoryNames].reverse()) {
        const name = categoryNames.find(row => row[0] === slug)[1];
        await client.category.deleteMany({ where: { slug, name, products: { none: {} }, children: { none: {} } } });
      }
      console.log('Removed only KiliCart development catalogue fixtures.');
      return;
    }

    const categories = new Map();
    for (const [slug, name] of categoryNames) {
      const row = await client.category.upsert({ where: { slug }, create: { slug, name, status: 'ACTIVE' }, update: {} });
      categories.set(slug, row);
    }

    const storeId = process.env.KILICART_DEV_FIXTURE_STORE_ID;
    if (!storeId) {
      console.log(`Seeded ${categories.size} development categories. Set KILICART_DEV_FIXTURE_STORE_ID to an existing development store to add draft sample products.`);
      return;
    }
    if (!/^\d+$/.test(storeId) || !Number.isSafeInteger(Number(storeId)) || Number(storeId) <= 0) throw new Error('KILICART_DEV_FIXTURE_STORE_ID must be a positive integer');
    const store = await client.store.findUnique({ where: { id: Number(storeId) }, select: { id: true, status: true, sellerAccount: { select: { status: true } } } });
    if (!store || store.status !== 'DRAFT' || store.sellerAccount.status !== 'ACTIVE') throw new Error('Fixture products require an existing DRAFT store owned by an ACTIVE seller account');

    const parent = categories.get('dev-fixture-groceries-food');
    const pickleCategory = categories.get('dev-fixture-pickles-preserves');
    const masalaCategory = categories.get('dev-fixture-masala-spices');
    if (!pickleCategory.parentId) await client.category.update({ where: { id: pickleCategory.id }, data: { parentId: parent.id } });
    if (!masalaCategory.parentId) await client.category.update({ where: { id: masalaCategory.id }, data: { parentId: parent.id } });
    for (const fixture of [
      { slug: productSlugs[0], name: 'Sample Pickle (Development)', categoryId: pickleCategory.id, price: '125.00' },
      { slug: productSlugs[1], name: 'Sample Masala (Development)', categoryId: masalaCategory.id, price: '85.00' },
    ]) {
      await client.product.upsert({
        where: { slug: fixture.slug },
        create: { ...fixture, storeId: store.id, status: 'DRAFT', stockQuantity: 0, description: 'Non-public development fixture.' },
        update: {},
      });
    }
    console.log(`Seeded ${categories.size} development categories and ${productSlugs.length} DRAFT sample products for store ${store.id}.`);
  } finally {
    await client.$disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
