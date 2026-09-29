import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Product, { type IProduct } from './models/Product.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';

type SeedProduct = Pick<IProduct, 'name' | 'category' | 'price' | 'stock' | 'description' | 'image'>;

const products: SeedProduct[] = [
  { name: 'Classic White Sneakers', category: 'shoes', price: 7999, stock: 25, description: 'Clean everyday leather sneakers.', image: 'https://picsum.photos/seed/sneakers/600/600' },
  { name: 'Canvas Backpack', category: 'bags', price: 5499, stock: 40, description: 'Water-resistant 20L backpack with laptop sleeve.', image: 'https://picsum.photos/seed/backpack/600/600' },
  { name: 'Wireless Headphones', category: 'electronics', price: 12999, stock: 15, description: 'Over-ear Bluetooth headphones, 30 hour battery.', image: 'https://picsum.photos/seed/headphones/600/600' },
  { name: 'Stainless Water Bottle', category: 'home', price: 2499, stock: 100, description: 'Insulated 750ml bottle keeps drinks cold for 24h.', image: 'https://picsum.photos/seed/bottle/600/600' },
  { name: 'Cotton Hoodie', category: 'clothing', price: 4999, stock: 30, description: 'Heavyweight fleece-lined pullover hoodie.', image: 'https://picsum.photos/seed/hoodie/600/600' },
  { name: 'Mechanical Keyboard', category: 'electronics', price: 8999, stock: 20, description: 'Hot-swappable 75% keyboard with tactile switches.', image: 'https://picsum.photos/seed/keyboard/600/600' },
];

await connectDB();

await Product.deleteMany({});
await Product.insertMany(products);
console.log(`Seeded ${products.length} products`);

if (!(await User.exists({ email: ADMIN_EMAIL }))) {
  await User.create({
    name: 'Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    isAdmin: true,
  });
  console.log(`Created admin user ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

await mongoose.disconnect();
