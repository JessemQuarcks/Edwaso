import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { clearSettingsCache } from '../src/lib/settings.js';

// One throwaway MongoDB per test file; collections are emptied between tests.
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.syncIndexes();
});

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  clearSettingsCache();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
