import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import Product, { type IProduct } from './models/Product.js';

// Seeds sample products only. Admin accounts are never seeded with a known password;
// use the admin CLI (src/scripts/admin.ts) instead.

type SeedProduct = Pick<IProduct, 'name' | 'sku' | 'costPrice' | 'featured' | 'category' | 'price' | 'stock' | 'description' | 'image'>;

const products: SeedProduct[] = [
  { name: 'Classic White Sneakers', sku: 'SHOE-WHT-01', costPrice: 3500, featured: true, category: 'shoes', price: 7999, stock: 25, description: 'Clean everyday leather sneakers.', image: 'https://picsum.photos/seed/sneakers/600/600' },
  { name: 'Canvas Backpack', sku: 'BAG-CNV-01', costPrice: 2200, featured: false, category: 'bags', price: 5499, stock: 40, description: 'Water-resistant 20L backpack with laptop sleeve.', image: 'https://picsum.photos/seed/backpack/600/600' },
  { name: 'Wireless Headphones', sku: 'AUD-WL-01', costPrice: 6400, featured: true, category: 'electronics', price: 12999, stock: 15, description: 'Over-ear Bluetooth headphones, 30 hour battery.', image: 'https://picsum.photos/seed/headphones/600/600' },
  { name: 'Stainless Water Bottle', sku: 'HOM-BTL-01', costPrice: 900, featured: false, category: 'home', price: 2499, stock: 100, description: 'Insulated 750ml bottle keeps drinks cold for 24h.', image: 'https://picsum.photos/seed/bottle/600/600' },
  { name: 'Cotton Hoodie', sku: 'CLO-HOOD-01', costPrice: 1900, featured: false, category: 'clothing', price: 4999, stock: 30, description: 'Heavyweight fleece-lined pullover hoodie.', image: 'https://picsum.photos/seed/hoodie/600/600' },
  { name: 'Mechanical Keyboard', sku: 'ELE-KB-01', costPrice: 4100, featured: false, category: 'electronics', price: 8999, stock: 20, description: 'Hot-swappable 75% keyboard with tactile switches.', image: 'https://picsum.photos/seed/keyboard/600/600' },
];

await connectDB();

await Product.deleteMany({});
await Product.insertMany(products);
console.log(`Seeded ${products.length} products`);
console.log('Create an admin account with: npm run admin -- create --email you@example.com');

await mongoose.disconnect();
