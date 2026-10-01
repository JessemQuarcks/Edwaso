import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import Product, { type IProduct } from './models/Product.js';

// Seeds sample products only. Admin accounts are never seeded with a known password;
// use the admin CLI (src/scripts/admin.ts) instead.

type SeedProduct = Pick<IProduct, 'name' | 'sku' | 'costPrice' | 'featured' | 'category' | 'price' | 'stock' | 'description' | 'image'>;

const products: SeedProduct[] = [
  { name: 'Classic White Sneakers', sku: 'SHOE-WHT-01', costPrice: 3500, featured: true, category: 'shoes', price: 7999, stock: 25, description: 'Clean everyday leather sneakers.', image: 'https://i.pinimg.com/736x/64/7c/ad/647cad16ede10f3ac32e84c8f14831e9.jpg' },
  { name: 'Canvas Backpack', sku: 'BAG-CNV-01', costPrice: 2200, featured: false, category: 'bags', price: 5499, stock: 40, description: 'Water-resistant 20L backpack with laptop sleeve.', image: 'https://i.pinimg.com/736x/82/24/ed/8224ed74729a0e2640c1062f54e9a9c2.jpg' },
  { name: 'Wireless Headphones', sku: 'AUD-WL-01', costPrice: 6400, featured: true, category: 'electronics', price: 12999, stock: 15, description: 'Over-ear Bluetooth headphones, 30 hour battery.', image: 'https://i.pinimg.com/1200x/65/fa/6f/65fa6fcda7c545f0ad3dc16f009fc3d8.jpg' },
  { name: 'Stainless Water Bottle', sku: 'HOM-BTL-01', costPrice: 900, featured: false, category: 'home', price: 2499, stock: 100, description: 'Insulated 750ml bottle keeps drinks cold for 24h.', image: 'https://i.pinimg.com/1200x/33/ae/bc/33aebcaf12e9a33aa9f8da1c934bd8fa.jpg' },
  { name: 'Cotton Hoodie', sku: 'CLO-HOOD-01', costPrice: 1900, featured: false, category: 'clothing', price: 4999, stock: 30, description: 'Heavyweight fleece-lined pullover hoodie.', image: 'https://i.pinimg.com/736x/89/da/ac/89daacaa3fa876b22dfadcf8df65a523.jpg' },
  { name: 'Mechanical Keyboard', sku: 'ELE-KB-01', costPrice: 4100, featured: false, category: 'electronics', price: 8999, stock: 20, description: 'Hot-swappable 75% keyboard with tactile switches.', image: 'https://i.pinimg.com/736x/bc/ab/3f/bcab3fa06ecf97a4457de5c7bf62f6ba.jpg' },
];

await connectDB();            

await Product.deleteMany({});
await Product.insertMany(products);
console.log(`Seeded ${products.length} products`);
console.log('Create an admin account with: npm run admin -- create --email you@example.com');

await mongoose.disconnect();
